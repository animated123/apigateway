import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import { PaymentController } from '../controllers/paymentController.ts';
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
app.post('/api/payments/stk-push', PaymentController.stkPush);
app.post('/api/payments/callback', PaymentController.callback);

describe('PaymentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully initiates STK push', async () => {
    const mockAxios = axios.create();
    vi.mocked(mockAxios.post).mockResolvedValue({ data: { Success: true, Message: 'STK Push success' } });
    
    // Mock database responses
    vi.mocked(query).mockImplementation(async (sql: string, params?: any[]) => {
      const lower = sql.toLowerCase();
      if (lower.includes('select balance, currency from profiles')) {
        return { rows: [{ balance: 5000, currency: 'KES' }] };
      }
      if (lower.includes('insert into transactions')) {
        return { rows: [{ id: 1, user_id: 'user-123', amount: 1000, reference: 'REF-123' }] };
      }
      return { rows: [] };
    });

    const payload = {
      userId: 'user-123',
      amount: 1000,
      phoneNumber: '254712345678',
      description: 'Test Payment'
    };

    const res = await request(app).post('/api/payments/stk-push').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('STK push initiated');
    expect(query).toHaveBeenCalled();
  });

  it('handles PayHero callback successfully', async () => {
    // Mock database responses
    vi.mocked(query).mockImplementation(async (sql: string, params?: any[]) => {
      const lower = sql.toLowerCase();
      if (lower.includes('select status, is_closed, user_id, amount from transactions')) {
        return { rows: [{ status: 'PENDING', is_closed: false, user_id: 'user-123', amount: 1000 }] };
      }
      return { rows: [] };
    });

    const callbackPayload = {
      Success: true,
      ExternalReference: 'REF-123',
      ResponseMessage: 'Success'
    };

    const res = await request(app).post('/api/payments/callback').send(callbackPayload);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Callback processed successfully');
    expect(query).toHaveBeenCalled();
  });
});
