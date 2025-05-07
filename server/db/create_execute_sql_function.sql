-- This function allows for executing SQL statements from a client
-- IMPORTANT: This function has security implications and should be restricted to admin users only

-- Create the function
CREATE OR REPLACE FUNCTION execute_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Function runs with the privileges of the creator
AS $$
BEGIN
  -- Check if the current user has admin role
  -- This assumes you have an is_admin column in your user_profiles table
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: Only administrators can execute SQL statements';
  END IF;

  -- Execute the provided SQL
  EXECUTE sql;
END;
$$;

-- Set execution privileges
REVOKE ALL ON FUNCTION execute_sql FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_sql TO authenticated;

-- Add comment explaining the function's purpose and security implications
COMMENT ON FUNCTION execute_sql IS 'Executes SQL code with admin privileges. RESTRICTED to admin users only to prevent SQL injection attacks.'; 