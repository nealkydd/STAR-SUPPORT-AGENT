// Star Support — safe account snapshot endpoint.
//
// Verifies the session token from the Authorization header,
// then returns a safe account snapshot: no Stripe IDs, raw DB fields,
// internal notes, or private product logic.
//
// Safe fields returned:
//   email, access_status, role, support_chat_credits_remaining,
//   active_products (name, type, expires_at only), last_support_access_at

import {
  verifySessionToken,
  getUserByEmail,
  getActiveEntitlements,
  buildAccountSnapshot,
} from '../lib/supportAccess.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    // 1. Extract session token from Authorization header
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, reason: 'missing_token' });
    }

    // 2. Verify session token against support_sessions table
    const session = await verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ ok: false, reason: 'invalid_or_expired_session' });
    }

    // 3. Fetch user and active entitlements
    const user         = await getUserByEmail(session.email);
    const entitlements = user ? await getActiveEntitlements(session.email) : [];

    if (!user) {
      return res.status(404).json({ ok: false, reason: 'user_not_found' });
    }

    // 4. Build and return safe snapshot only
    const snapshot = buildAccountSnapshot(user, entitlements);
    return res.status(200).json({ ok: true, account: snapshot });

  } catch (err) {
    console.error('[support-account] error', err);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
