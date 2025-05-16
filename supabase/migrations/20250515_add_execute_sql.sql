/*
  # Add execute_sql function for admin operations

  This migration adds the execute_sql function which is needed by the application
  to fix RLS policy errors. The application is looking for this function but
  was finding exec_sql instead.
  
  1. New Function
    - `execute_sql`: Alias function for exec_sql to maintain compatibility
*/

-- Create the execute_sql function
CREATE OR REPLACE FUNCTION execute_sql(sql TEXT)
RETURNS void AS $$
BEGIN
  -- Execute the provided SQL
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION execute_sql TO authenticated; 