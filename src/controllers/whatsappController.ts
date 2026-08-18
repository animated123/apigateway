import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.ts';

export class WhatsAppController {
  /**
   * Send WhatsApp Message (POST /api/whatsapp/send)
   */
  static async sendMessage(req: Request, res: Response) {
    const rawBody = { ...req.query, ...req.body };
    const phone = rawBody.phone || rawBody.recipient || rawBody.phoneNumber || rawBody.to;
    const message = rawBody.message || rawBody.text || rawBody.content;
    const template = rawBody.template;
    const mediaUrl = rawBody.mediaUrl || rawBody.media_url || rawBody.image;

    if (!phone || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Both phone number and message are required' 
      });
    }

    try {
      const result = await WhatsAppService.sendMessage({
        phone: phone.toString(),
        message: message.toString(),
        template: template?.toString(),
        mediaUrl: mediaUrl?.toString()
      });

      return res.status(200).json({
        success: true,
        message: 'WhatsApp message dispatched',
        messageId: result.messageId,
        provider: result.provider,
        data: result
      });
    } catch (error: any) {
      console.error('[WhatsAppController] Send Error:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to dispatch WhatsApp message'
      });
    }
  }

  /**
   * Meta Webhook Verification (GET /api/whatsapp/webhook)
   */
  static async verifyWebhook(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN || 'errandly_wa_secret';

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[WhatsAppController] Webhook verified successfully by Meta challenge.');
        return res.status(200).send(challenge);
      } else {
        console.warn('[WhatsAppController] Webhook verification token mismatch.');
        return res.sendStatus(403);
      }
    }

    return res.status(200).json({ status: 'ok', service: 'Errandly WhatsApp Webhook Receiver' });
  }

  /**
   * Meta Webhook Event Handler (POST /api/whatsapp/webhook)
   */
  static async handleWebhook(req: Request, res: Response) {
    const body = req.body;
    console.log('[WhatsAppController] Incoming Webhook Payload:', JSON.stringify(body).substring(0, 300));

    try {
      // Return 200 OK immediately as required by WhatsApp Cloud API
      return res.status(200).json({ success: true, received: true });
    } catch (error: any) {
      console.error('[WhatsAppController] Webhook Error:', error.message);
      return res.status(200).json({ success: true, received: true, error: error.message });
    }
  }
}
