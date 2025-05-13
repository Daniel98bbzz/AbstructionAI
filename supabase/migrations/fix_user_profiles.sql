/*
  Migration to fix existing user profiles by ensuring they have an adaptive_prompt
*/

-- First make sure the adaptive_prompt column exists
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS adaptive_prompt TEXT DEFAULT '';

-- Set up adaptive prompts for all profiles that don't have one
UPDATE user_profiles
SET adaptive_prompt = json_build_object(
  'preferences', json_build_object(
    'technical_depth', technical_depth,
    'learning_style', learning_style
  ),
  'learned_patterns', json_build_object(
    'effective_analogies', '[]'::jsonb,
    'confusing_explanations', '[]'::jsonb,
    'preferred_domains', CASE 
      WHEN Array_length(preferred_analogy_domains, 1) > 0 THEN to_jsonb(preferred_analogy_domains)
      ELSE '[]'::jsonb
    END,
    'avoided_domains', '[]'::jsonb
  ),
  'custom_instructions', CASE 
    WHEN learning_style = 'Visual' THEN '["Use visual explanations and descriptions when possible"]'::jsonb
    WHEN learning_style = 'Auditory' THEN '["Describe concepts in ways that are easy to verbalize or discuss"]'::jsonb
    WHEN learning_style = 'Kinesthetic' THEN '["Include examples that involve practical, hands-on applications"]'::jsonb
    ELSE '[]'::jsonb
  END
)::text
WHERE adaptive_prompt IS NULL OR adaptive_prompt = '';

-- Create RPC function to get or create a user's profile with adaptive_prompt
CREATE OR REPLACE FUNCTION get_or_create_user_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile JSONB;
BEGIN
  -- Try to get existing profile
  SELECT to_jsonb(up) INTO v_profile
  FROM user_profiles up
  WHERE id = p_user_id;
  
  -- If profile exists, return it
  IF v_profile IS NOT NULL THEN
    -- Make sure it has an adaptive_prompt
    IF (v_profile->>'adaptive_prompt') IS NULL OR (v_profile->>'adaptive_prompt') = '' THEN
      UPDATE user_profiles
      SET adaptive_prompt = json_build_object(
        'preferences', json_build_object(
          'technical_depth', COALESCE((v_profile->>'technical_depth')::int, 50),
          'learning_style', COALESCE(v_profile->>'learning_style', 'Visual')
        ),
        'learned_patterns', json_build_object(
          'effective_analogies', '[]'::jsonb,
          'confusing_explanations', '[]'::jsonb,
          'preferred_domains', '[]'::jsonb,
          'avoided_domains', '[]'::jsonb
        ),
        'custom_instructions', CASE 
          WHEN v_profile->>'learning_style' = 'Visual' THEN '["Use visual explanations and descriptions when possible"]'::jsonb
          WHEN v_profile->>'learning_style' = 'Auditory' THEN '["Describe concepts in ways that are easy to verbalize or discuss"]'::jsonb
          WHEN v_profile->>'learning_style' = 'Kinesthetic' THEN '["Include examples that involve practical, hands-on applications"]'::jsonb
          ELSE '[]'::jsonb
        END
      )::text
      WHERE id = p_user_id
      RETURNING to_jsonb(user_profiles.*) INTO v_profile;
    END IF;
    
    RETURN v_profile;
  END IF;
  
  -- Profile doesn't exist, create it
  INSERT INTO user_profiles (
    id,
    username,
    occupation,
    age,
    education_level,
    interests,
    learning_style,
    technical_depth,
    preferred_analogy_domains,
    main_learning_goal,
    adaptive_prompt,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    'user_' || left(p_user_id::text, 8),
    'Student',
    25,
    'Undergraduate',
    ARRAY['Video Games', 'Art'],
    'Visual',
    50,
    ARRAY['Gaming', 'Cooking'],
    'Personal Interest',
    json_build_object(
      'preferences', json_build_object(
        'technical_depth', 50,
        'learning_style', 'Visual'
      ),
      'learned_patterns', json_build_object(
        'effective_analogies', '[]'::jsonb,
        'confusing_explanations', '[]'::jsonb,
        'preferred_domains', '[]'::jsonb,
        'avoided_domains', '[]'::jsonb
      ),
      'custom_instructions', '["Use visual explanations and descriptions when possible"]'::jsonb
    )::text,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE
    SET adaptive_prompt = EXCLUDED.adaptive_prompt
    RETURNING to_jsonb(user_profiles.*) INTO v_profile;
  
  RETURN v_profile;
END;
$$; 