// Step 2 of Star Support gate — code verification and session creation.
//
// Validates email + 6-digit code against the stored hash.
// On success: marks code used, updates last_support_access_at,
// creates a support session, returns a session token to the client.
// The token is stored client-side in sessionStorage only.

import {
  normalizeEmail,
  isValidEmail,
  getUserByEmail,
  getActiveEntitlements,
  isApprovedForSupport,
  hashCode,
  getLatestUnusedCode,
  incrementCodeAttempts,
  markCodeUsed,
  updateLastSupportAccess,
  createSupportSession,
  publicUser,
  MAX_CODE_ATTEMPTS,
} from '../lib/supportAccess.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const { email, code } = req.body || {};
    const cleanEmail = normalizeEmail(email);
    const cleanCode  = String(code || '').trim();

    if (!isValidEmail(cleanEmail)) {
      return res.status(200).json({ ok: false, reason: 'invalid_email' });
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      return res.status(200).json({ ok: false, reason: 'invalid_code_format' });
    }

    // 1. Fetch the latest unused, unexpired code for this email
    const row = await getLatestUnusedCode(cleanEmail);
    if (!row) {
      return res.status(200).json({ ok: false, reason: 'code_not_found' });
    }
    if (Number(row.attempt_count || 0) >= MAX_CODE_ATTEMPTS) {
      return res.status(200).json({ ok: false, reason: 'too_many_attempts' });
    }

    // 2. Verify the submitted code against the stored hash
    const submittedHash = hashCode(cleanEmail, cleanCode);
    if (submittedHash !== row.code_hash) {
      await incrementCodeAttempts(row.id, row.attempt_count);
      return res.status(200).json({ ok: false, reason: 'invalid_code' });
    }

    // 3. Re-check product approval (guard against entitlement lapsing between steps)
    const user         = await getUserByEmail(cleanEmail);
    const entitlements = user ? await getActiveEntitlements(cleanEmail) : [];
    if (!isApprovedForSupport(user, entitlements)) {
      return res.status(200).json({ ok: false, reason: 'access_not_active' });
    }

    // 4. Mark code used and update last access
    await markCodeUsed(row.id);
    await updateLastSupportAccess(cleanEmail);

    // 5. Create session — token stored by client, hash stored server-side
    const session = await createSupportSession(cleanEmail);
    if (!session.ok) {
      return res.status(500).json({ ok: false, reason: 'session_create_failed' });
    }

    return res.status(200).json({
      ok:      true,
      verified: true,
      token:   session.token,
      user:    publicUser(user),
    });

  } catch (err) {
    console.error('[support-auth] error', err);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
