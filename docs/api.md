# OutreachOps AI — API Documentation

This document describes the REST API endpoints provided by the FastAPI backend of OutreachOps AI.

## Base URL
- Local development: `http://localhost:8000`
- Render production: `https://outreachops-api.onrender.com` (example)

---

## 1. Leads Integration

### Import Leads from Google Sheet
* **Endpoint**: `POST /integrations/sheets/import`
* **Description**: Triggers Google Sheets synchronization. Connects to the configured sheet/tab, checks for duplicate contacts, and imports new rows.
* **Authentication**: Bearer Token (Supabase JWT)
* **Response**:
  ```json
  {
    "imported": 5,
    "skipped_duplicates": 2,
    "total_processed": 7
  }
  ```

### List Leads
* **Endpoint**: `GET /leads`
* **Description**: Lists all leads for the authenticated user.
* **Query Parameters**:
  - `status`: Filter by lead status (e.g., `Pending`, `Contacted`)
  - `has_email`: Filter leads that have a valid email address (`true` / `false`)
* **Response**:
  ```json
  [
    {
      "id": "uuid-123",
      "company_name": "Apex Roofing Solutions",
      "website": "apex-roofing-mock.com",
      "contact_email": "demo@example.com",
      "website_pain_points": "Slow contact forms",
      "erp_approach": "centralized scheduling",
      "lead_status": "Pending",
      "created_at": "2026-06-19T18:00:00Z"
    }
  ]
  ```

---

## 2. Drafts Generation

### Generate Personalizations
* **Endpoint**: `POST /drafts/generate`
* **Description**: Generates AI-personalized emails using Gemini API based on active templates.
* **Request Body**:
  ```json
  {
    "lead_ids": ["uuid-123"],
    "email_types": ["website", "erp"],
    "regenerate": false
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "generated_count": 2,
    "errors": []
  }
  ```

### List Draft Review Queue
* **Endpoint**: `GET /drafts`
* **Description**: Retrieves draft emails filtered by status or email type.
* **Query Parameters**:
  - `status`: Filter by status (`draft`, `approved`, `sent`, `failed`, `rejected`)
  - `email_type`: Filter by type (`website`, `erp`, `follow_up`)
* **Response**:
  ```json
  [
    {
      "id": "draft-uuid-456",
      "lead_id": "uuid-123",
      "email_type": "website",
      "subject": "Quick fix for Apex Roofing Solutions site",
      "body": "Hi there, I noticed your contact form...",
      "status": "draft",
      "ai_model": "gemini-2.5-flash-lite",
      "quality_score": 88,
      "spam_risk_score": 12,
      "personalization_score": 90,
      "clarity_score": 85
    }
  ]
  ```

---

## 3. Review & Approval Workflows

### Approve Draft
* **Endpoint**: `POST /drafts/{id}/approve`
* **Description**: Marks the draft status as `approved`, preparing it for dispatch.
* **Response**:
  ```json
  {
    "success": true,
    "status": "approved"
  }
  ```

### Reject Draft
* **Endpoint**: `POST /drafts/{id}/reject`
* **Description**: Rejects a draft and updates status to `rejected`.
* **Response**:
  ```json
  {
    "success": true,
    "status": "rejected"
  }
  ```

### Dispatch Single Draft
* **Endpoint**: `POST /drafts/{id}/send`
* **Description**: Immediately validates safety rules and sends a single approved email via the Gmail API.
* **Response**:
  ```json
  {
    "status": "success",
    "gmail_message_id": "gmail-msg-id-xyz"
  }
  ```

### Dispatch All Approved Drafts
* **Endpoint**: `POST /emails/send-approved`
* **Description**: Standard background queue process to dispatch all approved drafts while enforcing daily quotas and delays.
* **Response**:
  ```json
  {
    "processed_count": 10,
    "sent": 8,
    "failed": 2
  }
  ```

---

## 4. Telemetry & Analytics

### Dashboard Summary
* **Endpoint**: `GET /analytics/summary`
* **Description**: Returns all KPI counters for display on the main dashboard cards.
* **Response**:
  ```json
  {
    "total_leads": 120,
    "total_drafts": 240,
    "pending_drafts": 15,
    "approved_drafts": 8,
    "sent_today": 12,
    "failed_today": 1,
    "website_emails_sent": 85,
    "erp_emails_sent": 74,
    "daily_limit": 50,
    "remaining_today": 38,
    "approval_rate": 84.5,
    "failure_rate": 1.2
  }
  ```

---

## 5. Safety & Opt-Outs

### Add to Do Not Contact (DNC) List
* **Endpoint**: `POST /do-not-contact`
* **Request Body**:
  ```json
  {
    "email": "optout@target.com",
    "reason": "Requested unsubscribe"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Email added to DNC list."
  }
  ```

### List DNC Registry
* **Endpoint**: `GET /do-not-contact`
* **Response**:
  ```json
  [
    {
      "email": "optout@target.com",
      "reason": "Requested unsubscribe",
      "created_at": "2026-06-19T18:00:00Z"
    }
  ]
  ```
