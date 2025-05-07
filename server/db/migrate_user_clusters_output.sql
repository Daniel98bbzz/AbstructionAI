-- Script to migrate user_clusters table to new schema
-- This script will:
-- 1. Backup the current table
-- 2. Create the new table
-- 3. Transfer any existing data
-- 4. Drop the old table and rename the new one

-- Start transaction
BEGIN;

-- Create backup of existing table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_clusters') THEN
        CREATE TABLE user_clusters_backup AS
        SELECT * FROM user_clusters;
        
        RAISE NOTICE 'Created backup table: user_clusters_backup';
    END IF;
END $$;

-- Drop existing table if it exists (and its dependencies)
DROP TABLE IF EXISTS user_clusters CASCADE;

-- Create the new table with updated schema
CREATE TABLE user_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_type VARCHAR(50) NOT NULL,
  cluster_score FLOAT NOT NULL,
  last_calculated TIMESTAMPTZ DEFAULT now(),
  learning_style_factor JSONB,
  technical_depth_factor JSONB,
  quiz_performance_factor JSONB,
  feedback_pattern_factor JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index on user_id for faster lookups
CREATE INDEX user_clusters_user_id_idx ON user_clusters (user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_clusters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to call the function
CREATE TRIGGER update_user_clusters_updated_at
BEFORE UPDATE ON user_clusters
FOR EACH ROW
EXECUTE FUNCTION update_user_clusters_updated_at();

-- Enable Row Level Security
ALTER TABLE user_clusters ENABLE ROW LEVEL SECURITY;

-- Create policies for accessing and modifying user clusters
CREATE POLICY "Users can view their own clusters"
  ON user_clusters
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own clusters"
  ON user_clusters
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Transfer data from backup if it exists
DO $$
DECLARE
    has_cluster_score boolean;
    has_last_calculated boolean;
    has_learning_style_factor boolean;
    has_technical_depth_factor boolean;
    has_quiz_performance_factor boolean;
    has_feedback_pattern_factor boolean;
    has_created_at boolean;
    has_updated_at boolean;
    sql_query text;
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_clusters_backup') THEN
        -- Check which columns exist in the backup table
        has_cluster_score := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'cluster_score'
        );
        
        has_last_calculated := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'last_calculated'
        );
        
        has_learning_style_factor := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'learning_style_factor'
        );
        
        has_technical_depth_factor := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'technical_depth_factor'
        );
        
        has_quiz_performance_factor := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'quiz_performance_factor'
        );
        
        has_feedback_pattern_factor := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'feedback_pattern_factor'
        );
        
        has_created_at := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'created_at'
        );
        
        has_updated_at := EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'user_clusters_backup' AND column_name = 'updated_at'
        );
        
        -- Build SQL query with proper handling of quotes and JSON literals
        sql_query := 
            'INSERT INTO user_clusters (
                id, 
                user_id, 
                cluster_type, 
                cluster_score, 
                last_calculated,
                learning_style_factor,
                technical_depth_factor,
                quiz_performance_factor,
                feedback_pattern_factor,
                created_at, 
                updated_at
            )
            SELECT 
                id, 
                user_id, 
                cluster_type, ' ||
                CASE WHEN has_cluster_score THEN 'COALESCE(cluster_score, 0.0)' ELSE '0.0' END || ', ' ||
                CASE WHEN has_last_calculated THEN 'COALESCE(last_calculated, now())' ELSE 'now()' END || ', ' ||
                CASE WHEN has_learning_style_factor THEN 'COALESCE(learning_style_factor, ''{}''::jsonb)' ELSE '''{}''::jsonb' END || ', ' ||
                CASE WHEN has_technical_depth_factor THEN 'COALESCE(technical_depth_factor, ''{}''::jsonb)' ELSE '''{}''::jsonb' END || ', ' ||
                CASE WHEN has_quiz_performance_factor THEN 'COALESCE(quiz_performance_factor, ''{}''::jsonb)' ELSE '''{}''::jsonb' END || ', ' ||
                CASE WHEN has_feedback_pattern_factor THEN 'COALESCE(feedback_pattern_factor, ''{}''::jsonb)' ELSE '''{}''::jsonb' END || ', ' ||
                CASE WHEN has_created_at THEN 'COALESCE(created_at, now())' ELSE 'now()' END || ', ' ||
                CASE WHEN has_updated_at THEN 'COALESCE(updated_at, now())' ELSE 'now()' END || '
            FROM user_clusters_backup';
        
        -- Log the SQL for debugging
        RAISE NOTICE 'Executing SQL: %', sql_query;
        
        -- Execute the built query
        EXECUTE sql_query;
        
        RAISE NOTICE 'Data transferred from backup table to new table';
    END IF;
END $$;

-- Verify the prompt_refinements table exists and create it if not
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'prompt_refinements') THEN
        -- Create the prompt_refinements table
        CREATE TABLE prompt_refinements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          session_id UUID NOT NULL,
          original_prompt TEXT NOT NULL,
          refined_prompt TEXT NOT NULL,
          cluster_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );

        -- Add indices for faster lookups
        CREATE INDEX prompt_refinements_user_id_idx ON prompt_refinements (user_id);
        CREATE INDEX prompt_refinements_session_id_idx ON prompt_refinements (session_id);

        -- Enable Row Level Security
        ALTER TABLE prompt_refinements ENABLE ROW LEVEL SECURITY;

        -- Create policies for accessing prompt refinements
        CREATE POLICY "Users can view their own prompt refinements"
          ON prompt_refinements
          FOR SELECT
          USING (auth.uid() = user_id);
          
        RAISE NOTICE 'Created prompt_refinements table';
    END IF;
END $$;

-- Add table comments
COMMENT ON TABLE user_clusters IS 'Stores user cluster assignments used for prompt refinement';
COMMENT ON TABLE prompt_refinements IS 'Logs of prompt refinements performed by the Supervisor';

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON user_clusters TO authenticated;
GRANT SELECT ON prompt_refinements TO authenticated;

-- Commit the transaction
COMMIT;

-- Final message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully';
END $$; 