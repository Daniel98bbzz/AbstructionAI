/*
  # Create RPC Function for User Creation

  1. New Function
     - `create_user_record`: Creates a record in the public.users table bypassing RLS
  
  2. Security
     - Function is SECURITY DEFINER to bypass RLS
     - Validates that the user_id matches the authenticated user's ID
*/

-- Create RPC function to create a user record
CREATE OR REPLACE FUNCTION create_user_record(
  user_id UUID,
  first_name TEXT,
  last_name TEXT,
  field_study TEXT,
  education_lvl TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate that the user is creating their own record
  IF auth.uid() <> user_id THEN
    RAISE EXCEPTION 'You can only create your own user record';
  END IF;

  -- Insert the user record
  INSERT INTO public.users (
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
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    field_of_study = EXCLUDED.field_of_study,
    education_level = EXCLUDED.education_level,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_record TO authenticated;