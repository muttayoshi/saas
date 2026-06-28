-- =============================================================================
-- Supabase RLS Policies Reference
-- Applied via migration 006_rls_policies
-- =============================================================================

-- Storage Buckets Created:
-- franchise-images  → public,  5MB max, image/* only
-- property-images   → public,  5MB max, image/* only
-- resumes           → private, 10MB max, pdf/doc only
-- documents         → private, 10MB max, pdf/images

-- For full policy details, see supabase/migrations/006_rls_policies.sql
-- and supabase/migrations/007_storage_buckets.sql
