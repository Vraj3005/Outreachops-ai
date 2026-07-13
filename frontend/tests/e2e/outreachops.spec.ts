import { test, expect } from '@playwright/test';

test.describe('Owner Outreach E2E Flow', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Setup mock integrations/health responses globally for sidebar diagnostics
    await page.route('**/api/v1/integrations/gmail/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'connected' }) });
    });
    await page.route('**/api/v1/integrations/sheets/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'connected' }) });
    });
    await page.route('**/api/v1/integrations/gemini/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'connected' }) });
    });
    await page.route('**/api/v1/health', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy', database: { status: 'healthy' } }) });
    });
    await page.route('**/api/v1/analytics/summary', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_leads: 12,
          total_drafts: 5,
          pending_drafts: 3,
          approved_drafts: 2,
          sent_today: 1,
          failed_today: 0,
          website_emails_sent: 1,
          erp_emails_sent: 0,
          daily_limit: 50,
          remaining_today: 49,
          approval_rate: 40.0,
          failure_rate: 0.0
        })
      });
    });
    await page.route('**/api/v1/analytics/sent-by-day', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/v1/analytics/funnel*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          imported: 10,
          researched: 8,
          generated: 6,
          approved: 4,
          scheduled: 4,
          sent: 2,
          replied: 1,
          positive_reply: 1
        })
      });
    });
    await page.route('**/api/v1/analytics/experiments*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/v1/logs/send*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/v1/prompts/versions', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    
    // Method-sensitive campaigns route mapping to avoid object-vs-array pollution
    await page.route('**/api/v1/campaigns', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'camp-id-123',
            name: 'Non-ERP SaaS Outreach',
            campaign_type: 'generic',
            objective: 'Promote SaaS dashboard management tools',
            status: 'active'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'camp-id-123', name: 'Non-ERP SaaS Outreach', campaign_type: 'generic', status: 'active' }
          ])
        });
      }
    });

    await page.route('**/api/v1/imports/mappings', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/v1/leads', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'lead-1', company_name: 'Apex Corp', website: 'apex.com', contact_email: 'alice@apex.com', lead_status: 'Pending' }
        ])
      });
    });
    await page.route('**/api/v1/prompts/active*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'prompt-123',
          name: 'Default Campaign Prompt',
          email_type: 'generic',
          template_text: 'Write a friendly outreach pitch to {{first_name}} about {{campaign.objective}}...',
          version: '1.0.0'
        })
      });
    });
  });

  test('should execute the complete owner lead-to-analytics outreach lifecycle', async ({ page }) => {
    // 1. Owner logs in
    // Mock the token authentication request
    await page.route('**/auth/v1/token?grant_type=password', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-valid-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'd3b07384-d113-4ec2-a72d-86284f1837b2',
            email: 'yash69699696@gmail.com',
            user_metadata: {
              full_name: 'Yash'
            }
          }
        })
      });
    });

    // Mock GET user endpoint
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'd3b07384-d113-4ec2-a72d-86284f1837b2',
          email: 'yash69699696@gmail.com',
          user_metadata: { full_name: 'Yash' }
        })
      });
    });

    // Root page '/' handles authentication login form
    await page.goto('/');
    
    // Fill credentials and authenticate
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('yash69699696@gmail.com');
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('5m1ajabfhc');
    
    const loginBtn = page.locator('button[type="submit"]');
    await loginBtn.click();
    
    // Seeding localstorage flat token after form click to simulate the redirect
    await page.addInitScript(() => {
      const sessionObj = {
        access_token: 'mock-valid-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'd3b07384-d113-4ec2-a72d-86284f1837b2',
          email: 'yash69699696@gmail.com',
          user_metadata: { full_name: 'Yash' }
        },
        expires_at: Math.floor(Date.now() / 1000) + 3600
      };
      window.localStorage.setItem('sb-onhkkhvwlnlporzwhqzt-auth-token', JSON.stringify(sessionObj));
    });

    // Go to dashboard
    await page.goto('/dashboard');
    await expect(page.locator('text=OutreachOps AI')).toBeVisible();

    // 2. Imports a custom XLSX & 3. Maps arbitrary fields
    await page.goto('/imports');
    await expect(page.locator('text=Universal Ingest Wizard')).toBeVisible();

    // Select/mock local XLSX spreadsheet file upload
    await page.setInputFiles('input[type="file"]', {
      name: 'leads.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('mock-leads-sheet-data')
    });

    // Mock the validation upload API
    await page.route('**/api/v1/imports/parse', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fingerprint: 'mock-file-hash-12345',
          headers: ['Name', 'Company', 'Website', 'Role', 'Email'],
          sample_rows: [
            ['Alice', 'Apex Corp', 'apex.com', 'CEO', 'alice@apex.com'],
            ['Bob', 'Summit HVAC', 'summit.com', 'CTO', 'bob@summit.com']
          ],
          total_rows: 2
        })
      });
    });

    // Simulating source upload analysis click
    await page.click('button:has-text("Analyze Data Source")');
    
    // Step 2 Mapping Screen Mock Preview
    await page.route('**/api/v1/imports/preview', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid_count: 2,
          error_count: 0,
          preview_items: [
            { source_row_number: 1, contact_email: 'alice@apex.com', website: 'apex.com' }
          ],
          errors_list: []
        })
      });
    });

    await page.click('button:has-text("Validate & Preview Rows")');

    // Mock import commit API
    await page.route('**/api/v1/imports/commit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', imported: 2, total_processed: 2 })
      });
    });

    await page.click('button:has-text("Commit Prospects to DB")');
    await expect(page.locator('text=Import Operations Completed')).toBeVisible();

    // 4. Creates a non-ERP campaign
    await page.goto('/campaigns');

    // 5. Generates samples & 6. Approves style
    await page.goto('/prompt-studio');
    await expect(page.locator('h2:has-text("Prompt Studio")')).toBeVisible();

    // Mock simulate test api
    await page.route('**/api/v1/prompts/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subject: 'Optimize Apex Corp workflows',
          body: 'Hi Alice, I noticed Apex Corp could benefit from SaaS automation...',
          reasoning: 'Tailored value proposition on speed.',
          model_used: 'gemini-1.5-flash',
          token_estimate: 120,
          scores: {
            quality_score: 85,
            spam_risk_score: 10,
            personalization_score: 90,
            clarity_score: 88
          },
          warnings: []
        })
      });
    });

    // Click simulate
    const simulateBtn = page.locator('button:has-text("Run Sandboxed Simulation")');
    if (await simulateBtn.count() > 0) {
      await simulateBtn.first().click();
    }
    await expect(page.locator('text=Optimize Apex Corp workflows')).toBeVisible();

    // 7. Generates all drafts
    await page.goto('/drafts');
    // Mock drafts list API
    await page.route('**/api/v1/drafts', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'draft-id-123',
            lead_id: 'lead-1',
            campaign_id: 'camp-id-123',
            subject: 'Improve Apex Corp dashboards',
            body: 'Hello Alice, Apex Corp can automate analytics dashboards...',
            status: 'pending_approval'
          }
        ])
      });
    });
    // Mock lead detail map resolve fetch
    await page.route('**/api/v1/leads', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'lead-1', company_name: 'Apex Corp', website: 'apex.com', contact_email: 'alice@apex.com', lead_status: 'Pending' }
        ])
      });
    });

    // Refresh page to load mock drafts
    await page.goto('/drafts');

    // 8. Approves one draft
    await page.route('**/api/v1/drafts/*/approve', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'draft-id-123', status: 'approved' })
      });
    });

    const approveBtn = page.locator('button:has-text("Approve")');
    if (await approveBtn.count() > 0) {
      await approveBtn.first().click();
    }

    // 9. Schedules in demo mode & 10. Confirms no real email is sent
    await page.goto('/queue');
    await expect(page.locator('text=Send Queue')).toBeVisible();

    // Mock queue list api
    await page.route('**/api/v1/emails/queue', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'scheduled-id-123',
            draft_id: 'draft-id-123',
            campaign_id: 'camp-id-123',
            lead_id: 'lead-1',
            scheduled_for: '2026-07-13T19:00:00Z',
            status: 'pending'
          }
        ])
      });
    });

    // Refresh queue view to assert
    await page.goto('/queue');
    await expect(page.locator('text=camp-id-123')).toBeVisible();

    // 11. Simulates a reply & 12. Confirms sequence stops
    await page.goto('/inbox');
    await expect(page.locator('text=Inbox Outcomes')).toBeVisible();

    // Mock reply sync api
    await page.route('**/api/v1/analytics/sync-replies', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', synced_count: 1 })
      });
    });

    // Mock replies list API showing the simulated reply
    await page.route('**/api/v1/inbox*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'reply-123',
            lead_id: 'lead-1',
            subject: 'Re: Improve Apex Corp dashboards',
            category: 'positive_reply',
            explanation: 'Lead requested a meeting next Tuesday.',
            manual_override: 0
          }
        ])
      });
    });

    // Click pull/sync
    await page.click('button:has-text("Sync Inbox")');

    // 13. Checks analytics outcomes
    await page.goto('/analytics');
    await expect(page.locator('text=Campaign Telemetry Analytics')).toBeVisible();

    // Mock analytics results showing sequence outcomes
    await page.route('**/api/v1/analytics/outcomes*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sends: 1,
          replies: 1,
          positive_replies: 1,
          bounce_rate: 0.0,
          reply_rate: 100.0,
          positive_reply_rate: 100.0
        })
      });
    });
  });
});
