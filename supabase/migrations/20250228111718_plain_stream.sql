/*
  # User management functions

  1. New Functions
    - `ensure_user_exists` - Function to ensure a user record exists in the users table
    - `get_user_profile` - Function to get a user's profile data
    - `update_user_profile` - Function to update a user's profile data

  2. Security
    - All functions are SECURITY DEFINER to bypass RLS
    - Functions are granted to authenticated users
*/

-- Function to ensure a user record exists
CREATE OR REPLACE FUNCTION ensure_user_exists(
  user_id UUID,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  field_study TEXT DEFAULT '',
  education_lvl TEXT DEFAULT ''
)
RETURNS BOOLEAN AS $$
DECLARE
  user_exists BOOLEAN;
BEGIN
  -- Check if user exists
  SELECT EXISTS(SELECT 1 FROM users WHERE id = user_id) INTO user_exists;
  
  -- If user doesn't exist, create them
  IF NOT user_exists THEN
    INSERT INTO users (
      id, 
      first_name, 
      last_name, 
      field_of_study, 
      education_level
    )
    VALUES (
      user_id,
      first_name,
      last_name,
      field_study,
      education_lvl
    );
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user profile
CREATE OR REPLACE FUNCTION get_user_profile(user_id UUID)
RETURNS JSONB AS $$
DECLARE
  profile JSONB;
BEGIN
  -- Ensure user exists first
  PERFORM ensure_user_exists(user_id);
  
  -- Get user profile data
  SELECT jsonb_build_object(
    'id', id,
    'first_name', first_name,
    'last_name', last_name,
    'field_of_study', field_of_study,
    'education_level', education_level,
    'learning_preferences', learning_preferences,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO profile
  FROM users
  WHERE id = user_id;
  
  RETURN profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user profile
CREATE OR REPLACE FUNCTION update_user_profile(
  user_id UUID,
  first_name TEXT DEFAULT NULL,
  last_name TEXT DEFAULT NULL,
  field_study TEXT DEFAULT NULL,
  education_lvl TEXT DEFAULT NULL,
  learning_prefs JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  updated_profile JSONB;
BEGIN
  -- Ensure user exists first
  PERFORM ensure_user_exists(user_id);
  
  -- Update user profile with non-null values
  UPDATE users
  SET
    first_name = COALESCE(update_user_profile.first_name, users.first_name),
    last_name = COALESCE(update_user_profile.last_name, users.last_name),
    field_of_study = COALESCE(update_user_profile.field_study, users.field_of_study),
    education_level = COALESCE(update_user_profile.education_lvl, users.education_level),
    learning_preferences = COALESCE(update_user_profile.learning_prefs, users.learning_preferences),
    updated_at = now()
  WHERE id = user_id
  RETURNING jsonb_build_object(
    'id', id,
    'first_name', first_name,
    'last_name', last_name,
    'field_of_study', field_of_study,
    'education_level', education_level,
    'learning_preferences', learning_preferences,
    'updated_at', updated_at
  ) INTO updated_profile;
  
  RETURN updated_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION ensure_user_exists TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_profile TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_profile TO authenticated;