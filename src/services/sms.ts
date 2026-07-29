import axios from 'axios';

export class SMSService {
  static async sendSMS(phoneNumber: string, message: string) {
    const provider = process.env.SMS_PROVIDER || 'talksasa'; // Defaulting for example

    if (provider === 'talksasa') {
      return this.sendTalkSasa(phoneNumber, message);
    } else {
      return this.sendAfricasTalking(phoneNumber, message);
    }
  }

  private static async sendTalkSasa(phoneNumber: string, message: string) {
    const TALKSASA_API = "https://bulksms.talksasa.com/api/v3/sms/send";
    
    // Normalize phone number: ensure it starts with 254 (for Kenya) and remove +
    let cleanPhone = phoneNumber.replace(/\+/g, '').replace(/^0/, '254');
    if (!cleanPhone.startsWith('254') && cleanPhone.length === 9) {
      cleanPhone = '254' + cleanPhone;
    }

    try {
      console.log("SENDING SMS VIA TALKSASA:", TALKSASA_API);
      console.log("Recipient:", cleanPhone);
      
      const response = await axios.post(TALKSASA_API, {
        sender_id: process.env.SMS_SENDER_ID || 'SASA_SMS',
        recipient: cleanPhone,
        message: message,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TALKSASA_API_TOKEN}`,
        }
      });
      
      console.log("TalkSasa Response:", response.data);
      return response.data;
    } catch (error: any) {
      console.error('TalkSasa SMS Error Detail:', error.response?.data || error.message);
      throw new Error(`Failed to send SMS via TalkSasa: ${error.response?.data?.message || error.message}`);
    }
  }

  private static async sendAfricasTalking(phoneNumber: string, message: string) {
    // Basic implementation for AfricasTalking
    try {
      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        new URLSearchParams({
          username: process.env.SMS_USERNAME || '',
          to: phoneNumber,
          message: message,
          from: process.env.SMS_SENDER_ID || '',
        }),
        {
          headers: {
            'apiKey': process.env.SMS_API_KEY || '',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          }
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('AfricasTalking SMS Error:', error.response?.data || error.message);
      throw new Error('Failed to send SMS via AfricasTalking');
    }
  }
}
