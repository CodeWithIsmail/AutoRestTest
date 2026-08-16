import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  emailVerificationEmail,
  invitationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  runFinishedEmail,
  welcomeEmail,
  type RenderedEmail,
  type RunFinishedModel,
} from './templates';

/** A message ready to hand to the provider. */
interface Outgoing extends RenderedEmail {
  to: string;
}

/**
 * Transactional email, backed by Resend.
 *
 * Resend is an HTTPS API rather than SMTP, which is the reason it is used here:
 * hosts like Render's free tier block outbound SMTP ports, so an SMTP mailer
 * works locally and then silently fails in deployment.
 *
 * Two behaviours are worth knowing before calling anything on this class:
 *
 * - **`send` never throws.** It returns whether the message went out. Every
 *   caller — creating an invitation, registering an account, persisting run
 *   results — is an operation that must succeed whether or not the mail did,
 *   and two of them run inside a background poller with no request to fail
 *   into. Callers that exist *only* to send mail should check the boolean.
 * - **`EMAIL_MODE=mock` never touches the network.** It logs the rendered
 *   subject, recipient and link instead, so the whole flow is demonstrable with
 *   no API key. Mirrors `LlmService`'s `LLM_MODE`.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly mode: string;
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly redirectTo?: string;
  private readonly appUrl: string;
  private client?: Resend;

  constructor(config: ConfigService) {
    this.mode = (config.get<string>('EMAIL_MODE') ?? 'mock').toLowerCase();
    this.apiKey = config.get<string>('RESEND_API_KEY') || undefined;
    this.from =
      config.get<string>('EMAIL_FROM') ??
      'AutoRestTest <onboarding@resend.dev>';
    this.redirectTo = config.get<string>('EMAIL_DEV_REDIRECT_TO') || undefined;
    this.appUrl = (
      config.get<string>('APP_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  get isMock(): boolean {
    return this.mode === 'mock';
  }

  /**
   * Absolute URL into the frontend. The single place a browser-facing link is
   * built — note this is the Next.js origin, not the API's.
   */
  link(path: string): string {
    return `${this.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  /** Invitation to collaborate on a project. Used on create and on resend. */
  async sendProjectInvitation(opts: {
    to: string;
    inviterName: string;
    projectName: string;
    role: string;
    token: string;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.send({
      to: opts.to,
      ...invitationEmail({
        inviterName: opts.inviterName,
        projectName: opts.projectName,
        role: opts.role,
        acceptUrl: this.link(
          `/invitations?token=${encodeURIComponent(opts.token)}`,
        ),
        expiresAt: opts.expiresAt,
      }),
    });
  }

  /**
   * Sent once the address has been confirmed — that is the point at which the
   * account is fully live, and it keeps sign-up to one message per step.
   */
  async sendWelcome(to: string, username: string): Promise<boolean> {
    return this.send({
      to,
      ...welcomeEmail({ username, projectsUrl: this.link('/projects') }),
    });
  }

  /** The six-digit code issued at sign-up and on every resend. */
  async sendEmailVerification(
    to: string,
    opts: { username: string; code: string; expiresMinutes: number },
  ): Promise<boolean> {
    return this.send({ to, ...emailVerificationEmail(opts) });
  }

  /** One-time reset link. The token goes in the URL, never in the body text. */
  async sendPasswordReset(
    to: string,
    opts: { username: string; token: string; expiresMinutes: number },
  ): Promise<boolean> {
    return this.send({
      to,
      ...passwordResetEmail({
        username: opts.username,
        expiresMinutes: opts.expiresMinutes,
        resetUrl: this.link(
          `/reset-password?token=${encodeURIComponent(opts.token)}`,
        ),
      }),
    });
  }

  /**
   * Security notice after a change or reset. Sent unconditionally — it is how a
   * user finds out somebody else changed their password, so it is deliberately
   * not covered by the notification preferences.
   */
  async sendPasswordChanged(to: string, username: string): Promise<boolean> {
    return this.send({
      to,
      ...passwordChangedEmail({
        username,
        resetUrl: this.link('/forgot-password'),
      }),
    });
  }

  /** Sent to whoever triggered a run, once it finishes or fails. */
  async sendRunFinished(
    to: string,
    model: Omit<RunFinishedModel, 'suiteUrl'> & {
      projectId: string;
      suiteId: string;
    },
  ): Promise<boolean> {
    const { projectId, suiteId, ...rest } = model;
    return this.send({
      to,
      ...runFinishedEmail({
        ...rest,
        suiteUrl: this.link(`/projects/${projectId}/test-suites/${suiteId}`),
      }),
    });
  }

  // --------------------------------------------------------------------------
  // Delivery
  // --------------------------------------------------------------------------

  /** Deliver a rendered message. Returns whether it was sent; never throws. */
  private async send(message: Outgoing): Promise<boolean> {
    if (this.isMock) {
      this.logger.log(
        `[mock email] to=${message.to} subject="${message.subject}"\n${message.text.trim()}`,
      );
      return true;
    }

    if (!this.apiKey) {
      this.logger.warn(
        `Not sending "${message.subject}" to ${message.to}: RESEND_API_KEY is not set (or use EMAIL_MODE=mock).`,
      );
      return false;
    }

    // Resend refuses recipients other than the account's own address until a
    // domain is verified, so in development every message can be funnelled to
    // one inbox with the real recipient moved into the subject.
    const to = this.redirectTo ?? message.to;
    const subject = this.redirectTo
      ? `[dev → ${message.to}] ${message.subject}`
      : message.subject;

    try {
      this.client ??= new Resend(this.apiKey);
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to,
        subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        this.logger.error(
          `Resend rejected "${subject}" to ${to}: ${error.name} — ${error.message}`,
        );
        return false;
      }

      this.logger.log(`Sent "${subject}" to ${to} (${data?.id ?? 'no id'})`);
      return true;
    } catch (err) {
      this.logger.error(`Sending "${subject}" to ${to} failed: ${String(err)}`);
      return false;
    }
  }
}
