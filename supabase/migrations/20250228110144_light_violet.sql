/*
  # Fix user policies for insertion

  1. Changes
    - Replace the problematic policies with correctly formatted policies for INSERT operations
    - Ensure the handle_new_user function has SECURITY DEFINER permission
  
  2. Security
    - Allow authenticated users to insert their own record
    - Set security context for the handle_new_user function
*/

-- Add policy to allow authenticated users to insert their own record
CREATE POLICY "Users can insert own record"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Ensure the handle_new_user function has the necessary permissions
ALTER FUNCTION public.handle_new_user() SECURITY DEFINER;