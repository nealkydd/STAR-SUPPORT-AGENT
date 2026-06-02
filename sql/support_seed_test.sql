-- ─────────────────────────────────────────────────────────────────────────────
-- Star Support — safe test seed
-- Safe to run multiple times (ON CONFLICT DO UPDATE).
--
-- IMPORTANT RULES:
--   DO NOT set or update credits_remaining here.
--   credits_remaining is owned by the Reader/Oracle system and Stripe webhooks.
--   Star Support may read it for display, but must never write it.
--
--   Only set Star Support-owned fields:
--     support_chat_credits_remaining
--     support_access_enabled
--   And identity/access fields:
--     role
--     access_status
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Set Star Support access fields only — do NOT touch credits_remaining
INSERT INTO public.users (
  email,
  role,
  access_status,
  support_chat_credits_remaining,
  support_access_enabled
)
VALUES (
  'nealkydd@gmail.com',
  'admin',
  'active_subscription',
  10,    -- Star Support chat credits
  true   -- admin bypass
)
ON CONFLICT (email) DO UPDATE SET
  role                           = 'admin',
  access_status                  = 'active_subscription',
  support_chat_credits_remaining = 10,
  support_access_enabled         = true;
-- NOTE: credits_remaining is intentionally excluded from this seed.


-- 2. Add a test product entitlement (skip if already exists)
INSERT INTO public.product_entitlements (
  email,
  product_key,
  product_name,
  entitlement_status,
  entitlement_type,
  billing_type,
  subscription_status,
  source
)
SELECT
  'nealkydd@gmail.com',
  'starsupport_user_test',
  'Star Support User Test',
  'active',
  'one_time',
  'one_time',
  null,
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_entitlements
  WHERE email       = 'nealkydd@gmail.com'
    AND product_key = 'starsupport_user_test'
);
