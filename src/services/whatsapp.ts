import axios from 'axios';

export interface WhatsAppSendOptions {
  phone: string;
  message: string;
  template?: string;
  mediaUrl?: string;
  senderPhoneId?: string;
}

export class WhatsAppService {
  /**
   * Send WhatsApp message via WhatsApp Cloud API or configured Gateway provider
   */
  static async sendMessage(options: WhatsAppSendOptions) {
    const { phone, message, mediaUrl } = options;

    // Normalize phone number (standard international format without '+')
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 9) {
      cleanPhone = '254' + cleanPhone;
    }

    const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = options.senderPhoneId || process.env.WHATSAPP_PHONE_ID;

    // If official WhatsApp Cloud API is configured
    if (WHATSAPP_API_TOKEN && PHONE_NUMBER_ID) {
      try {
        const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
        
        let payload: any = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
        };

        if (mediaUrl) {
          payload.type = 'image';
          payload.image = { link: mediaUrl, caption: message };
        } else {
          payload.type = 'text';
          payload.text = { preview_url: true, body: message };
        }

        const response = await axios.post(url, payload, {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`[WhatsAppService] Cloud API message dispatched to ${cleanPhone}:`, response.data);
        return {
          success: true,
          provider: 'meta_cloud_api',
          messageId: response.data?.messages?.[0]?.id || `wa_${Date.now()}`,
          data: response.data
        };
      } catch (error: any) {
        console.error('[WhatsAppService] Cloud API Error:', error.response?.data || error.message);
        throw new Error(`WhatsApp delivery failed: ${error.response?.data?.error?.message || error.message}`);
      }
    }

    // Generic Webhook / WaSender fallback when configured
    const WASENDER_URL = process.env.WASENDER_API_URL || process.env.WHATSAPP_GATEWAY_URL;
    if (WASENDER_URL) {
      try {
        const response = await axios.post(WASENDER_URL, {
          phone: cleanPhone,
          message,
          mediaUrl
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.WASENDER_API_KEY || ''}`,
            'Content-Type': 'application/json'
          }
        });

        return {
          success: true,
          provider: 'custom_gateway',
          messageId: response.data?.id || `wa_${Date.now()}`,
          data: response.data
        };
      } catch (error: any) {
        console.error('[WhatsAppService] Gateway API Error:', error.response?.data || error.message);
        throw new Error(`WhatsApp gateway error: ${error.message}`);
      }
    }

    // Default development simulator log
    console.log(`[WhatsAppService SIMULATOR] Dispatched message to +${cleanPhone}: "${message}"`);
    return {
      success: true,
      provider: 'simulator',
      simulated: true,
      messageId: `wa_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      to: cleanPhone,
      message
    };
  }
}
