// Star Support — shared access layer
// Handles identity, product-based access, codes, sessions, and safe data snapshots.
// Server-side only. Never imported by frontend code.

import crypto from 'crypto';
import { supabase } from './supabaseAdmin.js';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_CODE_ATTEMPTS    = 5;
export const CODE_EXPIRY_MINUTES  = 10;
export const SESSION_EXPIRY_HOURS = 24;

// ─── Email helpers ─────────────────────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── User queries ──────────────────────────────────────────────────────────────

export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select(
      'email, role, access_status, subscription_plan, subscription_status, ' +
      'credits_remaining, trial_started_at, trial_expires_at, ' +
      'support_chat_credits_remaining, support_access_enabled, support_last_access_at'
    )
    .eq('email', email)
    .single();

  if (error || !data) return null;
  return data;
}

export async function updateLastSupportAccess(email) {
  await supabase
    .from('users')
    .update({ support_last_access_at: new Date().toISOString() })
    .eq('email', email);
}

// Safe subset returned to the client on successful auth — no Stripe IDs or raw DB fields.
export function publicUser(user) {
  return {
    email:                          user.email,
    role:                           user.role,
    access_status:                  user.access_status,
    support_chat_credits_remaining: user.support_chat_credits_remaining ?? 0,
  };
}

// ─── Product entitlements ──────────────────────────────────────────────────────

export async function getActiveEntitlements(email) {
  const { data } = await supabase
    .from('product_entitlements')
    .select(
      'product_key, product_name, entitlement_status, entitlement_type, ' +
      'subscription_status, billing_type, starts_at, expires_at'
    )
    .eq('email', email)
    .eq('entitlement_status', 'active');

  return data || [];
}

// ─── Access approval ───────────────────────────────────────────────────────────
//
// A user may receive Star Support access from any Stoic Qabalah product purchase:
//   - AstroQabalah Reader
//   - One-Time Purchase
//   - Subscriber Access
//   - Card deck
//   - Tree of Life course
//   - Elements / Alchemy course
//   - Future products
//
// Approval requires ALL of:
//   1. User record exists
//   2. support_access_enabled = true (admin/lifetime override)
//      OR at least one active product_entitlements row
//   3. support_chat_credits_remaining > 0
//      (unless support_access_enabled = true, which bypasses credit check)

// Recognised access_status values that grant Star Support eligibility.
// Maps to the Tree Reader / AstroQabalah vocabulary in public.users.
const APPROVED_STATUSES = new Set([
  'active_subscription',
  'active',
  'trial',
  'paid',
]);

export function isApprovedForSupport(user, entitlements) {
  if (!user) return false;

  const adminOverride    = user.support_access_enabled === true;
  const hasActiveProduct = entitlements.some(e => e.entitlement_status === 'active');
  const statusOk         = APPROVED_STATUSES.has(user.access_status);

  if (!adminOverride && (!statusOk || !hasActiveProduct)) return false;

  // Admin/lifetime override bypasses credit check
  if (adminOverride) return true;

  return (user.support_chat_credits_remaining ?? 0) > 0;
}

// Reason codes for internal logging and future frontend differentiation
export function approvalReason(user, entitlements) {
  if (!user) return 'account_not_found';
  const hasActiveProduct = entitlements.some(e => e.entitlement_status === 'active');
  if (!user.support_access_enabled && !hasActiveProduct) return 'no_active_product';
  if (!user.support_access_enabled && (user.support_chat_credits_remaining ?? 0) <= 0) return 'no_credits_remaining';
  return null;
}

// ─── Safe account snapshot ─────────────────────────────────────────────────────
// Returns only user-safe fields.
// Never includes: Stripe IDs, raw DB row IDs, webhook data, private notes.
//
// account_state derivation:
//   'active'     — has active product + credits > 0 (or admin override)
//   'trial'      — has trial entitlement only
//   'low_credits'— has active product but support credits <= 2
//   'no_credits' — has active product but 0 support credits
//   'expired'    — all entitlements expired or cancelled
//   'no_product' — no entitlements found
//
// top_up_recommended — true when support_chat_credits_remaining <= 2
//   and user is not on admin bypass.

const LOW_CREDIT_THRESHOLD = 2;

