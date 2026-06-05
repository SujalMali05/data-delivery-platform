import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

export interface NotificationPayload {
  event: string;
  title: string;
  message: string;
  transferName?: string;
  details?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initEmailTransporter();
  }

  private initEmailTransporter() {
    const host = this.configService.get('SMTP_HOST');
    if (!host) return;

    this.emailTransporter = nodemailer.createTransport({
      host,
      port: parseInt(this.configService.get('SMTP_PORT', '587'), 10),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  /**
   * Send notification to all configured channels
   */
  async notify(payload: NotificationPayload) {
    this.logger.log(
      `Sending notification: ${payload.event} - ${payload.title}`,
    );

    const promises: Promise<void>[] = [];

    if (this.emailTransporter) {
      promises.push(this.sendEmail(payload));
    }

    const slackWebhook = this.configService.get('SLACK_WEBHOOK_URL');
    if (slackWebhook) {
      promises.push(this.sendSlack(payload, slackWebhook));
    }

    const telegramToken = this.configService.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = this.configService.get('TELEGRAM_CHAT_ID');
    if (telegramToken && telegramChatId) {
      promises.push(this.sendTelegram(payload, telegramToken, telegramChatId));
    }

    await Promise.allSettled(promises);
  }

  private async sendEmail(payload: NotificationPayload) {
    try {
      await this.emailTransporter!.sendMail({
        from: this.configService.get('SMTP_FROM'),
        to: this.configService.get('ADMIN_EMAIL'),
        subject: `[DDP] ${payload.title}`,
        html: `
          <h2>${payload.title}</h2>
          <p>${payload.message}</p>
          ${payload.transferName ? `<p><strong>Transfer:</strong> ${payload.transferName}</p>` : ''}
          ${payload.details ? `<pre>${JSON.stringify(payload.details, null, 2)}</pre>` : ''}
        `,
      });
      this.logger.log('Email notification sent');
    } catch (error: any) {
      this.logger.error(`Email notification failed: ${error.message}`);
    }
  }

  private async sendSlack(payload: NotificationPayload, webhookUrl: string) {
    try {
      const emoji =
        payload.event === 'TRANSFER_COMPLETE'
          ? '✅'
          : payload.event === 'TRANSFER_FAILED'
            ? '❌'
            : '⚠️';

      await axios.post(webhookUrl, {
        text: `${emoji} *${payload.title}*\n${payload.message}${
          payload.transferName ? `\n_Transfer: ${payload.transferName}_` : ''
        }`,
      });
      this.logger.log('Slack notification sent');
    } catch (error: any) {
      this.logger.error(`Slack notification failed: ${error.message}`);
    }
  }

  private async sendTelegram(
    payload: NotificationPayload,
    botToken: string,
    chatId: string,
  ) {
    try {
      const emoji =
        payload.event === 'TRANSFER_COMPLETE'
          ? '✅'
          : payload.event === 'TRANSFER_FAILED'
            ? '❌'
            : '⚠️';

      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: `${emoji} *${payload.title}*\n\n${payload.message}${
          payload.transferName ? `\n\n📦 Transfer: ${payload.transferName}` : ''
        }`,
        parse_mode: 'Markdown',
      });
      this.logger.log('Telegram notification sent');
    } catch (error: any) {
      this.logger.error(`Telegram notification failed: ${error.message}`);
    }
  }
}
