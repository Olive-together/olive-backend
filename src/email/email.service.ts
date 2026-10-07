import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * EmailService — reuses the existing SMTP configuration (same provider as auth OTPs).
 * Reads SMTP_* env vars the same way auth.service.ts does.
 * Admin report emails are sent to the ADMIN_REPORT_EMAIL env var.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private getTransporter() {
    const smtpHost = this.config.get<string>('SMTP_HOST') ?? process.env.SMTP_HOST;
    const smtpPort = parseInt(
      this.config.get<string>('SMTP_PORT') ?? process.env.SMTP_PORT ?? '587',
      10,
    );
    const smtpUser = this.config.get<string>('SMTP_USER') ?? process.env.SMTP_USER;
    const smtpPassword = this.config.get<string>('SMTP_PASSWORD') ?? process.env.SMTP_PASSWORD;

    if (!smtpHost || !smtpUser || !smtpPassword) return null;

    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });
  }

  private getFrom(): string {
    const fromEmail =
      this.config.get<string>('SMTP_FROM_EMAIL') ??
      process.env.SMTP_FROM_EMAIL ??
      'noreply@letsdotogether.app';
    const fromName =
      this.config.get<string>('SMTP_FROM_NAME') ??
      process.env.SMTP_FROM_NAME ??
      'LetsDoTogether';
    return `"${fromName}" <${fromEmail}>`;
  }

  /**
   * Send an admin notification email when a user is reported.
   * Uses ADMIN_REPORT_EMAIL env var as the recipient.
   */
  async sendReportNotification(opts: {
    reportedUserName: string;
    reportedUserEmail: string;
    reportedUserId: string;
    reporterName: string;
    reporterEmail: string;
    reason: string;
    timestamp: Date;
  }): Promise<void> {
    const adminEmail =
      this.config.get<string>('ADMIN_REPORT_EMAIL') ?? process.env.ADMIN_REPORT_EMAIL;

    if (!adminEmail) {
      this.logger.warn('ADMIN_REPORT_EMAIL is not set — skipping report notification email');
      return;
    }

    const transporter = this.getTransporter();
    const formattedTime = opts.timestamp.toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'full',
      timeStyle: 'long',
    });

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1d2b0f;">
        <div style="background: linear-gradient(135deg, #567a27, #6f9a35); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="margin:0; color:#fff; font-size:22px;">🚨 New User Report — LetsDoTogether</h1>
        </div>
        <div style="background:#f4f7ee; padding:32px; border-radius:0 0 12px 12px; border:1px solid #dde8c4;">
          
          <h2 style="color:#567a27; font-size:16px; margin-top:0;">Reported User</h2>
          <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
            <tr><td style="padding:6px 0; color:#7a9845; font-size:13px; width:160px;">Name</td><td style="padding:6px 0; font-weight:600;">${opts.reportedUserName}</td></tr>
            <tr><td style="padding:6px 0; color:#7a9845; font-size:13px;">Email</td><td style="padding:6px 0;">${opts.reportedUserEmail}</td></tr>
            <tr><td style="padding:6px 0; color:#7a9845; font-size:13px;">User ID</td><td style="padding:6px 0; font-family:monospace; font-size:12px; color:#567a27;">${opts.reportedUserId}</td></tr>
          </table>

          <h2 style="color:#567a27; font-size:16px;">Reporter</h2>
          <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
            <tr><td style="padding:6px 0; color:#7a9845; font-size:13px; width:160px;">Name</td><td style="padding:6px 0; font-weight:600;">${opts.reporterName}</td></tr>
            <tr><td style="padding:6px 0; color:#7a9845; font-size:13px;">Email</td><td style="padding:6px 0;">${opts.reporterEmail}</td></tr>
          </table>

          <h2 style="color:#567a27; font-size:16px;">Report Details</h2>
          <div style="background:#fff; border:1px solid #cde0ae; border-radius:8px; padding:16px; margin-bottom:16px;">
            <p style="margin:0; white-space:pre-wrap; line-height:1.6;">${opts.reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>

          <p style="font-size:13px; color:#7a9845; margin:0;">
            ⏱ Reported at: <strong>${formattedTime}</strong>
          </p>
        </div>
        <p style="text-align:center; color:#aaa; font-size:11px; margin-top:16px;">
          LetsDoTogether Admin Notifications · Do not reply to this email
        </p>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: this.getFrom(),
          to: adminEmail,
          subject: `[Report] User reported: ${opts.reportedUserName} (${opts.reportedUserEmail})`,
          html,
        });
        this.logger.log(`Report notification sent to admin (${adminEmail})`);
      } catch (err) {
        this.logger.error('Failed to send report notification email', err);
      }
    } else {
      // Dev fallback — log the report details
      this.logger.warn(
        `[DEV] No SMTP configured — Report summary:\n` +
          `  Reported: ${opts.reportedUserName} (${opts.reportedUserEmail})\n` +
          `  Reporter: ${opts.reporterName} (${opts.reporterEmail})\n` +
          `  Reason: ${opts.reason}\n` +
          `  Admin email would be sent to: ${adminEmail}`,
      );
    }
  }
}
