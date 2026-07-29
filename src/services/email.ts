import nodemailer from 'nodemailer';

export class EmailService {
  private static transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  static async sendMail(to: string, subject: string, html: string, text?: string) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        text: text || html.replace(/<[^>]*>?/gm, ''), // Simple text fallback
        html,
      });
      console.log('Message sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('Email Send Error:', error);
      throw new Error('Failed to send email');
    }
  }

  static async sendWelcomeEmail(to: string, name: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h1 style="color: #333;">Welcome to Our App, ${name}!</h1>
        <p>We're excited to have you on board. Your account has been successfully created.</p>
        <div style="margin-top: 30px; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
          <p style="margin: 0; color: #666;">If you have any questions, feel free to reply to this email.</p>
        </div>
      </div>
    `;
    return this.sendMail(to, 'Welcome to Our Professional Backend!', html);
  }

  static async sendPaymentConfirmation(to: string, amount: number, reference: string) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h1 style="color: #10b981;">Payment Received!</h1>
        <p>We've received your payment of <b>KES ${amount}</b>.</p>
        <p><b>Reference:</b> ${reference}</p>
        <p>Thank you for using our service!</p>
      </div>
    `;
    return this.sendMail(to, 'Payment Confirmation', html);
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
