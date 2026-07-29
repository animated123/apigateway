import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PaymentController } from '../controllers/paymentController.ts';
import { SMSController } from '../controllers/smsController.ts';

// Create a test app instance
const app = express();
app.use(express.json());

const apiRouter = express.Router();
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
apiRouter.post('/payments/stk-push', PaymentController.stkPush);
apiRouter.post('/notifications/send-otp', SMSController.sendOTP);

app.use('/api', apiRouter);

describe('API Health and Basic Connectivity', () => {
  it('GET /api/health should return 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('POST /api/payments/stk-push without body should return 400', async () => {
    const res = await request(app).post('/api/payments/stk-push').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
