-- Migration: Add last_error column to email_drafts table
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS last_error TEXT;