export function buildAccountSnapshot(user, entitlements) {
  const supportCredits  = user.support_chat_credits_remaining ?? 0;
  const oracleCredits   = user.credits_remaining ?? 0;   // DB field: credits_remaining
  const adminOverride   = user.support_access_enabled === true;

  // Build safe product list — no Stripe IDs, no row IDs
  const activeProducts = entitlements
    .filter(e => e.entitlement_status === 'active')
    .map(e => ({
      name:                e.product_name,
      billing_type:        e.billing_type       || null,
      subscription_status: e.subscription_status || null,
      expires_at:          e.expires_at          || null,
    }));

  // Derive account_state
  let account_state;
  if (entitlements.length === 0) {
    account_state = 'no_product';
  } else if (activeProducts.length === 0) {
    const allCancelled = entitlements.every(e => e.entitlement_status === 'cancelled');
    account_state = allCancelled ? 'cancelled' : 'expired';
  } else if (!adminOverride && supportCredits === 0) {
    account_state = 'no_credits';
  } else if (!adminOverride && supportCredits <= LOW_CREDIT_THRESHOLD) {
    account_state = 'low_credits';
  } else if (activeProducts.every(p => p.subscription_status === 'trialing' || p.billing_type === 'trial')) {
    account_state = 'trial';
  } else {
    account_state = 'active';
  }

  return {
    email:                          user.email,
    access_status:                  user.access_status,
    role:                           user.role,
    subscription_plan:              user.subscription_plan || null,
    subscription_status:            user.subscription_status || null,
    trial_started_at:               user.trial_started_at || null,
    trial_expires_at:               user.trial_expires_at || null,
    account_state,
    oracle_credits_remaining:       oracleCredits,
    support_chat_credits_remaining: supportCredits,
    top_up_recommended:             !adminOverride && supportCredits <= LOW_CREDIT_THRESHOLD,
    active_products:                activeProducts,
    support_last_access_at:         user.support_last_access_at || null,
  };
}

// ─── Support chat credit operations ───────────────────────────────────────────
//
// Only touches support_chat_credits_remaining.
// Never touches credits_remaining (Oracle/app credits).
//
// Admin bypass (support_access_enabled = true) skips deduction — consistent
// with the access approval design. For live-like testing, set
// support_access_enabled = false on the test account.

export async function decrementSupportCredits(email) {
  const { data, error } = await supabase
    .from('users')
    .select('support_chat_credits_remaining')
    .eq('email', email)
    .single();

  if (error || !data) {
    console.error('[supportAccess] decrementSupportCredits — user not found', email);
    return null;
  }

  const newBalance = Math.max(0, (data.support_chat_credits_remaining ?? 0) - 1);

  const { error: updateError } = await supabase
    .from('users')
    .update({ support_chat_credits_remaining: newBalance })
    .eq('email', email);

  if (updateError) {
    console.error('[supportAccess] decrementSupportCredits — update failed', updateError.message);
    return null;
  }

  return newBalance;
}

export async function logSupportCreditEvent(email, { amount, event_type, balance_after, source, reason }) {
  const { error } = await supabase
    .from('support_credit_events')
    .insert({
      email,
      amount,
      event_type,
      balance_after: balance_after ?? null,
      source:        source  || null,
      reason:        reason  || null,
    });

  if (error) {
    console.error('[supportAccess] logSupportCreditEvent error', error.message);
  }
}

// ─── Access codes ──────────────────────────────────────────────────────────────

function generateCode() {
  const buf = crypto.randomBytes(4);
  return String(100000 + (buf.readUInt32BE(0) % 900000));
}

export function hashCode(email, code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('[supportAccess] JWT_SECRET not set');
  return crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export async function createSupportCode(email) {
  const code    = generateCode();
  const hash    = hashCode(email, code);
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any previous unused codes for this email
  await supabase
    .from('support_access_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('email', email)
    .is('used_at', null);

  const { error } = await supabase
    .from('support_access_codes')
    .insert({ email, code_hash: hash, expires_at: expires, attempt_count: 0 });

  if (error) {
    console.error('[supportAccess] createSupportCode error', error);
    return { ok: false, reason: 'code_create_failed' };
  }

  return { ok: true, code };
}

export async function getLatestUnusedCode(email) {
  const { data, error } = await supabase
    .from('support_access_codes')
    .select('id, code_hash, expires_at, attempt_count')
    .eq('email', email)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

export async function incrementCodeAttempts(id, currentCount) {
  await supabase
    .from('support_access_codes')
    .update({ attempt_count: (currentCount || 0) + 1 })
    .eq('id', id);
}

export async function markCodeUsed(id) {
  await supabase
    .from('support_access_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id);
}

// ─── Sessions ──────────────────────────────────────────────────────────────────

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSupportSession(email) {
  const token     = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('support_sessions')
    .insert({ email, session_token_hash: tokenHash, expires_at: expiresAt });

  if (error) {
    console.error('[supportAccess] createSupportSession error', error);
    return { ok: false };
  }

  return { ok: true, token };
}

export async function verifySessionToken(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from('support_sessions')
    .select('id, email, expires_at')
    .eq('session_token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  await supabase
    .from('support_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id);

  return { email: data.email };
}
