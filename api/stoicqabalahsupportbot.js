// Star Support chat endpoint.
// Verifies session, loads safe account snapshot, calls Anthropic, returns answer.
//
// NOTE — credit deduction:
// support_chat_credits_remaining is read and included in the prompt context
// but is NOT decremented in this first pass. Deduction will be added once
// the full flow is confirmed stable. This is intentional and documented.

import {
  verifySessionToken,
  getUserByEmail,
  getActiveEntitlements,
  buildAccountSnapshot,
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

    // 3. Load safe account snapshot
    const user         = await getUserByEmail(session.email);
    const entitlements = user ? await getActiveEntitlements(session.email) : [];
    const snapshot     = user ? buildAccountSnapshot(user, entitlements) : null;

    // 4. Build system prompt from safe knowledge + safe account context
    const systemPrompt = buildSupportSystemPrompt(snapshot);

    // 5. Call Anthropic
    const response = await getAnthropicClient().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: clean }],
    });

    const answer = response.content?.[0]?.text?.trim()
      || 'I was unable to generate a response. Please try again.';

    return res.status(200).json({ ok: true, answer });

  } catch (err) {
    console.error('[stoicqabalahsupportbot] error', err.message);
    return res.status(500).json({ ok: false, reason: 'server_error', detail: err.message });
  }
}
