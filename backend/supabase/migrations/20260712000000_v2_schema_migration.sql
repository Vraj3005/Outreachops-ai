-- Generic OutreachOps AI v2 Schema Migration
-- Designed to be fully additive and non-destructive.

-- 1. IMPORT MAPPINGS TABLE
CREATE TABLE IF NOT EXISTS import_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    source_headers JSONB DEFAULT '[]'::jsonb,
    field_mapping JSONB DEFAULT '{}'::jsonb,
    required_fields JSONB DEFAULT '[]'::jsonb,
    transform_rules JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. IMPORT SOURCES TABLE
CREATE TABLE IF NOT EXISTS import_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    source_type TEXT NOT NULL, -- 'google_sheets', 'csv_upload', etc.
    name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    total_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    mapping_id UUID REFERENCES import_mappings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. OWNER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS owner_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    business_name TEXT,
    website TEXT,
    sender_name TEXT,
    sender_email TEXT,
    sender_phone TEXT,
    default_signature TEXT,
    brand_voice TEXT,
    offer_description TEXT,
    default_target_audience TEXT,
    default_tone TEXT,
    default_cta TEXT,
    default_language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    daily_send_limit INTEGER DEFAULT 50,
    minimum_send_spacing_seconds INTEGER DEFAULT 60,
    allowed_send_start TEXT DEFAULT '09:00',
    allowed_send_end TEXT DEFAULT '17:00',
    required_footer TEXT,
    banned_phrases JSONB DEFAULT '[]'::jsonb,
    generation_worker_paused BOOLEAN DEFAULT false,
    sending_worker_paused BOOLEAN DEFAULT false,
    queue_drain_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SEQUENCES TABLE
CREATE TABLE IF NOT EXISTS sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ALTER PROMPT TEMPLATES & CREATE PROMPT VERSIONS
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    template_text TEXT NOT NULL,
    status TEXT DEFAULT 'published',
    description TEXT,
    changelog TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SEQUENCE STEPS TABLE
CREATE TABLE IF NOT EXISTS sequence_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE NOT NULL,
    name TEXT,
    step_number INTEGER NOT NULL,
    delay_hours INTEGER DEFAULT 24,
    delay_amount INTEGER DEFAULT 24,
    delay_unit TEXT DEFAULT 'hours',
    prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    subject_template_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    body_template_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    subject_instruction TEXT,
    body_instruction TEXT,
    custom_instructions TEXT,
    require_manual_approval BOOLEAN DEFAULT true,
    stop_conditions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sequence_id, step_number)
);

-- 7. UPDATE CAMPAIGNS WITH V2 FIELDS
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS offer TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS value_proposition TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_length TEXT DEFAULT 'medium';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS "CTA" TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS required_content JSONB DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS banned_content JSONB DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sender_profile_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_spacing_seconds INTEGER DEFAULT 60;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sending_window_start TEXT DEFAULT '09:00';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sending_window_end TEXT DEFAULT '17:00';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_mode TEXT DEFAULT 'manual';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS cloned_from_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS preset TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS proof_points TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS required_facts TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS prohibited_claims TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_industry TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_roles TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS countries TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_lead_fit_score INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS selected_leads JSONB DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS prompt_config_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ooo_behavior TEXT DEFAULT 'ignore';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS parent_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- 8. UPDATE LEADS WITH V2 FIELDS
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS research_summary TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS personalization_context TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_validation_status TEXT DEFAULT 'unchecked';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES import_sources(id) ON DELETE SET NULL;

-- 9. CAMPAIGN LEADS TABLE
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID,
    status TEXT DEFAULT 'enrolled', -- enrolled, active, paused, stopped, completed
    current_sequence_step INTEGER DEFAULT 1,
    stopped_reason TEXT,
    next_step_scheduled_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ,
    last_error TEXT,
    exclude_weekends BOOLEAN DEFAULT true,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(campaign_id, lead_id)
);

