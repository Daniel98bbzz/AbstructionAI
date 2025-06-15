-- Create cluster_best_template view for crowd wisdom template selection
-- This view finds the best template for each cluster based on efficacy_score and usage count

CREATE OR REPLACE VIEW cluster_best_template AS
SELECT cluster_id, template_id
FROM (
  SELECT
    cluster_id,
    template_id,
    efficacy_score,
    num_uses,
    ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY efficacy_score DESC, num_uses DESC) as rank
  FROM template_cluster_stats
  WHERE efficacy_score IS NOT NULL
) ranked
WHERE rank = 1;

-- Grant access to the view
GRANT SELECT ON cluster_best_template TO authenticated;
GRANT SELECT ON cluster_best_template TO anon; 