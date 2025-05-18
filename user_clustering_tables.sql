-- Tables for User Clustering feature

-- Table for storing user clusters
CREATE TABLE IF NOT EXISTS user_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  centroid JSONB NOT NULL, -- JSON object with cluster center preferences
  member_count INTEGER DEFAULT 0,
  metadata JSONB
);

-- Table for storing user assignments to clusters
CREATE TABLE IF NOT EXISTS user_cluster_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Changed from UUID to TEXT to support string IDs
  cluster_id UUID NOT NULL REFERENCES user_clusters(id),
  similarity NUMERIC NOT NULL, -- How similar user is to cluster (0-1)
  preferences JSONB NOT NULL, -- Normalized user preferences
  created_at TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Table for storing template recommendations per cluster
CREATE TABLE IF NOT EXISTS cluster_template_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES user_clusters(id),
  template_id UUID NOT NULL REFERENCES prompt_templates(id),
  topic VARCHAR NOT NULL,
  score NUMERIC NOT NULL, -- Recommendation score (0-1)
  usage_count INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 0, -- How successful this recommendation was (0-1)
  created_at TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'user_clusters_idx') THEN
    CREATE INDEX user_clusters_idx ON user_clusters(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'user_cluster_assignments_user_idx') THEN
    CREATE INDEX user_cluster_assignments_user_idx ON user_cluster_assignments(user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'user_cluster_assignments_cluster_idx') THEN
    CREATE INDEX user_cluster_assignments_cluster_idx ON user_cluster_assignments(cluster_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'cluster_template_recommendations_cluster_idx') THEN
    CREATE INDEX cluster_template_recommendations_cluster_idx ON cluster_template_recommendations(cluster_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'cluster_template_recommendations_template_idx') THEN
    CREATE INDEX cluster_template_recommendations_template_idx ON cluster_template_recommendations(template_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'cluster_template_recommendations_topic_idx') THEN
    CREATE INDEX cluster_template_recommendations_topic_idx ON cluster_template_recommendations(topic);
  END IF;
END $$;

-- Enable RLS if not already enabled
DO $$
BEGIN
  -- Check if RLS is already enabled before trying to enable it
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'user_clusters' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE user_clusters ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'user_cluster_assignments' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE user_cluster_assignments ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'cluster_template_recommendations' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE cluster_template_recommendations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies if they don't exist
DO $$
BEGIN
  -- user_clusters policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_clusters' AND policyname = 'Users can read user_clusters') THEN
    CREATE POLICY "Users can read user_clusters"
      ON user_clusters
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_clusters' AND policyname = 'Users can insert user_clusters') THEN
    CREATE POLICY "Users can insert user_clusters"
      ON user_clusters
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  -- Simplified user_cluster_assignments policies to avoid type casting issues
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_cluster_assignments' AND policyname = 'Authenticated users can access user_cluster_assignments') THEN
    CREATE POLICY "Authenticated users can access user_cluster_assignments"
      ON user_cluster_assignments
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_cluster_assignments' AND policyname = 'Authenticated users can insert user_cluster_assignments') THEN
    CREATE POLICY "Authenticated users can insert user_cluster_assignments"
      ON user_cluster_assignments
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_cluster_assignments' AND policyname = 'Authenticated users can update user_cluster_assignments') THEN
    CREATE POLICY "Authenticated users can update user_cluster_assignments"
      ON user_cluster_assignments
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  -- cluster_template_recommendations policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cluster_template_recommendations' AND policyname = 'Users can read cluster_template_recommendations') THEN
    CREATE POLICY "Users can read cluster_template_recommendations"
      ON cluster_template_recommendations
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cluster_template_recommendations' AND policyname = 'Users can insert cluster_template_recommendations') THEN
    CREATE POLICY "Users can insert cluster_template_recommendations"
      ON cluster_template_recommendations
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_cluster_assignments_timestamp') THEN
    CREATE TRIGGER update_user_cluster_assignments_timestamp
    BEFORE UPDATE ON user_cluster_assignments
    FOR EACH ROW
    EXECUTE PROCEDURE update_timestamp();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cluster_template_recommendations_timestamp') THEN
    CREATE TRIGGER update_cluster_template_recommendations_timestamp
    BEFORE UPDATE ON cluster_template_recommendations
    FOR EACH ROW
    EXECUTE PROCEDURE update_timestamp();
  END IF;
END $$; 