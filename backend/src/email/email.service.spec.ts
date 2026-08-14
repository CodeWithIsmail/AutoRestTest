import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { invitationEmail, runFinishedEmail } from './templates';

// Stands in for `resend.emails.send`. The `mock` prefix is what lets the
// jest.mock factory below close over it.
const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

/** Build a service over a fixed env. Anything unset falls back to undefined. */
function serviceWith(env: Record<string, string>): EmailService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new EmailService(config);
}

const REAL_ENV = {
  EMAIL_MODE: 'real',
  RESEND_API_KEY: 'test-key',
  EMAIL_FROM: 'AutoRestTest <noreply@example.com>',
  APP_URL: 'https://app.example.com',
};

interface SentPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The payload handed to Resend by the most recent call. */
function lastPayload(): SentPayload {
  const calls = mockSend.mock.calls as [SentPayload][];
  return calls[calls.length - 1][0];
}

describe('EmailService', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });
    // Silence the Nest logger for the failure paths, which log by design.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  describe('mock mode', () => {
    it('reports success without touching the provider', async () => {
      const service = serviceWith({ EMAIL_MODE: 'mock' });

      await expect(service.sendWelcome('bob@example.com', 'bob')).resolves.toBe(
        true,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('is the default when EMAIL_MODE is unset', () => {
      expect(serviceWith({}).isMock).toBe(true);
    });
  });

  describe('real mode', () => {
    it('sends html and a text alternative from the configured address', async () => {
      const service = serviceWith(REAL_ENV);

      await expect(service.sendWelcome('bob@example.com', 'bob')).resolves.toBe(
        true,
      );

      const payload = lastPayload();
      expect(payload.from).toBe('AutoRestTest <noreply@example.com>');
      expect(payload.to).toBe('bob@example.com');
      expect(payload.html).toContain('Welcome');
      expect(payload.text).toContain('https://app.example.com/projects');
    });

    it('refuses to send with no API key rather than throwing', async () => {
      const service = serviceWith({ EMAIL_MODE: 'real' });

      await expect(service.sendWelcome('bob@example.com', 'bob')).resolves.toBe(
        false,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('reports failure when the provider rejects the message', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { name: 'validation_error', message: 'Invalid recipient' },
      });

      await expect(
        serviceWith(REAL_ENV).sendWelcome('bob@example.com', 'bob'),
      ).resolves.toBe(false);
    });

    it('swallows a thrown provider error', async () => {
      mockSend.mockRejectedValue(new Error('network down'));

      // Callers treat sending as best-effort; a throw here would fail an
      // invitation, a sign-up, or a background poller tick.
      await expect(
        serviceWith(REAL_ENV).sendWelcome('bob@example.com', 'bob'),
      ).resolves.toBe(false);
    });
  });

  describe('EMAIL_DEV_REDIRECT_TO', () => {
    it('redirects the recipient and names them in the subject', async () => {
      const service = serviceWith({
        ...REAL_ENV,
        EMAIL_DEV_REDIRECT_TO: 'me@example.com',
      });

      await service.sendWelcome('bob@example.com', 'bob');

      const payload = lastPayload();
      expect(payload.to).toBe('me@example.com');
      expect(payload.subject).toBe(
        '[dev → bob@example.com] Welcome to AutoRestTest',
      );
    });
  });

  describe('link', () => {
    it('strips a trailing slash from APP_URL', () => {
      const service = serviceWith({ APP_URL: 'https://app.example.com/' });
      expect(service.link('/projects')).toBe(
        'https://app.example.com/projects',
      );
    });

    it('puts the invitation token in the frontend URL, encoded', async () => {
      const service = serviceWith(REAL_ENV);

      await service.sendProjectInvitation({
        to: 'bob@example.com',
        inviterName: 'alice',
        projectName: 'Petstore API',
        role: 'tester',
        token: 'a+b/c',
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      });

      expect(lastPayload().text).toContain(
        'https://app.example.com/invitations?token=a%2Bb%2Fc',
      );
    });
  });
});

describe('templates', () => {
  it('escapes user-supplied values so they cannot inject markup', () => {
    const { html, subject } = invitationEmail({
      inviterName: '<script>alert(1)</script>',
      projectName: 'Pets & "Co"',
      role: 'tester',
      acceptUrl: 'https://app.example.com/invitations?token=t',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Pets &amp; &quot;Co&quot;');
    // The subject is plain text, so it keeps the original characters.
    expect(subject).toContain('Pets & "Co"');
  });

  it('summarises a completed run and links to its report', () => {
    const { subject, text } = runFinishedEmail({
      username: 'alice',
      projectName: 'Petstore API',
      suiteName: 'Smoke run',
      outcome: 'completed',
      suiteUrl: 'https://app.example.com/projects/p1/test-suites/s1',
      stats: { total: 10, passed: 7, failed: 3 },
    });

    expect(subject).toBe('Test run finished — Petstore API');
    expect(text).toContain('7 of 10 requests passed, 3 failed.');
  });

  it('reports the reason when the run itself failed', () => {
    const { subject, text } = runFinishedEmail({
      username: 'alice',
      projectName: 'Petstore API',
      suiteName: 'Smoke run',
      outcome: 'failed',
      suiteUrl: 'https://app.example.com/projects/p1/test-suites/s1',
      error: 'Polling timed out',
    });

    expect(subject).toBe('Test run failed — Petstore API');
    expect(text).toContain('Polling timed out');
  });
});
