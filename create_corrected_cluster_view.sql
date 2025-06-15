-- Create cluster_best_template view for crowd wisdom template selection
-- This view finds the best template for each cluster based on usage and follow-up patterns

CREATE OR REPLACE VIEW cluster_best_template AS
WITH cluster_template_stats AS (
  SELECT 
    ptu.cluster_id,
    ptu.template_id,
    COUNT(*) as usage_count,
    -- Use follow-up rate as a quality indicator (lower follow-up = better initial response)
    AVG(CASE WHEN ptu.had_follow_up THEN 0 ELSE 1 END) as success_rate,
    -- Weight by usage count and success rate
    (COUNT(*) * 0.4 + AVG(CASE WHEN ptu.had_follow_up THEN 0 ELSE 1 END) * 0.6) as weighted_score
  FROM prompt_template_usage ptu
  WHERE ptu.cluster_id IS NOT NULL
    AND ptu.template_id IS NOT NULL
  GROUP BY ptu.cluster_id, ptu.template_id
),
cluster_best AS (
  SELECT 
    cluster_id,
    template_id,
    usage_count,
    success_rate,
    weighted_score,
    ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY weighted_score DESC, usage_count DESC) as rank
  FROM cluster_template_stats
)
SELECT 
  cluster_id,
  template_id,
  usage_count,
  success_rate,
  weighted_score
FROM cluster_best 
WHERE rank = 1;

-- Grant access to the view
GRANT SELECT ON cluster_best_template TO authenticated;
GRANT SELECT ON cluster_best_template TO anon; 