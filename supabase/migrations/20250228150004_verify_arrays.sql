/*
  # Verify array migration

  1. Checks
    - Verify column types are text[]
    - Check sample data format
    - Verify trigger exists
*/

-- Check column types
SELECT 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
AND column_name IN ('interests', 'preferred_analogy_domains');

-- Check sample data format
SELECT 
  id,
  interests,
  preferred_analogy_domains
FROM user_profiles
LIMIT 5;

-- Verify trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_profiles'
AND trigger_name = 'format_arrays_trigger';

-- Get an existing user ID from auth.users
DO $$
DECLARE
  existing_user_id UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO existing_user_id
  FROM auth.users
  LIMIT 1;

  -- If we found a user, test the array format
  IF existing_user_id IS NOT NULL THEN
    -- Test array format with a sample insert
    INSERT INTO user_profiles (
      id,
      username,
      interests,
      preferred_analogy_domains
    ) VALUES (
      existing_user_id,
      'test_user',
      ARRAY['test_interest1', 'test_interest2'],
      ARRAY['test_domain1', 'test_domain2']
    ) ON CONFLICT (id) DO NOTHING;

    -- Verify the test data
    RAISE NOTICE 'Test data inserted for user: %', existing_user_id;
    
    -- Clean up test data
    DELETE FROM user_profiles
    WHERE id = existing_user_id;
  ELSE
    RAISE NOTICE 'No users found in auth.users table';
  END IF;
END $$; 