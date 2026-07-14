# OutreachOps AI — API Reference

This document describes the FastAPI REST API v2 endpoints, request parameters, response payloads, and authentication.

---

## 1. Authentication
All API endpoints require client authentication using a Bearer token:
* **Header**: `Authorization: Bearer <token>`
* In **Demo Mode**, setting the header value to `Bearer mock-owner-token` bypasses remote server checks.

---

## 2. Ingestion & Mapping API

### Preview Imported spreadsheet Rows
* **Endpoint**: `POST /api/v1/imports/preview`
* **Description**: Parses an uploaded file to preview columns and data rows before committing them.
* **Payload**: Form data with file attachment.
* **Response**:
  ```json
  {
    "filename": "leads.csv",
    "headers": ["First Name", "Email", "Company", "Website"],
    "row_count": 250,
    "preview_rows": [
      ["John", "john@example.com", "Apex Inc", "apex.com"]
    ]
  }
  ```

---

## 3. Settings & Controls API

### Retrieve Owner Settings & Controls
* **Endpoint**: `GET /api/v1/settings`
* **Response**:
  ```json
  {
    "owner_id": "owner-uuid-123",
    "business_name": "Pitbull Corporations",
    "website": "https://pitbullcorporations.com",
    "sender_name": "Rohit",
    "sender_email": "yash69699696@gmail.com",
    "daily_send_limit": 50,
    "minimum_send_spacing_seconds": 60,
    "allowed_send_start": "09:00",
    "allowed_send_end": "17:00",
    "generation_worker_paused": false,
    "sending_worker_paused": false,
    "queue_drain_enabled": false,
    "banned_phrases": ["free offering", "guarantee click"]
  }
  ```

### Update Owner Settings & Controls
* **Endpoint**: `PATCH /api/v1/settings`
* **Payload**:
  ```json
  {
    "generation_worker_paused": true,
    "sending_worker_paused": false,
    "queue_drain_enabled": true
  }
  ```
* **Response**: Returns the updated settings object.

---

## 4. Diagnostics & Observability API

### Detailed Engine Diagnostics
* **Endpoint**: `GET /api/v1/health/diagnostics`
* **Description**: Restricted to authenticated owners. Returns full status of heartbeats, queues, and integration status.
* **Response**:
  ```json
  {
    "timestamp": "2026-07-14T10:10:53.838779+00:00",
    "database": {
      "status": "connected",
      "details": "Verification successful"
    },
    "workers": {
      "sending_worker": {
        "status": "healthy",
        "last_heartbeat": "2026-07-14T10:10:53+00:00"
      },
      "generation_worker": {
        "status": "healthy",
        "last_heartbeat": "2026-07-14T10:10:53+00:00"
      }
    },
    "gmail": {
      "status": "connected",
      "details": "OAuth tokens verified successfully"
    },
    "gemini": {
      "status": "connected",
      "details": "Gemini API verification check succeeded."
    },
    "queues": {
      "generation_queue_pending": 0,
      "generation_queue_processing": 0,
      "send_queue_pending": 0,
      "send_queue_processing": 0
    },
    "stuck_jobs": {
      "generation_stuck_count": 0,
      "send_stuck_count": 0
    },
    "retries_and_failures": {
      "retry_count": 0,
      "dead_letter_count": 0
    },
    "controls": {
      "generation_worker_paused": false,
      "sending_worker_paused": false,
      "queue_drain_enabled": false
    }
  }
  ```
