-- Create a view to compute UCB1 score for each template in each cluster
-- UCB1: (num_satisfactions / num_uses) + sqrt(2 * ln(total_uses) / num_uses)

CREATE OR REPLACE VIEW cluster_best_template_ucb AS
SELECT
  tcs.cluster_id,
  tcs.template_id,
  tcs.num_satisfactions,
  tcs.num_uses,
  SUM(tcs.num_uses) OVER (PARTITION BY tcs.cluster_id) AS total_uses,
  (tcs.num_satisfactions::float / NULLIF(tcs.num_uses, 0)) +
    SQRT(2 * LN(NULLIF(SUM(tcs.num_uses) OVER (PARTITION BY tcs.cluster_id), 0)) / NULLIF(tcs.num_uses, 0)) AS ucb1_score
FROM template_cluster_stats tcs
WHERE tcs.num_uses > 0;

-- Select the best template per cluster by UCB1
CREATE OR REPLACE VIEW cluster_best_template_ucb_top AS
SELECT * FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY ucb1_score DESC) AS rank
  FROM cluster_best_template_ucb
) ranked
WHERE rank = 1; 