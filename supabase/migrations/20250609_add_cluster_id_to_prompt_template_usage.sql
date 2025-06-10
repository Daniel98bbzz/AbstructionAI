-- Migration: Add cluster_id to prompt_template_usage for semantic cluster association
ALTER TABLE prompt_template_usage
ADD COLUMN cluster_id INT; 