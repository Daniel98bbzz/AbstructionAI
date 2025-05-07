-- User Clusters Table
-- This table stores user cluster assignments and related data

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

-- Create a table for prompt refinement logs
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

COMMENT ON TABLE user_clusters IS 'Stores user cluster assignments used for prompt refinement';
COMMENT ON TABLE prompt_refinements IS 'Logs of prompt refinements performed by the Supervisor'; 