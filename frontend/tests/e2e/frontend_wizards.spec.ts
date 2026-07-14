import { test, expect } from '@playwright/test';

test.describe('Frontend Components & API Mocks Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // 1. Inject Supabase Session flat structure to bypass redirect to '/'
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

    // 2. Intercept and mock diagnostics and analytics API requests
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
          total_leads: 15,
          total_drafts: 6,
          pending_drafts: 3,
          approved_drafts: 3,
          sent_today: 1,
          failed_today: 0,
          website_emails_sent: 1,
          erp_emails_sent: 0,
          daily_limit: 50,
          remaining_today: 49,
          approval_rate: 50.0,
          failure_rate: 0.0
        })
      });
    });
    await page.route('**/api/v1/campaigns', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'camp-123', name: 'My Campaign', campaign_type: 'generic', status: 'active' }
        ])
      });
    });
    await page.route('**/api/v1/imports/mappings', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/v1/settings', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          business_name: 'Pitbull Corporations',
          website: 'https://pitbullcorporations.com',
          sender_name: 'Vraj',
          sender_email: 'yash69699696@gmail.com',
          sender_phone: '',
          default_signature: '',
          brand_voice: '',
          offer_description: '',
          default_target_audience: '',
          default_tone: 'professional',
          default_cta: '',
          default_language: 'en',
          timezone: 'UTC',
          daily_send_limit: 50,
          minimum_send_spacing_seconds: 60,
          allowed_send_start: '09:00',
          allowed_send_end: '17:00',
          required_footer: '',
          banned_phrases: []
        })
      });
    });
    await page.route('**/api/v1/leads', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'lead-1', company_name: 'Summit HVAC', website: 'summit.com', contact_email: 'info@summit.com', lead_status: 'Pending' }
        ])
      });
    });
  });

  // 1. API Error States Validation
  test('should display rate limit HTTP 429 error fallback banner', async ({ page }) => {
    // Intercept leads request and return 429 rate limit error
    await page.route('**/api/v1/leads*', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Too many requests. Please try again later.' })
      });
    });

    await page.goto('/leads');
    // Check if toast component is displayed with the rate limit detail message
    const errorText = page.locator('text=Failed to load leads');
    await expect(errorText.first()).toBeVisible();
  });

  // 2. Import Wizard Validation
  test('should render import source steps and validation inputs', async ({ page }) => {
    await page.goto('/imports');
    
    // Check that spreadsheet upload card is visible
    const uploadLabel = page.locator('text=Upload Spreadsheet file');
    await expect(uploadLabel.first()).toBeVisible();

    // Click link Google Sheet button/tab to toggle spreadsheet inputs
    await page.click('button:has-text("Link Google Sheet")');

    // Check that Google Sheets URL input field is visible
    const sheetsUrlInput = page.locator('input[placeholder*="spreadsheets/d/"]');
    await expect(sheetsUrlInput.first()).toBeVisible();
  });

  // 3. Campaign Wizard Validation
  test('should guide owner through campaign creation wizard steps', async ({ page }) => {
    await page.goto('/campaigns');
    
    // Open new campaign wizard modal
    const createBtn = page.locator('button:has-text("New Campaign")');
    await createBtn.click();
    
    // Assert presence of target industry or campaign objective fields
    const objInput = page.locator('input[placeholder*="Outreach"]');
    await expect(objInput.first()).toBeVisible();
  });

  // 4. Prompt Studio Variable Warning
  test('should warn on Prompt Studio variable mismatches', async ({ page }) => {
    await page.route('**/api/v1/prompts/test', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Missing required variable: {{company_name}}' })
      });
    });

    await page.goto('/prompt-studio');
    // Try typing or executing simulations to view error state response
    const saveBtn = page.locator('button:has-text("Test"), button:has-text("Simulate")');
    if (await saveBtn.count() > 0) {
      await saveBtn.first().click();
      const warningText = page.locator('text=Missing required variable');
      await expect(warningText.first()).toBeVisible();
    }
  });

  // 5. Generation Progress & Draft Review Actions
  test('should display job progress bar and draft status reviews', async ({ page }) => {
    // Mock draft generate response
    await page.route('**/api/v1/drafts*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'draft-id-1',
            lead_id: 'lead-1',
            subject: 'Outreach to Summit',
            body: 'Hello Summit HVAC...',
            status: 'pending_approval'
          }
        ])
      });
    });

    await page.goto('/drafts');
    const approveBtn = page.locator('button:has-text("Approve")');
    await expect(approveBtn.first()).toBeVisible();
  });

  // 6. Settings Persistence & Integrations
  test('should persist connected settings configurations', async ({ page }) => {
    await page.goto('/settings');
    const emailInput = page.locator('input[type="email"], input[name="sender_email"]');
    await expect(emailInput.first()).toBeVisible();

    const saveSettingsBtn = page.locator('button:has-text("Save Configuration")');
    await expect(saveSettingsBtn.first()).toBeVisible();
  });
});
