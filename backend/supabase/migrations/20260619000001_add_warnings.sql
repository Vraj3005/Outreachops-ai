-- Migration: Add warnings column to email_drafts table
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS warnings TEXT[] DEFAULT '{}';
