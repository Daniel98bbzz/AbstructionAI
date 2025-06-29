-- Create Crowd Wisdom System Tables
-- This migration creates all tables needed for the crowd wisdom mechanism

-- Main table for storing query clusters
CREATE TABLE IF NOT EXISTS crowd_wisdom_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centroid_embedding VECTOR(1536), -- OpenAI text-embedding-3-small
  representative_query TEXT NOT NULL,
  cluster_name TEXT,
  prompt_enhancement TEXT DEFAULT '', -- Dynamic prompt addition
  total_queries INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0.0,
  last_success_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking individual query assignments to clusters
CREATE TABLE IF NOT EXISTS crowd_wisdom_query_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  query_embedding VECTOR(1536),
  cluster_id UUID REFERENCES crowd_wisdom_clusters(id) ON DELETE CASCADE,
  similarity_score FLOAT NOT NULL,
  response_text TEXT,
  user_feedback_positive BOOLEAN,
  feedback_confidence FLOAT DEFAULT 0.0,
  session_id TEXT,
  user_id TEXT,
  processing_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for logging learning events and pattern extraction
CREATE TABLE IF NOT EXISTS crowd_wisdom_learning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES crowd_wisdom_clusters(id) ON DELETE CASCADE,
  query_assignment_id UUID REFERENCES crowd_wisdom_query_assignments(id) ON DELETE CASCADE,
  successful_response TEXT,
  extracted_patterns JSONB DEFAULT '{}',
  prompt_update TEXT,
  previous_prompt_enhancement TEXT,
  confidence_score FLOAT DEFAULT 0.0,
  learning_trigger TEXT, -- What triggered this learning event
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for comprehensive system logging and debugging
CREATE TABLE IF NOT EXISTS crowd_wisdom_system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL, -- Which component generated the log
  log_level TEXT NOT NULL CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  session_id TEXT,
  user_id TEXT,
  cluster_id UUID,
  query_assignment_id UUID,
  processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking cluster performance metrics
CREATE TABLE IF NOT EXISTS crowd_wisdom_cluster_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES crowd_wisdom_clusters(id) ON DELETE CASCADE,
  metric_date DATE DEFAULT CURRENT_DATE,
  total_queries INTEGER DEFAULT 0,
  successful_queries INTEGER DEFAULT 0,
  average_similarity FLOAT DEFAULT 0.0,
  average_response_time_ms INTEGER DEFAULT 0,
  prompt_enhancement_updates INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(cluster_id, metric_date)
);

-- Table for A/B testing different prompt enhancements
CREATE TABLE IF NOT EXISTS crowd_wisdom_prompt_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES crowd_wisdom_clusters(id) ON DELETE CASCADE,
  experiment_name TEXT NOT NULL,
  prompt_enhancement_a TEXT,
  prompt_enhancement_b TEXT,
  queries_a INTEGER DEFAULT 0,
  queries_b INTEGER DEFAULT 0,
  success_a INTEGER DEFAULT 0,
  success_b INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  winner TEXT CHECK (winner IN ('A', 'B', 'TIE', NULL))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_clusters_embedding ON crowd_wisdom_clusters USING ivfflat (centroid_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_query_assignments_cluster_id ON crowd_wisdom_query_assignments(cluster_id);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_query_assignments_user_feedback ON crowd_wisdom_query_assignments(user_feedback_positive);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_learning_logs_cluster_id ON crowd_wisdom_learning_logs(cluster_id);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_system_logs_component ON crowd_wisdom_system_logs(component);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_system_logs_level ON crowd_wisdom_system_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_system_logs_created_at ON crowd_wisdom_system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_crowd_wisdom_cluster_metrics_date ON crowd_wisdom_cluster_metrics(metric_date);

-- Create RLS policies for security
ALTER TABLE crowd_wisdom_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_wisdom_query_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_wisdom_learning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_wisdom_system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_wisdom_cluster_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_wisdom_prompt_experiments ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all data
CREATE POLICY "Service role can access all crowd wisdom data" ON crowd_wisdom_clusters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all query assignments" ON crowd_wisdom_query_assignments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all learning logs" ON crowd_wisdom_learning_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all system logs" ON crowd_wisdom_system_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all cluster metrics" ON crowd_wisdom_cluster_metrics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access all prompt experiments" ON crowd_wisdom_prompt_experiments FOR ALL USING (auth.role() = 'service_role');

-- Function to update cluster metrics
CREATE OR REPLACE FUNCTION update_crowd_wisdom_cluster_metrics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO crowd_wisdom_cluster_metrics (cluster_id, total_queries, successful_queries)
  VALUES (NEW.cluster_id, 1, CASE WHEN NEW.user_feedback_positive = true THEN 1 ELSE 0 END)
  ON CONFLICT (cluster_id, metric_date)
  DO UPDATE SET
    total_queries = crowd_wisdom_cluster_metrics.total_queries + 1,
    successful_queries = crowd_wisdom_cluster_metrics.successful_queries + CASE WHEN NEW.user_feedback_positive = true THEN 1 ELSE 0 END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update metrics
CREATE TRIGGER trigger_update_crowd_wisdom_metrics
  AFTER INSERT OR UPDATE ON crowd_wisdom_query_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_crowd_wisdom_cluster_metrics();

-- Function to log system events (can be called from application)
CREATE OR REPLACE FUNCTION log_crowd_wisdom_event(
  p_component TEXT,
  p_log_level TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT '{}',
  p_session_id TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL,
  p_cluster_id UUID DEFAULT NULL,
  p_query_assignment_id UUID DEFAULT NULL,
  p_processing_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO crowd_wisdom_system_logs (
    component, log_level, message, metadata, session_id, user_id, 
    cluster_id, query_assignment_id, processing_time_ms
  )
  VALUES (
    p_component, p_log_level, p_message, p_metadata, p_session_id, p_user_id,
    p_cluster_id, p_query_assignment_id, p_processing_time_ms
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql; 