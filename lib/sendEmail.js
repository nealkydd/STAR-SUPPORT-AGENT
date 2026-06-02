// Brevo transactional email helper — server-side only.
// Uses @getbrevo/brevo v5 SDK with BrevoClient.
//
// Required env var:  BREVO_API_KEY
// Optional env vars: BREVO_SENDER_EMAIL
//                    BREVO_SENDER_NAME

import { BrevoClient } from '@getbrevo/brevo';

/**
 * Send a transactional email via Brevo.
 *
 * @param {object} opts
 * @param {string}   opts.to          - Recipient email address
 * @param {string}   opts.subject     - Email subject line
 * @param {string}   opts.html        - HTML body content
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error('[sendEmail] BREVO_API_KEY is not set');
    return { ok: false, reason: 'email_config_missing' };
  }

  try {
    const brevo = new BrevoClient({ apiKey });

    await brevo.transactionalEmails.sendTransacEmail({
      subject,
      htmlContent: html,
      sender: {
        name:  process.env.BREVO_SENDER_NAME  || 'Stoic Qabalah',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: to }],
    });

    return { ok: true };

  } catch (err) {
    console.error('[sendEmail] Brevo error', err);
    return { ok: false, reason: 'email_send_failed' };
  }
}
