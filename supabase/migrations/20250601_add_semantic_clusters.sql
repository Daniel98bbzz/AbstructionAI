-- Migration: Create semantic_clusters table for semantic question clustering
CREATE TABLE IF NOT EXISTS semantic_clusters (
  id INT PRIMARY KEY,
  centroid vector(1536) NOT NULL,
  size INT NOT NULL,
  representative_query TEXT,
  last_updated TIMESTAMPTZ DEFAULT now()
); 