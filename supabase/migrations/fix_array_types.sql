/*
  Migration to initialize adaptive prompts for existing users
  This ensures all existing users have a valid adaptive prompt structure
*/

-- First make sure the adaptive_prompt column exists
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS adaptive_prompt TEXT DEFAULT '';

-- Create a function to initialize adaptive prompts
CREATE OR REPLACE FUNCTION initialize_adaptive_prompt()
RETURNS void AS $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT id, interests, preferred_analogy_domains, learning_style, technical_depth 
    FROM user_profiles
    WHERE adaptive_prompt IS NULL OR adaptive_prompt = ''
  LOOP
    -- Create default adaptive prompt structure as JSON
    UPDATE user_profiles
    SET adaptive_prompt = json_build_object(
      'preferences', json_build_object(
        'technical_depth', COALESCE(user_record.technical_depth, 50),
        'learning_style', COALESCE(user_record.learning_style, 'Visual')
      ),
      'learned_patterns', json_build_object(
        'effective_analogies', '[]'::jsonb,
        'confusing_explanations', '[]'::jsonb,
        'preferred_domains', (
          CASE 
            WHEN user_record.preferred_analogy_domains IS NULL THEN '[]'::jsonb
            ELSE to_jsonb(user_record.preferred_analogy_domains)
          END
        ),
        'avoided_domains', '[]'::jsonb
      ),
      'custom_instructions', 
      CASE 
        WHEN user_record.learning_style = 'Visual' THEN '["Use visual explanations and descriptions when possible"]'::jsonb
        WHEN user_record.learning_style = 'Auditory' THEN '["Describe concepts in ways that are easy to verbalize or discuss"]'::jsonb
        WHEN user_record.learning_style = 'Kinesthetic' THEN '["Include examples that involve practical, hands-on applications"]'::jsonb
        ELSE '[]'::jsonb
      END
    )::text
    WHERE id = user_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT initialize_adaptive_prompt();

-- Drop the function after use
DROP FUNCTION initialize_adaptive_prompt();

-- Add index to make adaptive prompt lookups more efficient
CREATE INDEX IF NOT EXISTS idx_user_profiles_adaptive_prompt ON user_profiles (id) WHERE adaptive_prompt IS NOT NULL; 