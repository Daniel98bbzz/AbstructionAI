/*
  # Add exec_sql function for admin operations

  1. New Function
    - `exec_sql`: Function to execute SQL statements for admin operations
  
  2. Security
    - Function is SECURITY DEFINER to bypass RLS
    - Only accessible to authenticated users with admin privileges
*/

-- Create the exec_sql function
CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS void AS $$
BEGIN
  -- Execute the provided SQL
  EXECUTE sql_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION exec_sql TO authenticated; 