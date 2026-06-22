-- 1. Insert Demo User
INSERT INTO users (id, email, full_name, created_at)
VALUES (
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'demo@outreachops.ai',
    'Demo Administrator',
    NOW()
) ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name;

-- 2. Insert Default Campaign
INSERT INTO campaigns (id, user_id, name, campaign_type, status, daily_send_limit, delay_seconds)
VALUES (
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Q3 Construction Inbound',
    'mixed',
    'active',
    50,
    5
) ON CONFLICT DO NOTHING;

-- 3. Insert 5 Fake Leads (non-real domains and mock contact emails)
INSERT INTO leads (id, user_id, company_name, website, industry, country, city, contact_email, phone, website_pain_points, erp_approach, lead_status, source_sheet_name, source_row_number)
VALUES
(
    'e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd0',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Apex Roofing Solutions',
    'apex-roofing-mock.com',
    'Construction',
    'USA',
    'Atlanta',
    'contact@apex-roofing-mock.com',
    '+1-404-555-0199',
    'Slow contact forms, mobile view layout shift, missing lead forms on main pricing tab.',
    'centralized job scheduling, subcontractor invoice generation, material tracking dashboards',
    'Pending',
    'Demo',
    '2'
),
(
    'e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd1',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Beacon Masonry Inc',
    'beacon-masonry-mock.com',
    'Construction',
    'USA',
    'Boston',
    'estimates@beacon-masonry-mock.com',
    '+1-617-555-0144',
    'Informational only, no lead capture CTA, outdated project visual showcase portfolio.',
    'job-costing ledger, purchase approval workflows, materials inventory control',
    'Pending',
    'Demo',
    '3'
),
(
    'e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd2',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Summit HVAC Services',
    'summit-hvac-mock.com',
    'Home Services',
    'USA',
    'Denver',
    'service@summit-hvac-mock.com',
    '+1-303-555-0122',
    'Booking tool is broken on iOS safari, lack of conversion funnel mapping on landing pages.',
    'dispatching dispatch board, field service app, equipment maintenance logs, invoice syncing',
    'Pending',
    'Demo',
    '4'
),
(
    'e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd3',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Prime Glass & Glazing',
    'primeglass-mock.com',
    'Construction Services',
    'Canada',
    'Toronto',
    'info@primeglass-mock.com',
    '+1-416-555-0188',
    'No dynamic online quote estimate workflow, low visual contrast on dark buttons.',
    'estimate approvals portal, job status notification trigger pipeline, automated dispatching',
    'Pending',
    'Demo',
    '5'
),
(
    'e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd4',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Vanguard Builders',
    'vanguard-build-mock.net',
    'General Contractors',
    'UK',
    'London',
    'tenders@vanguard-build-mock.net',
    '+44-20-7946-0155',
    'Heavy pdf downloads for portfolio page instead of fast web showcases.',
    'subcontractor tracking, request for information (RFI) logs, real-time job-cost dashboard',
    'Pending',
    'Demo',
    '6'
)
ON CONFLICT DO NOTHING;

-- 4. Insert Default Prompt Templates
INSERT INTO prompt_templates (id, user_id, name, email_type, template_text, version, is_active)
VALUES 
(
    'b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Default Web Dev Pitch',
    'website',
    'You write cold emails for a web development agency. Company: {website}. Paint points: {pain_points}.',
    '1.0.0',
    true
),
(
    'b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6f',
    'd3b07384-d113-4ec2-a72d-86284f1837b2',
    'Default ERP Solutions Pitch',
    'erp',
    'You write cold emails for custom ERP development agency. Company: {website}. ERP Pitch: {erp_approach}.',
    '1.0.0',
    true
)
ON CONFLICT DO NOTHING;
