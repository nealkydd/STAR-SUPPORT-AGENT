// Star Support chat endpoint.
// Verifies session, checks/deducts support_chat_credits_remaining, calls Anthropic.
//
// Credit rules:
//   - support_access_enabled = true  → admin bypass, no deduction
//   - support_chat_credits_remaining = 0 → blocked, polite message, no Anthropic call
//   - Successful Anthropic answer → decrement by 1, log to support_credit_events
//   - Anthropic failure or session invalid → no deduction
//
// credits_remaining (Oracle/app) is never touched here.

import {
  verifySessionToken,
  getUserByEmail,
  getActiveEntitlements,
  buildAccountSnapshot,
  decrementSupportCredits,
  logSupportCreditEvent,
} from '../lib/supportAccess.js';
import { buildSupportSystemPrompt } from '../lib/supportPrompt.js';
import { getAnthropicClient }       from '../lib/anthropic.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    // 1. Verify session token
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, reason: 'missing_token' });
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ ok: false, reason: 'invalid_or_expired_session' });
    }

    // 2. Validate message
    const { message } = req.body || {};
    const clean = String(message || '').trim();
    if (!clean) {
      return res.status(400).json({ ok: false, reason: 'empty_message' });
    }

    // 3. Load user and account snapshot
    const user         = await getUserByEmail(session.email);
    const entitlements = user ? await getActiveEntitlements(session.email) : [];
    const snapshot     = user ? buildAccountSnapshot(user, entitlements) : null;

    // 4. Check support chat credits
    //    Admin bypass (support_access_enabled = true) skips deduction entirely.
    const adminOverride  = user?.support_access_enabled === true;
    const supportCredits = user?.support_chat_credits_remaining ?? 0;

    if (!adminOverride && supportCredits <= 0) {
      return res.status(200).json({
        ok:     true,
        answer: 'Your Star Support chat credits have been used. You can add more support access through Stoic Qabalah.',
        credits_exhausted: true,
      });
    }

    // 5. Build prompt and call Anthropic
    const systemPrompt = buildSupportSystemPrompt(snapshot);

    const response = await getAnthropicClient().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: clean }],
    });

    const answer = response.content?.[0]?.text?.trim()
      || 'I was unable to generate a response. Please try again.';

    // 6. Deduct credit and log — only after successful answer, only for non-admin
    if (!adminOverride) {
      const newBalance = await decrementSupportCredits(session.email);
      await logSupportCreditEvent(session.email, {
        amount:        -1,
        event_type:    'support_chat_used',
        balance_after: newBalance,
        source:        'star_support_chat',
      });
    }

    return res.status(200).json({ ok: true, answer });

  } catch (err) {
    console.error('[stoicqabalahsupportbot] error', err.message);
    // No credit deduction on error
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}
