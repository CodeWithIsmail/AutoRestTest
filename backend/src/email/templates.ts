/**
 * Email bodies, as pure functions of their model. Kept separate from
 * `EmailService` so a template can be rendered and asserted on without a mailer.
 *
 * Two rules apply to everything in this file:
 *
 * - **Styling is inline.** Gmail and Outlook strip `<style>` blocks and class
 *   attributes, so a stylesheet would arrive as unstyled text. The nested-table
 *   layout is the same reason — flexbox and grid are unreliable in mail clients.
 * - **Every interpolated value goes through `escapeHtml`.** Project names,
 *   usernames and suite names are user-typed free text, and this is the only
 *   place in the app where they end up in a document rendered by someone else's
 *   mail client.
 */

/** A rendered message. `text` is always sent alongside `html`. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'AutoRestTest';

const COLORS = {
  accent: '#10b981',
  heading: '#18181b',
  body: '#3f3f46',
  muted: '#71717a',
  border: '#e4e4e7',
  page: '#f4f4f5',
} as const;

/** HTML-escape a user-supplied value before it goes into a message body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  heading: string;
  /** Already-escaped HTML fragments, one per paragraph. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button. Already-escaped HTML. */
  footnote?: string;
}

/** Shared chrome: header, white card, optional button, sign-off. */
function layout({ heading, paragraphs, cta, footnote }: LayoutOptions): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.body};">${p}</p>`,
    )
    .join('');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
         <tr><td style="border-radius:6px;background:${COLORS.accent};">
           <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:11px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>`
    : '';

  // Mail clients that ignore the button still need the raw URL to be reachable.
  const fallback = cta
    ? `<p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};word-break:break-all;">
         If the button doesn't work, paste this into your browser:<br />${escapeHtml(cta.url)}
       </p>`
    : '';

  const note = footnote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${footnote}</p>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:10px;">
      <tr><td style="padding:24px 32px 0;">
        <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.accent};">${BRAND}</span>
      </td></tr>
      <tr><td style="padding:12px 32px 32px;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${COLORS.heading};">${heading}</h1>
        ${body}${button}${fallback}${note}
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:${COLORS.muted};">Sent by ${BRAND} — automated REST API testing.</p>
  </td></tr>
</table>`;
}

/** Join non-empty lines into the plain-text alternative. */
function textBody(lines: (string | false | undefined)[]): string {
  return lines.filter(Boolean).join('\n') + '\n';
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Project invitation
// ---------------------------------------------------------------------------

export interface InvitationModel {
  inviterName: string;
  projectName: string;
  role: string;
  /** Absolute link to the frontend Invitations page, carrying the token. */
  acceptUrl: string;
  expiresAt: Date;
}

export function invitationEmail(m: InvitationModel): RenderedEmail {
  const inviter = escapeHtml(m.inviterName);
  const project = escapeHtml(m.projectName);
  const role = escapeHtml(m.role);
  const expires = formatDate(m.expiresAt);

  return {
    subject: `${m.inviterName} invited you to ${m.projectName} on ${BRAND}`,
    html: layout({
      heading: `You've been invited to ${project}`,
      paragraphs: [
        `<strong>${inviter}</strong> has invited you to collaborate on the project <strong>${project}</strong> as a <strong>${role}</strong>.`,
        `Accept the invitation to see the project's API specification, test suites, and reports.`,
      ],
      cta: { label: 'View invitation', url: m.acceptUrl },
      footnote: `This invitation expires on ${expires}. You'll need to be signed in with this email address to accept it — if you don't have an account yet, create one with this address first.`,
    }),
    text: textBody([
      `${m.inviterName} invited you to collaborate on "${m.projectName}" as a ${m.role}.`,
      '',
      `Accept it here: ${m.acceptUrl}`,
      '',
      `This invitation expires on ${expires}. Sign in with this email address to accept it.`,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------------

export interface WelcomeModel {
  username: string;
  projectsUrl: string;
}

export function welcomeEmail(m: WelcomeModel): RenderedEmail {
  const name = escapeHtml(m.username);

  return {
    subject: `Welcome to ${BRAND}`,
    html: layout({
      heading: `Welcome, ${name}`,
      paragraphs: [
        `Your ${BRAND} account is ready. Create a project, upload an OpenAPI specification, and the engine will explore your API and report what breaks.`,
        `You can also generate a specification from your API's source code if you don't have one yet.`,
      ],
      cta: { label: 'Go to your projects', url: m.projectsUrl },
    }),
    text: textBody([
      `Welcome, ${m.username}.`,
      '',
      `Your ${BRAND} account is ready. Create a project, upload an OpenAPI specification, and the engine will explore your API and report what breaks.`,
      '',
      `Get started: ${m.projectsUrl}`,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Test run finished
// ---------------------------------------------------------------------------

export interface RunFinishedModel {
  username: string;
  projectName: string;
  /** Suites are optionally named; callers fall back to something readable. */
  suiteName: string;
  outcome: 'completed' | 'failed';
  suiteUrl: string;
  /** Present for a completed run; absent when the run itself failed. */
  stats?: { total: number; passed: number; failed: number };
  /** Present when the run failed. */
  error?: string;
}

export function runFinishedEmail(m: RunFinishedModel): RenderedEmail {
  const project = escapeHtml(m.projectName);
  const suite = escapeHtml(m.suiteName);
  const done = m.outcome === 'completed';

  const summary = m.stats
    ? `${m.stats.passed} of ${m.stats.total} requests passed, ${m.stats.failed} failed.`
    : '';

  const paragraphs = done
    ? [
        `Your test run <strong>${suite}</strong> on <strong>${project}</strong> has finished.`,
        summary && escapeHtml(summary),
      ].filter((p): p is string => Boolean(p))
    : [
        `Your test run <strong>${suite}</strong> on <strong>${project}</strong> could not be completed.`,
        m.error
          ? `Reason: ${escapeHtml(m.error)}`
          : 'The engine reported no further detail.',
      ];

  return {
    subject: done
      ? `Test run finished — ${m.projectName}`
      : `Test run failed — ${m.projectName}`,
    html: layout({
      heading: done ? 'Your test run has finished' : 'Your test run failed',
      paragraphs,
      cta: {
        label: done ? 'View the report' : 'View the run',
        url: m.suiteUrl,
      },
    }),
    text: textBody([
      done
        ? `Your test run "${m.suiteName}" on "${m.projectName}" has finished.`
        : `Your test run "${m.suiteName}" on "${m.projectName}" could not be completed.`,
      summary || (m.error ? `Reason: ${m.error}` : ''),
      '',
      `Open it here: ${m.suiteUrl}`,
    ]),
  };
}
