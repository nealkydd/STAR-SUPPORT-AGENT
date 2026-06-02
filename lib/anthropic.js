// Anthropic client — server-side only. Never imported by frontend code.
// Uses lazy initialisation so the key is read at call time, not import time.

import Anthropic from '@anthropic-ai/sdk';

let _client = null;

export function getAnthropicClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('[anthropic] ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}
