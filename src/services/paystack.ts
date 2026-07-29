import axios, { AxiosInstance } from 'axios';

/**
 * Paystack Service - Production Implementation
 * Handles transaction initialization and verification.
 */

export interface PaystackInitializeOptions {
  email: string;
  amount: number; // in minor units (e.g., Kobo for NGN, Cents for USD, or units for KES if supported)
  reference: string;
  callbackUrl?: string;
  metadata?: any;
}

export class PaystackService {
  private client: AxiosInstance;

  constructor(secretKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretKey}`,
      },
      timeout: 15000,
    });
  }

  /**
   * Initialize a transaction
   * @param options 
   * @returns authorization_url and access_code
   */
  async initializeTransaction(options: PaystackInitializeOptions) {
    const payload = {
      email: options.email,
      amount: Math.round(options.amount * 100), // Paystack expects amount in kobo/cents
      reference: options.reference,
      callback_url: options.callbackUrl || process.env.CALLBACK_URL,
      metadata: options.metadata
    };

    try {
      console.log(`[Paystack-Service] Initializing: ${options.reference}`);
      const { data } = await this.client.post('/transaction/initialize', payload);
      return data.data; // data.data contains authorization_url, access_code, reference
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[Paystack-Service] Initialization Failed:', errorData || error.message);
      throw new Error(errorData?.message || 'Paystack Initialization Error');
    }
  }

  /**
   * Direct Charge - Mobile Money (STK Push style)
   * @param options 
   */
  async chargeMobileMoney(options: { email: string, amount: number, phone: string, reference: string, provider?: string }) {
    const payload = {
      email: options.email,
      amount: Math.round(options.amount * 100), // Units to sub-units (e.g. KES cents)
      reference: options.reference,
      currency: 'KES',
      mobile_money: {
        phone: options.phone, // We expect 254... or +254...
        provider: options.provider || 'mpesa'
      }
    };

    try {
      console.log(`[Paystack-Service] Charge Payload: ${JSON.stringify({ ...payload, email: '***' })}`);
      const { data } = await this.client.post('/charge', payload);
      return data.data; 
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[Paystack-Service] Charge Failed:', JSON.stringify(errorData) || error.message);
      throw new Error(errorData?.message || 'Paystack Charge Error');
    }
  }

  /**
   * Verify a transaction status
   * @param reference 
   */
  async verifyTransaction(reference: string) {
    try {
      console.log(`[Paystack-Service] Verifying: ${reference}`);
      const { data } = await this.client.get(`/transaction/verify/${reference}`);
      return data.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[Paystack-Service] Verification Failed:', errorData || error.message);
      throw new Error(errorData?.message || 'Paystack Verification Error');
    }
  }
}

// Lazy initialization helper
let paystackInstance: PaystackService | null = null;

export const getPaystackClient = () => {
  if (!paystackInstance) {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      console.warn('[Paystack-Service] PAYSTACK_SECRET_KEY is not set. Using placeholder.');
    }
    paystackInstance = new PaystackService(key || 'sk_test_placeholder');
  }
  return paystackInstance;
};

// Exporting a getter instead of a static instance for better resilience
export const paystack = {
  initializeTransaction: (...args: any[]) => getPaystackClient().initializeTransaction(args[0]),
  chargeMobileMoney: (...args: any[]) => getPaystackClient().chargeMobileMoney(args[0]),
  verifyTransaction: (...args: any[]) => getPaystackClient().verifyTransaction(args[0]),
};
