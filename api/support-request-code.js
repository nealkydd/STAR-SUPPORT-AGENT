// Step 1 of Star Support gate — email lookup and code dispatch.
//
// Checks whether the email belongs to a user with:
//   - at least one active product entitlement (any Stoic Qabalah product), OR
//   - support_access_enabled = true (admin/lifetime override)
//   - AND support_chat_credits_remaining > 0 (unless admin override)
//
// If approved, generates a 6-digit code, stores the hash, and sends it via Brevo.

import {
  normalizeEmail,
  isValidEmail,
  getUserByEmail,
  getActiveEntitlements,
  isApprovedForSupport,
  approvalReason,
  createSupportCode,
} from '../lib/supportAccess.js';
import { sendEmail } from '../lib/sendEmail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const { email } = req.body || {};
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
      return res.status(200).json({ ok: false, reason: 'invalid_email' });
    }

    // 1. Look up user record
    const user = await getUserByEmail(cleanEmail);

    // 2. Look up active product entitlements
    const entitlements = user ? await getActiveEntitlements(cleanEmail) : [];

    // 3. Check approval across all products
    if (!isApprovedForSupport(user, entitlements)) {
      const reason = approvalReason(user, entitlements);
      console.info('[support-request-code] not approved', { email: cleanEmail, reason });
      // Return generic account_not_found — do not reveal internal reason to frontend
      return res.status(200).json({ ok: false, reason: 'account_not_found' });
    }

    // 4. Generate and store 6-digit code
    const result = await createSupportCode(cleanEmail);
    if (!result.ok) {
      return res.status(200).json({ ok: false, reason: result.reason });
    }

    // 5. Send code via Brevo transactional email
    const sent = await sendEmail({
      to:      cleanEmail,
      subject: 'Your Star Support Code',
      html: `
        <p style="font-family:sans-serif;font-size:15px">Your Star Support access code is:</p>
        <p style="font-family:monospace;font-size:36px;font-weight:bold;letter-spacing:0.14em;color:#C9A45D">
          ${result.code}
        </p>
        <p style="font-family:sans-serif;font-size:13px;color:#666">
          This code expires in 10 minutes. Do not share it.
        </p>
        <p style="font-family:sans-serif;font-size:11px;color:#999;margin-top:24px">
          Stoic Qabalah &middot; Star Support
        </p>
      `.trim(),
    });

    if (!sent.ok) {
      return res.status(200).json({ ok: false, reason: sent.reason });
    }

    return res.status(200).json({ ok: true, code_sent: true, expires_in_minutes: 10 });

  } catch (err) {
    console.error('[support-request-code] error', err);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
