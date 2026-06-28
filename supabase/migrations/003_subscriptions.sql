-- =============================================================================
-- Migration 003: Subscription plans, subscriptions, payments (Midtrans)
-- =============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE billing_period AS ENUM ('monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'pending', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Plans (admin-configurable)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  name_id        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_id TEXT,
  description_en TEXT,
  tier_level     INT NOT NULL UNIQUE,
  price_monthly  BIGINT NOT NULL DEFAULT 0,
  price_yearly   BIGINT NOT NULL DEFAULT 0,
  features_id    TEXT[] NOT NULL DEFAULT '{}',
  features_en    TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_active     ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_plans_sort       ON subscription_plans(sort_order);
CREATE INDEX IF NOT EXISTS idx_plans_tier       ON subscription_plans(tier_level);

DROP TRIGGER IF EXISTS plans_updated_at ON subscription_plans;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Subscriptions (one active per user)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id              UUID NOT NULL REFERENCES subscription_plans(id),
  billing_period       billing_period NOT NULL,
  status               subscription_status NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_one_active
  ON subscriptions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end  ON subscriptions(current_period_end);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payments (every Midtrans order)
CREATE TABLE IF NOT EXISTS payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                TEXT NOT NULL UNIQUE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
  billing_period          billing_period NOT NULL,
  amount                  BIGINT NOT NULL,
  status                  payment_status NOT NULL DEFAULT 'pending',
  midtrans_transaction_id TEXT,
  payment_type            TEXT,
  raw_notification        JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Effective tier for the current user (0 = Free). Mirrors public.is_admin().
CREATE OR REPLACE FUNCTION public.current_tier()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT p.tier_level
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.current_period_end > now()
      ORDER BY p.tier_level DESC
      LIMIT 1),
    0);
$$;

-- Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select_active ON subscription_plans;
CREATE POLICY plans_select_active ON subscription_plans
  FOR SELECT USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS plans_admin_all ON subscription_plans;
CREATE POLICY plans_admin_all ON subscription_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_admin_all ON subscriptions;
CREATE POLICY subscriptions_admin_all ON subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payments_admin_all ON payments;
CREATE POLICY payments_admin_all ON payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed the Free plan (tier 0). Idempotent.
INSERT INTO subscription_plans (slug, name_id, name_en, description_id, description_en, tier_level, price_monthly, price_yearly, features_id, features_en, sort_order)
VALUES ('free', 'Gratis', 'Free', 'Akses dasar tanpa biaya', 'Basic access at no cost', 0, 0, 0,
        ARRAY['Akses fitur dasar'], ARRAY['Basic features'], 0)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE subscription_plans IS 'Admin-configurable subscription tiers (tier_level 0 = Free)';
COMMENT ON TABLE subscriptions IS 'User subscriptions; at most one active per user';
COMMENT ON TABLE payments IS 'Midtrans payment orders (history + audit)';
