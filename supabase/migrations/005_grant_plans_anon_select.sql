-- =============================================================================
-- Migration 005: allow anonymous (logged-out) visitors to read active plans
-- =============================================================================
-- RLS policy `plans_select_active` (migration 003) already restricts rows to
-- `is_active OR is_admin()`, but the `anon` role still needs a table-level
-- SELECT grant for the public pricing page to read plans with the anon key.
-- GRANT is idempotent; re-running is safe.

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
