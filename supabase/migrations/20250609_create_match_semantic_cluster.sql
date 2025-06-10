-- Migration: Create match_semantic_cluster function for semantic cluster matching
CREATE OR REPLACE FUNCTION match_semantic_cluster(embedding_vector vector(1536))
RETURNS TABLE (id INT, similarity FLOAT, representative_query TEXT)
LANGUAGE SQL
AS $$
  SELECT
    id,
    centroid <=> embedding_vector AS similarity,
    representative_query
  FROM semantic_clusters
  ORDER BY centroid <=> embedding_vector
  LIMIT 1;
$$; 