-- 10. GENERATION JOBS AND JOB ITEMS
CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    queued INTEGER DEFAULT 0,
    processing INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    cancelled INTEGER DEFAULT 0,
    model_configuration_snapshot JSONB DEFAULT '{}'::jsonb,
    prompt_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES generation_jobs(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, completed, failed
    draft_id UUID REFERENCES email_drafts(id) ON DELETE SET NULL,
    error_message TEXT,
    sequence_step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
    attempts INTEGER DEFAULT 0,
    error_type TEXT,
    resulting_draft_id UUID REFERENCES email_drafts(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. SCHEDULED EMAILS & SEND EVENTS
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    draft_id UUID REFERENCES email_drafts(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, sent, failed, cancelled
    sequence_step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
    attempts INTEGER DEFAULT 0,
    idempotency_key TEXT,
    gmail_message_id TEXT,
    gmail_thread_id TEXT,
    last_error TEXT,
    scheduled_for TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS send_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    scheduled_email_id UUID REFERENCES scheduled_emails(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- sent, failed, bounce, spam
    recipient_email TEXT NOT NULL,
    gmail_message_id TEXT,
    error_message TEXT,
    variant_id UUID,
    variant_name TEXT,
    prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. REPLY EVENTS TABLE
CREATE TABLE IF NOT EXISTS reply_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    gmail_message_id TEXT UNIQUE NOT NULL,
    in_reply_to_id TEXT,
    subject TEXT,
    body TEXT,
    sentiment TEXT DEFAULT 'neutral', -- positive, neutral, negative
    category TEXT,
    confidence REAL,
    rule_model_used TEXT,
    explanation TEXT,
    manual_override BOOLEAN DEFAULT false,
    replied_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. RESEARCH SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS research_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    research_type TEXT NOT NULL, -- website_scrape, linkedin_scrape
    raw_data JSONB DEFAULT '{}'::jsonb,
    structured_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. EXPERIMENTS AND VARIANTS
CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft', -- draft, active, archived
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiment_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    weight NUMERIC DEFAULT 0.5,
    prompt_template_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. INTEGRATION CONNECTIONS TABLE
CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL, -- google_sheets, gmail
    connection_status TEXT DEFAULT 'disconnected',
    encrypted_credentials TEXT,
    last_history_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- 16. ALTER EMAIL DRAFTS TABLE (V2 VARIANT TRACKING SUPPORT)
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS variant_name TEXT;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL;

-- 16. DATA MIGRATIONS BLOCK
DO $$
BEGIN
    -- Migrate leads website_pain_points & erp_approach into custom_fields JSONB
    UPDATE leads
    SET custom_fields = jsonb_build_object(
        'pain_points', website_pain_points,
        'erp_approach', erp_approach
    )
    WHERE custom_fields IS NULL OR custom_fields = '{}'::jsonb;

    -- Backfill prompt templates to prompt versions
    INSERT INTO prompt_versions (id, template_id, version, template_text, is_active, created_at)
    SELECT 
        gen_random_uuid(),
        id,
        COALESCE(version, '1.0.0'),
        template_text,
        COALESCE(is_active, true),
        created_at
    FROM prompt_templates
    ON CONFLICT DO NOTHING;
END $$;

-- 17. AUTOMATIC TIMESTAMPS TRIGGERS
CREATE OR REPLACE TRIGGER update_import_mappings_updated_at
    BEFORE UPDATE ON import_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_import_sources_updated_at
    BEFORE UPDATE ON import_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_owner_settings_updated_at
    BEFORE UPDATE ON owner_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sequences_updated_at
    BEFORE UPDATE ON sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_sequence_steps_updated_at
    BEFORE UPDATE ON sequence_steps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_generation_jobs_updated_at
    BEFORE UPDATE ON generation_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_generation_job_items_updated_at
    BEFORE UPDATE ON generation_job_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_scheduled_emails_updated_at
    BEFORE UPDATE ON scheduled_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_integration_connections_updated_at
    BEFORE UPDATE ON integration_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 18. USEFUL INDEXES
CREATE INDEX IF NOT EXISTS idx_owner_settings_owner ON owner_settings(owner_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_composite ON campaign_leads(campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status_time ON scheduled_emails(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_send_events_campaign ON send_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reply_events_gmail_id ON reply_events(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_research_snapshots_lead ON research_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_experiment_variants_exp ON experiment_variants(experiment_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON integration_connections(user_id, provider);
