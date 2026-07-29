import axios, { AxiosInstance } from 'axios';
import https from 'https';

/**
 * PayHero SDK - Production Implementation
 * Hardcoded to specified PayHero endpoints and authentication.
 */

// Global persistent agent to avoid MaxListenersExceededWarning and improve performance
const persistentAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 60000
});

export interface PayHeroConfig {
  baseUrl: string;
  authToken: string;
  channelId: number;
}

export interface STKPushOptions {
  phone: string;
  amount: number;
  reference: string;
  description?: string;
  callbackUrl?: string;
}

export interface B2COptions {
  amount: number;
  phone_number: string;
  channel_id: number;
  external_reference: string;
  callback_url?: string;
}

export class PayHeroService {
  private client: AxiosInstance;
  private channelId: number;

  constructor(config: PayHeroConfig) {
    this.channelId = config.channelId;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.authToken,
      },
      timeout: 15000,
      httpsAgent: persistentAgent, // Use the persistent agent
    });
  }

  /**
   * Normalize phone number to 254XXXXXXXXX format
   */
  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\+/g, '').replace(/^0/, '254');
    if (!cleaned.startsWith('254') && cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
    return cleaned;
  }

  /**
   * Initiate M-Pesa STK Push
   * ENDPOINT: POST https://backend.payhero.co.ke/api/v2/payments
   */
  async initiateSTKPush(options: STKPushOptions) {
    const callbackUrl = options.callbackUrl || process.env.CALLBACK_URL;
    
    if (!callbackUrl) {
      console.warn('[PayHero-Service] No callbackUrl provided for STK Push. PayHero events will not be received.');
    }

    const payload = {
      amount: Math.round(options.amount),
      phone_number: this.formatPhone(options.phone),
      channel_id: this.channelId,
      provider: "m-pesa",
      external_reference: options.reference,
      callback_url: callbackUrl,
    };

    try {
      console.log(`[PayHero-Service] DISPATCH Ref: ${payload.external_reference} | Callback: ${callbackUrl}`);
      const { data } = await this.client.post('/payments', payload);
      return data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || errorData?.error_message || error.message;
      console.error(`[PayHero-Service] Channel ${this.channelId} Failed:`, errorData || error.message);
      
      throw new Error(`[Channel ${this.channelId}] ${errorMessage}`);
    }
  }

  /**
   * 2. Query Transaction Status
   * ENDPOINT: GET https://backend.payhero.co.ke/api/v2/transaction-status
   */
  async queryStatus(reference: string, checkoutRequestId?: string) {
    const tryQuery = async (params: any, label: string) => {
      console.log(`[PayHero-Service] Query Attempt (${label}):`, JSON.stringify(params));
      const { data } = await this.client.get('/transaction-status', { 
        params: { ...params, channel_id: this.channelId } 
      });
      return data;
    };

    try {
      // Attempt 1: Standard reference (as per user notes)
      return await tryQuery({ reference }, 'reference');
    } catch (error: any) {
      if (error.response?.data?.error_code === 'NOT_FOUND') {
        try {
          // Attempt 2: external_reference (matching the field name in push)
          return await tryQuery({ external_reference: reference }, 'external_reference');
        } catch (retryError: any) {
          if (retryError.response?.data?.error_code === 'NOT_FOUND' && checkoutRequestId) {
            try {
              // Attempt 3: Using CheckoutRequestID as the reference (common for M-Pesa gateways)
              return await tryQuery({ reference: checkoutRequestId }, 'checkout_request_id');
            } catch (finalError: any) {
              console.error('[PayHero-Service] All Query Attempts Failed.');
              throw finalError;
            }
          }
          throw retryError;
        }
      }
      throw error;
    }
  }

  /**
   * 3. Withdrawals (B2C)
   * ENDPOINT: POST https://backend.payhero.co.ke/api/v2/payments/b2c
   */
  async withdrawB2C(options: B2COptions) {
    const payload = {
      ...options,
      phone_number: this.formatPhone(options.phone_number),
      callback_url: options.callback_url || process.env.CALLBACK_URL,
    };

    try {
      console.log(`[PayHero-Service] Initiating B2C to /payments/b2c: ${payload.external_reference}`);
      const { data } = await this.client.post('/payments/b2c', payload);
      return data;
    } catch (error: any) {
      const errorData = error.response?.data;
      console.error('[PayHero-Service] B2C Withdrawal Failed:', errorData || error.message);
      throw new Error(errorData?.message || errorData?.error_message || 'PayHero B2C API Error');
    }
  }
}

// Singleton instance with verified configurations
export const payHero = new PayHeroService({
  baseUrl: 'https://backend.payhero.co.ke/api/v2',
  authToken: "Basic NmV4OXlhSVVHUDhkQkFJV3dIU2Y6R0JRU2R2a0tOc1NRZExua3RDMzRxbVFWY0xVblgwZTFVZlZkMWs5WA==",
  channelId: 6789,
});
