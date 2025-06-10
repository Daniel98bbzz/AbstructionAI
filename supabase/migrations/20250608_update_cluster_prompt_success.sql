-- Aggregate LLM-based template evaluation scores and upsert into cluster_prompt_success

INSERT INTO cluster_prompt_success (cluster_id, prompt_template_id, success_score, confidence_score, last_updated)
SELECT
  cluster_id,
  template_id,
  AVG(
    (score_json->>'clarity')::FLOAT +
    (score_json->>'relevance')::FLOAT +
    (score_json->>'educational_value')::FLOAT +
    (score_json->>'accuracy')::FLOAT
  ) / 4 AS success_score,
  COUNT(*) AS confidence_score,
  MAX(created_at) AS last_updated
FROM template_evaluation_log
GROUP BY template_id, cluster_id
ON CONFLICT (cluster_id, prompt_template_id)
DO UPDATE SET
  success_score = EXCLUDED.success_score,
  confidence_score = EXCLUDED.confidence_score,
  last_updated = EXCLUDED.last_updated; 