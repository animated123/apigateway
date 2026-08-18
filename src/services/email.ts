import nodemailer from 'nodemailer';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      const isSecure = port === 465;

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: port,
        secure: isSecure,
        pool: true, // pooled persistent connections for high-throughput action servers
        maxConnections: 5,
        maxMessages: 100,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    }
    return this.transporter;
  }

  static async sendMail(to: string, subject: string, html: string, text?: string) {
    try {
      const transporter = this.getTransporter();
      const from = process.env.SMTP_FROM || `"Errandly Gateway" <${process.env.SMTP_USER || 'no-reply@errandly.site'}>`;

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text: text || html.replace(/<[^>]*>?/gm, ''), // Simple text fallback
        html,
      });

      console.log(`[EmailService] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        response: info.response
      };
    } catch (error: any) {
      console.error('[EmailService] Email Send Error:', error.message || error);
      throw new Error(`Failed to send email: ${error.message || 'SMTP delivery failure'}`);
    }
  }

  static async sendWelcomeEmail(to: string, name: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h1 style="color: #333;">Welcome to Errandly, ${name}!</h1>
        <p>We're excited to have you on board. Your account has been successfully created.</p>
        <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
          <p style="margin: 0; color: #666;">If you have any questions, feel free to reply to this email.</p>
        </div>
      </div>
    `;
    return this.sendMail(to, 'Welcome to Errandly!', html);
  }

  static async sendPaymentConfirmation(to: string, amount: number, reference: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h1 style="color: #10b981;">Payment Received!</h1>
        <p>We've received your payment of <b>KES ${amount}</b>.</p>
        <p><b>Reference:</b> ${reference}</p>
        <p>Thank you for using Errandly!</p>
      </div>
    `;
    return this.sendMail(to, 'Payment Confirmation - Errandly', html);
  }

  static async sendOTPEmail(to: string, code: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
        <h1 style="color: #333;">Verification Code</h1>
        <p>Your one-time password (OTP) is:</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f4f4f4; border-radius: 10px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #6366f1;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
      </div>
    `;
    return this.sendMail(to, 'Your Verification Code', html);
  }

  static async sendVerificationEmail(to: string, code: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #10b981; border-radius: 10px; text-align: center;">
        <h1 style="color: #333;">Action Required: Verify Your Identity</h1>
        <p>Please use the verification code below to confirm your request:</p>
        <div style="margin: 30px 0; padding: 20px; background-color: #f0fdf4; border-radius: 10px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #10b981;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">If you did not request this code, please ignore this email.</p>
      </div>
    `;
    return this.sendMail(to, 'Your Verification Code', html);
  }

  static async sendAuthAlertEmail(to: string, details: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ef4444; border-radius: 10px;">
        <h1 style="color: #ef4444;">Security Alert</h1>
        <p>A new authentication attempt or security event was detected on your account.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #fef2f2; border-left: 4px solid #ef4444; color: #b91c1c;">
          <b>Details:</b> ${details}
        </div>
        <p style="color: #666; font-size: 14px;">If this was not you, please secure your account immediately.</p>
      </div>
    `;
    return this.sendMail(to, 'Authentication Alert: Security Update', html);
  }
}
