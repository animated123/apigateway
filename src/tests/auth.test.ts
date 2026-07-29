import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthController } from '../controllers/authController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { query } from '../lib/postgres.ts';

// Mock postgres query
vi.mock('../lib/postgres', () => ({
  query: vi.fn(),
}));

const app = express();
app.use(express.json());

// Set up virtual env variable
process.env.JWT_SECRET = 'supersecretkey12345';

// Auth Routes
const authRouter = express.Router();
authRouter.post('/register', AuthController.register);
authRouter.post('/login', AuthController.login);
authRouter.get('/me', authenticateToken, AuthController.getMe);
app.use('/api/auth', authRouter);

// Secure dummy route for verifying middleware manually
app.get('/api/secure-endpoint', authenticateToken, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

describe('Token Authentication Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JWT Middleware Validation', () => {
    it('should block requests with 401 if Authorization header is missing', async () => {
      const res = await request(app).get('/api/secure-endpoint');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Token is missing');
    });

    it('should block requests with 401 if token is expired or tampered with', async () => {
      const res = await request(app)
        .get('/api/secure-endpoint')
        .set('Authorization', 'Bearer invalidtokenstring');
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Token is invalid');
    });

    it('should allow request and attach user context if JWT is format-valid and verified', async () => {
      const payload = { userId: 'USR-TEST01', email: 'test@example.com', role: 'admin' };
      const secret = process.env.JWT_SECRET || 'supersecretkey12345';
      const token = jwt.sign(payload, secret, { expiresIn: '1h' });

      const res = await request(app)
        .get('/api/secure-endpoint')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toEqual(payload);
    });
  });

  describe('User Registration Endpoint (bcryptjs & profiles integrity)', () => {
    it('should fail if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'Password123!', name: 'No Email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Email and password are required');
    });

    it('should succeed with valid input, hashes passwords, and returns signed JWT and profile', async () => {
      const samplePayload = {
        email: 'newuser@example.com',
        password: 'Password123!',
        name: 'New User Bobby',
        role: 'user'
      };

      // Mock email uniqueness check -> returns empty (no duplicate)
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      
      // Mock profile insert sql
      vi.mocked(query).mockResolvedValueOnce({
        rows: [{
          id: 'USR-RANDOMID',
          name: samplePayload.name,
          email: samplePayload.email,
          role: 'user',
          balance: '5000.00',
          currency: 'KES',
          created_at: new Date().toISOString()
        }],
        rowCount: 1
      } as any);

      const res = await request(app)
        .post('/api/auth/register')
        .send(samplePayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.profile.email).toBe(samplePayload.email);
      expect(res.body.profile.balance).toBe(5000.00);

      // Verify bcrypt utility was leveraged on the submitted password string
      const passwordToCheck = samplePayload.password;
      // First query argument of second query call should insert values including hashes
      const insertCallArgs = vi.mocked(query).mock.calls[1][1];
      const insertedHash = insertCallArgs?.[3]; // password_hash is fourth parameter
      
      expect(insertedHash).toBeDefined();
      expect(insertedHash).not.toBe(passwordToCheck); 
      expect(await bcrypt.compare(passwordToCheck, insertedHash)).toBe(true);
    });
  });

  describe('User Login Endpoint (bcryptjs comparison & token generation)', () => {
    it('should reject login if user email does not exist', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'fake@example.com', password: 'word' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid email or password');
    });

    it('should authenticate user and return profile on matching bcrypt hashed passwords', async () => {
      const testEmail = 'user@example.com';
      const testPass = 'SecretPassword99';
      const hash = await bcrypt.hash(testPass, 10);

      // Mock query returns matching profile row
      vi.mocked(query).mockResolvedValueOnce({
        rows: [{
          id: 'USR-SECURE01',
          name: 'Secure Joe',
          email: testEmail,
          password_hash: hash,
          role: 'user',
          balance: '1200.00',
          currency: 'KES',
          created_at: new Date().toISOString()
        }],
        rowCount: 1
      } as any);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: testPass });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.profile.name).toBe('Secure Joe');
      expect(res.body.profile.balance).toBe(1200.00);

      // Verify token contains matching email and id
      const decodedPayload = jwt.verify(res.body.token, process.env.JWT_SECRET || '') as any;
      expect(decodedPayload.email).toBe(testEmail);
      expect(decodedPayload.userId).toBe('USR-SECURE01');
    });
  });
});
