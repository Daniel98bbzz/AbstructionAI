CREATE TABLE response_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  num_clusters INTEGER NOT NULL,
  total_responses INTEGER NOT NULL,
  cluster_analysis JSONB NOT NULL,
  metadata JSONB
);

-- Grant access to authenticated users
ALTER TABLE response_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own response_clusters"
  ON response_clusters
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own response_clusters"
  ON response_clusters
  FOR INSERT
  TO authenticated
  WITH CHECK (true);