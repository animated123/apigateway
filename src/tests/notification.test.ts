import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import { SMSController } from '../controllers/smsController.ts';
import { query } from '../lib/postgres.ts';

// Mock dependencies
vi.mock('axios', () => {
  const mockAxios = {
    post: vi.fn(),
    get: vi.fn(),
    create: vi.fn()
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return {
    default: mockAxios,
    ...mockAxios
  };
});

vi.mock('../lib/postgres.ts', () => ({
  query: vi.fn()
}));

const app = express();
app.use(express.json());
app.post('/api/notifications/send-otp', SMSController.sendOTP);
app.post('/api/notifications/verify-otp', SMSController.verifyOTP);

describe('SMSController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends OTP successfully', async () => {
    const mockAxios = axios.create();
    vi.mocked(mockAxios.post).mockResolvedValue({ data: { success: true } });
    
    // Mock database response
    vi.mocked(query).mockResolvedValue({ rows: [] });

    const payload = { phoneNumber: '254712345678' };
    const res = await request(app).post('/api/notifications/send-otp').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('OTP sent successfully');
    expect(query).toHaveBeenCalled();
  });

  it('verifies OTP successfully', async () => {
    // Mock database response for select
    vi.mocked(query).mockImplementation(async (sql: string, params?: any[]) => {
      const lower = sql.toLowerCase();
      if (lower.includes('select * from otp_codes')) {
        return { rows: [{ id: 'otp-id', phone_number: '254712345678', code: '888888' }] };
      }
      return { rows: [] };
    });

    const payload = { phoneNumber: '254712345678', code: '888888' };
    const res = await request(app).post('/api/notifications/verify-otp').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(query).toHaveBeenCalled();
  });
});
