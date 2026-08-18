import axios from 'axios';

export interface SMSOptions {
  senderId?: string;
  provider?: string;
}

export class SMSService {
  static async sendSMS(phoneNumber: string, message: string, options?: SMSOptions) {
    const provider = options?.provider || process.env.SMS_PROVIDER || 'talksasa';

    if (provider.toLowerCase() === 'talksasa' || provider.toLowerCase() === 'textsasa') {
      return this.sendTalkSasa(phoneNumber, message, options?.senderId);
    } else if (provider.toLowerCase() === 'africastalking') {
      return this.sendAfricasTalking(phoneNumber, message, options?.senderId);
    } else if (provider.toLowerCase() === 'termii') {
      return this.sendTermii(phoneNumber, message, options?.senderId);
    } else {
      // Try TalkSasa first, fallback to Africa's Talking
      try {
        return await this.sendTalkSasa(phoneNumber, message, options?.senderId);
      } catch (err) {
        console.warn('[SMSService] Primary provider failed, trying secondary fallback...');
        return this.sendAfricasTalking(phoneNumber, message, options?.senderId);
      }
    }
  }

  private static formatKenyanPhone(phoneNumber: string): string {
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 9 && (cleanPhone.startsWith('7') || cleanPhone.startsWith('1'))) {
      cleanPhone = '254' + cleanPhone;
    }
    return cleanPhone;
  }

  private static async sendTalkSasa(phoneNumber: string, message: string, customSenderId?: string) {
    const TALKSASA_API = process.env.TALKSASA_API_URL || "https://bulksms.talksasa.com/api/v3/sms/send";
    const cleanPhone = this.formatKenyanPhone(phoneNumber);
    const token = process.env.TALKSASA_API_TOKEN || process.env.TEXTSASA_API_TOKEN;

    if (!token) {
      console.warn('[SMSService] TALKSASA_API_TOKEN is not configured. Running in simulated delivery mode.');
      return {
        success: true,
        simulated: true,
        provider: 'talksasa_simulated',
        to: cleanPhone,
        message
      };
    }

    try {
      const sender_id = customSenderId || process.env.SMS_SENDER_ID || 'SASA_SMS';
      console.log(`[SMSService] Dispatching SMS to ${cleanPhone} via TalkSasa (Sender: ${sender_id})`);
      
      const response = await axios.post(TALKSASA_API, {
        sender_id,
        recipient: cleanPhone,
        message: message,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error: any) {
      console.error('[SMSService] TalkSasa Error:', error.response?.data || error.message);
      throw new Error(`Failed to send SMS via TalkSasa: ${error.response?.data?.message || error.message}`);
    }
  }

  private static async sendAfricasTalking(phoneNumber: string, message: string, customSenderId?: string) {
    const apiKey = process.env.SMS_API_KEY || process.env.AFRICASTALKING_API_KEY;
    const username = process.env.SMS_USERNAME || process.env.AFRICASTALKING_USERNAME || 'sandbox';

    if (!apiKey) {
      console.warn('[SMSService] AFRICASTALKING_API_KEY is not configured. Running in simulated delivery mode.');
      return {
        success: true,
        simulated: true,
        provider: 'africastalking_simulated',
        to: phoneNumber,
        message
      };
    }

    try {
      const cleanPhone = '+' + this.formatKenyanPhone(phoneNumber);
      const from = customSenderId || process.env.SMS_SENDER_ID || undefined;

      const bodyParams: any = {
        username,
        to: cleanPhone,
        message: message,
      };
      if (from) bodyParams.from = from;

      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        new URLSearchParams(bodyParams),
        {
          headers: {
            'apiKey': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          timeout: 10000
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('[SMSService] AfricasTalking Error:', error.response?.data || error.message);
      throw new Error(`Failed to send SMS via AfricasTalking: ${error.message}`);
    }
  }

  private static async sendTermii(phoneNumber: string, message: string, customSenderId?: string) {
    const apiKey = process.env.TERMII_API_KEY;
    if (!apiKey) {
      return { success: true, simulated: true, provider: 'termii_simulated' };
    }

    const cleanPhone = this.formatKenyanPhone(phoneNumber);
    const response = await axios.post('https://api.ng.termii.com/api/sms/send', {
      to: cleanPhone,
      from: customSenderId || process.env.SMS_SENDER_ID || 'ErrandRun',
      sms: message,
      type: 'plain',
      channel: 'generic',
      api_key: apiKey
    });
    return response.data;
  }
}
