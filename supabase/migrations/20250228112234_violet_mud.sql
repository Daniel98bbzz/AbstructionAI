/*
  # Fix migration to avoid policy conflict

  1. Changes
     - Check if policy exists before creating it
     - Ensure handle_new_user function has SECURITY DEFINER
*/

-- Check if policy exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'users' 
    AND policyname = 'Users can insert own record'
  ) THEN
    -- Add policy to allow authenticated users to insert their own record
    EXECUTE 'CREATE POLICY "Users can insert own record"
      ON users
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

-- Ensure the handle_new_user function has the necessary permissions
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.handle_new_user() SECURITY DEFINER';
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function handle_new_user does not exist, skipping alteration';
END $$;