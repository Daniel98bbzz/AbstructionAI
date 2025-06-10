-- Migration: Add feedback_category column to interactions table for pedagogical feedback classification
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS feedback_category TEXT; 