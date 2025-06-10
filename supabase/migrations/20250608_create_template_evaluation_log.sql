-- Migration: Create template_evaluation_log for LLM-based answer scoring
CREATE TABLE IF NOT EXISTS template_evaluation_log (
  id BIGSERIAL PRIMARY KEY,
  template_id UUID NOT NULL,
  cluster_id INT NOT NULL,
  interaction_id UUID, -- Optional: link to the interaction
  score_json JSONB NOT NULL, -- Stores {"clarity": X, "relevance": X, ...}
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_template_evaluation_log_template_cluster
  ON template_evaluation_log (template_id, cluster_id); 