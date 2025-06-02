-- Script to fix existing templates that have is_structured set to true
-- This will update them to use conversational format instead

UPDATE prompt_templates 
SET template_text = REPLACE(template_text, '"is_structured":true', '"is_structured":false')
WHERE template_text LIKE '%"is_structured":true%';

-- Also update any templates that might be using old structured format
UPDATE prompt_templates 
SET template_text = REPLACE(template_text, '"is_structured": true', '"is_structured": false')
WHERE template_text LIKE '%"is_structured": true%';

-- Log the changes
SELECT 
  'Updated ' || COUNT(*) || ' templates to use conversational format' as update_summary
FROM prompt_templates 
WHERE template_text LIKE '%"is_structured":false%'; 