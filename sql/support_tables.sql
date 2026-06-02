-- ─────────────────────────────────────────────────────────────────────────────
-- Star Support — Supabase schema
-- Run in Supabase SQL editor (service role required for initial setup)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";


-- ─── public.users ────────────────────────────────────────────────────────────
-- Core member record. One row per email address.
-- access_status values:  'active' | 'inactive' | 'trial' | 'expired' | 'cancelled'
-- role values:           'member' | 'admin'
--
-- CREDIT FIELD RULES — READ CAREFULLY:
--   credits_remaining              = Oracle/app credits. Owned by the Reader/Oracle system.
--                                    Star Support may READ this for display only.
--                                    Star Support must NEVER seed, reset, or update it.
--                                    Stripe webhooks and the Reader system manage this field.
--   support_chat_credits_remaining = Star Support chat credits only.
--                                    Star Support owns and decrements this field.
--   support_access_enabled         = Admin/lifetime bypass for Star Support gate.
--
-- DO NOT use oracle_credits_remaining as a column name — the real field is credits_remaining.

create table if not exists public.users (
  email                           text        primary key,
  role                            text        not null default 'member',
  access_status                   text        not null default 'inactive',
  credits_remaining               integer     not null default 0,
  support_chat_credits_remaining  integer     not null default 0,
  support_access_enabled          boolean     not null default false,
  last_support_access_at          timestamptz,
  created_at                      timestamptz not null default now()
);

alter table public.users enable row level security;

-- Service role can do everything; no anon/public access
create policy "service role full access — users"
  on public.users
  using (true)
  with check (true);


-- ─── public.product_entitlements ─────────────────────────────────────────────
-- One row per product a member holds.
-- product_key examples:      'tree_reader' | 'oracle_access' | 'star_support'
--                             'card_deck' | 'tol_course' | 'elements_course'
-- entitlement_status:        'active' | 'expired' | 'cancelled' | 'pending'
-- entitlement_type:          'subscription' | 'one_time' | 'trial' | 'gifted' | 'lifetime'
-- subscription_status:       'active' | 'past_due' | 'trialing' | 'cancelled' | 'paused' | null
--                             Set by Stripe webhook. null for one-time purchases.
-- billing_type:              'monthly' | 'annual' | 'one_time' | 'lifetime' | null
--                             Safe label for display. No Stripe details.
-- source:                    'stripe' | 'manual' | 'free_trial' | 'migration'
-- stripe_customer_id/stripe_subscription_id: stored for webhook reconciliation only.
--                             Never returned to frontend.

create table if not exists public.product_entitlements (
  id                      uuid        primary key default gen_random_uuid(),
  email                   text        not null references public.users(email) on delete cascade,
  product_key             text        not null,
  product_name            text        not null,
  entitlement_status      text        not null default 'active',
  entitlement_type        text        not null,
  subscription_status     text,
  billing_type            text,
  source                  text        not null,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  starts_at               timestamptz not null default now(),
  expires_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_product_entitlements_email
  on public.product_entitlements (email);

alter table public.product_entitlements enable row level security;

create policy "service role full access — product_entitlements"
  on public.product_entitlements
  using (true)
  with check (true);


-- ─── public.support_access_codes ─────────────────────────────────────────────
-- Stores hashed one-time 6-digit codes for Star Support gate.
-- code_hash: HMAC-SHA256(email + ':' + code, JWT_SECRET)
-- expires_at: 10 minutes from creation
-- used_at: set when code is successfully verified
-- attempt_count: incremented on each failed verify attempt

create table if not exists public.support_access_codes (
  id             uuid        primary key default gen_random_uuid(),
  email          text        not null references public.users(email) on delete cascade,
  code_hash      text        not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  attempt_count  integer     not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_support_access_codes_email
  on public.support_access_codes (email);

alter table public.support_access_codes enable row level security;

create policy "service role full access — support_access_codes"
  on public.support_access_codes
  using (true)
  with check (true);


-- ─── public.support_sessions ─────────────────────────────────────────────────
-- Tracks active Star Support sessions.
-- session_token_hash: SHA-256 of the raw token sent to the client
-- Client stores raw token in sessionStorage; never stored server-side in plain text

create table if not exists public.support_sessions (
  id                  uuid        primary key default gen_random_uuid(),
  email               text        not null references public.users(email) on delete cascade,
  session_token_hash  text        not null unique,
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now()
);

create index if not exists idx_support_sessions_email
  on public.support_sessions (email);

create index if not exists idx_support_sessions_token_hash
  on public.support_sessions (session_token_hash);

alter table public.support_sessions enable row level security;

create policy "service role full access — support_sessions"
  on public.support_sessions
  using (true)
  with check (true);


-- ─── public.support_credit_events ────────────────────────────────────────────
-- Ledger of credit changes per user.
-- amount: positive = credit granted, negative = credit spent/expired
-- event_type examples: 'grant' | 'spend' | 'refund' | 'expiry' | 'admin_adjust'
-- source examples:     'purchase' | 'chat_use' | 'manual' | 'system'

create table if not exists public.support_credit_events (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null references public.users(email) on delete cascade,
  amount        integer     not null,
  event_type    text        not null,
  balance_after integer,
  reason        text,
  source        text,
  created_at    timestamptz not null default now()
);

-- If table already exists, add balance_after:
-- alter table public.support_credit_events add column if not exists balance_after integer;

create index if not exists idx_support_credit_events_email
  on public.support_credit_events (email);

alter table public.support_credit_events enable row level security;

create policy "service role full access — support_credit_events"
  on public.support_credit_events
  using (true)
  with check (true);
