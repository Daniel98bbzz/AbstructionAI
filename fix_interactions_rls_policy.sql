-- Fix interactions table RLS policy
-- This script fixes the "new row violates row-level security policy" error

-- Drop existing policies that conflict
DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions;
DROP POLICY IF EXISTS "Users can insert own interactions" ON public.interactions;
DROP POLICY IF EXISTS "Restrictive interactions policy" ON public.interactions;

-- Create a new policy that allows anonymous interactions
CREATE POLICY "Allow all interactions" 
ON public.interactions
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Also fix prompt_template_usage table if needed
DROP POLICY IF EXISTS "Restrictive template usage policy" ON public.prompt_template_usage;

CREATE POLICY "Allow template usage tracking" 
ON public.prompt_template_usage
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Enable RLS on both tables to ensure policies are active
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_template_usage ENABLE ROW LEVEL SECURITY;

-- Verify the changes
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE tablename = 'interactions' OR tablename = 'prompt_template_usage'; 