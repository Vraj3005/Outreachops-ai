# OutreachOps AI — Database Schema

This document details the PostgreSQL database tables and relationships utilized by OutreachOps AI via Supabase.

---

## Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ leads : "owns"
    users ||--o{ campaigns : "runs"
    users ||--o{ email_drafts : "creates"
    users ||--o{ send_logs : "tracks"
    users ||--o{ do_not_contact : "manages"
    users ||--o{ prompt_templates : "saves"

    leads ||--o{ email_drafts : "has"
    leads ||--o{ send_logs : "triggers"
    email_drafts ||--o{ send_logs : "logs"

    users {
        uuid id PK
        varchar email UNIQUE
        varchar full_name
        timestamp created_at
    }

    leads {
        uuid id PK
        uuid user_id FK
        varchar company_name
        varchar website
        varchar industry
        varchar country
        varchar city
        varchar contact_email
        varchar phone
        text website_pain_points
        text erp_approach
        varchar lead_status
        varchar source_sheet_name
        varchar source_row_number
        timestamp created_at
        timestamp updated_at
    }

    email_drafts {
        uuid id PK
        uuid lead_id FK
        uuid user_id FK
        varchar email_type
        varchar subject
        text body
        varchar status
        varchar ai_model
        varchar prompt_version
        integer quality_score
        integer spam_risk_score
        integer personalization_score
        integer clarity_score
        text last_error
        timestamp generated_at
        timestamp approved_at
        timestamp sent_at
        timestamp created_at
        timestamp updated_at
    }

    campaigns {
        uuid id PK
        uuid user_id FK
        varchar name
        varchar campaign_type
        varchar status
        integer daily_send_limit
        integer delay_seconds
        timestamp created_at
        timestamp updated_at
    }

    send_logs {
        uuid id PK
        uuid draft_id FK
        uuid lead_id FK
        uuid user_id FK
        varchar recipient_email
        varchar subject
        varchar email_type
        varchar status
        text error_message
        varchar gmail_message_id
        timestamp sent_at
    }

    do_not_contact {
        uuid id PK
        uuid user_id FK
        varchar email
        varchar reason
        timestamp created_at
    }

    prompt_templates {
        uuid id PK
        uuid user_id FK
        varchar email_type
        varchar tone
        varchar length
        varchar cta_style
        text system_instruction
        text user_prompt
        varchar version
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
```

---

## Tables Definition

### 1. `users`
Tracks registered SaaS users. Synchronized with Supabase Authentication profiles.
* `id` (UUID, Primary Key)
* `email` (VARCHAR, Unique, Not Null)
* `full_name` (VARCHAR)
* `created_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)

### 2. `leads`
Stores cold leads imported from Google Sheets.
* `id` (UUID, Primary Key, Default `gen_random_uuid()`)
* `user_id` (UUID, Foreign Key referencing `users.id`, Cascade on Delete)
* `company_name` (VARCHAR, Not Null)
* `website` (VARCHAR, Not Null)
* `industry` (VARCHAR)
* `country` (VARCHAR)
* `city` (VARCHAR)
* `contact_email` (VARCHAR, Not Null)
* `phone` (VARCHAR)
* `website_pain_points` (TEXT)
* `erp_approach` (TEXT)
* `lead_status` (VARCHAR, Default `'Pending'`)
* `source_sheet_name` (VARCHAR)
* `source_row_number` (VARCHAR)
* `created_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)
* `updated_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)

### 3. `email_drafts`
AI personalized email pitches for review.
* `id` (UUID, Primary Key)
* `lead_id` (UUID, Foreign Key referencing `leads.id`, Cascade on Delete)
* `user_id` (UUID, Foreign Key referencing `users.id`)
* `email_type` (VARCHAR) - Can be `'website'`, `'erp'`, or `'follow_up'`
* `subject` (VARCHAR)
* `body` (TEXT)
* `status` (VARCHAR, Default `'draft'`) - Can be `'draft'`, `'approved'`, `'sent'`, `'failed'`, or `'rejected'`
* `ai_model` (VARCHAR) - Model identifier (e.g. `gemini-2.5-flash-lite`)
* `prompt_version` (VARCHAR)
* `quality_score` (INTEGER)
* `spam_risk_score` (INTEGER)
* `personalization_score` (INTEGER)
* `clarity_score` (INTEGER)
* `last_error` (TEXT)
* `generated_at` (TIMESTAMP, Default `now()`)
* `approved_at` (TIMESTAMP)
* `sent_at` (TIMESTAMP)
* `created_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)
* `updated_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)

### 4. `send_logs`
Audit trails of dispatch actions.
* `id` (UUID, Primary Key)
* `draft_id` (UUID, Foreign Key referencing `email_drafts.id`, Nullable)
* `lead_id` (UUID, Foreign Key referencing `leads.id`)
* `user_id` (UUID, Foreign Key referencing `users.id`)
* `recipient_email` (VARCHAR, Not Null)
* `subject` (VARCHAR)
* `email_type` (VARCHAR)
* `status` (VARCHAR) - Can be `'sent'` or `'failed'`
* `error_message` (TEXT, Nullable)
* `gmail_message_id` (VARCHAR, Nullable)
* `sent_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)

### 5. `do_not_contact` (DNC)
Restricted recipient registry. Preventative safety lock.
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key referencing `users.id`)
* `email` (VARCHAR, Not Null)
* `reason` (VARCHAR)
* `created_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)

### 6. `prompt_templates`
Custom prompt instructions saved within Prompt Studio.
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key referencing `users.id`)
* `email_type` (VARCHAR)
* `tone` (VARCHAR)
* `length` (VARCHAR)
* `cta_style` (VARCHAR)
* `system_instruction` (TEXT)
* `user_prompt` (TEXT)
* `version` (VARCHAR)
* `is_active` (BOOLEAN, Default `false`)
* `created_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)
* `updated_at` (TIMESTAMP WITH TIME ZONE, Default `now()`)
