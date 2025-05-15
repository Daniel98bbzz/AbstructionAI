-- This function creates a user profile, bypassing RLS
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  username TEXT,
  occupation TEXT,
  age INT,
  education_level TEXT,
  interests TEXT[],
  learning_style TEXT,
  technical_depth INT,
  preferred_analogy_domains TEXT[],
  main_learning_goal TEXT
) RETURNS JSONB 
SECURITY DEFINER 
AS $$
DECLARE
  result JSONB;
BEGIN
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
    main_learning_goal
  ) VALUES (
    user_id,
    username,
    occupation,
    age,
    education_level,
    interests,
    learning_style,
    technical_depth,
    preferred_analogy_domains,
    main_learning_goal
  )
  RETURNING to_jsonb(user_profiles.*) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql; 