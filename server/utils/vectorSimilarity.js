import { supabase } from '../lib/supabaseClient.js';

class VectorSimilarity {
  constructor() {
    this.defaultLimit = 10; // Default number of nearest neighbors to return
  }

  /**
   * Find most similar clusters using pgvector's cosine similarity
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {number} threshold - Minimum similarity threshold
   * @returns {Promise<Array>} - Array of similar clusters with similarity scores
   */
  async findSimilarClusters(queryEmbedding, limit = this.defaultLimit, threshold = 0.0) {
    try {
      console.log('[VECTOR SIMILARITY] 🔍 Finding similar clusters using pgvector:', {
        embeddingDimensions: queryEmbedding.length,
        limit,
        threshold
      });

      // Use pgvector's cosine similarity operator (<=>)
      // Note: pgvector returns distance, so we convert to similarity (1 - distance)
      const { data: results, error } = await supabase.rpc('find_similar_clusters', {
        query_embedding: queryEmbedding,
        similarity_threshold: 1 - threshold, // Convert similarity to distance
        result_limit: limit
      });

      if (error) {
        throw error;
      }

      console.log('[VECTOR SIMILARITY] ✅ Found similar clusters:', {
        resultsCount: results?.length || 0,
        topSimilarity: results?.[0]?.similarity || 0
      });

      return results || [];

    } catch (error) {
      console.error('[VECTOR SIMILARITY] Error finding similar clusters:', error);
      
      // Fallback to manual search if pgvector RPC fails
      console.log('[VECTOR SIMILARITY] 🔄 Falling back to manual similarity search...');
      return await this.findSimilarClustersManual(queryEmbedding, limit, threshold);
    }
  }

  /**
   * Fallback manual similarity search (original method)
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {number} threshold - Minimum similarity threshold
   * @returns {Promise<Array>} - Array of similar clusters
   */
  async findSimilarClustersManual(queryEmbedding, limit, threshold) {
    try {
      const { data: clusters, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select(`
          id,
          cluster_name,
          representative_query,
          prompt_enhancement,
          total_queries,
          success_rate,
          centroid_embedding
        `)
        .order('total_queries', { ascending: false });

      if (error) {
        throw error;
      }

      // Calculate similarities manually
      const similarities = clusters
        .map(cluster => {
          try {
            let embedding = cluster.centroid_embedding;
            if (typeof embedding === 'string') {
              embedding = JSON.parse(embedding);
            }
            
            if (!Array.isArray(embedding) || embedding.length !== queryEmbedding.length) {
              return null;
            }

            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            
            return {
              id: cluster.id,
              cluster_name: cluster.cluster_name,
              representative_query: cluster.representative_query,
              prompt_enhancement: cluster.prompt_enhancement,
              total_queries: cluster.total_queries,
              success_rate: cluster.success_rate,
              similarity: similarity,
              embedding: embedding
            };
          } catch (error) {
            console.warn('[VECTOR SIMILARITY] Error processing cluster:', cluster.id, error);
            return null;
          }
        })
        .filter(result => result !== null && result.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return similarities;

    } catch (error) {
      console.error('[VECTOR SIMILARITY] Error in manual similarity search:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array} vectorA - First vector
   * @param {Array} vectorB - Second vector
   * @returns {number} - Cosine similarity (-1 to 1)
   */
  cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find similar query assignments for analysis
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @param {string} excludeAssignmentId - Assignment ID to exclude from results
   * @returns {Promise<Array>} - Array of similar query assignments
   */
  async findSimilarQueries(queryEmbedding, limit = this.defaultLimit, excludeAssignmentId = null) {
    try {
      console.log('[VECTOR SIMILARITY] 🔍 Finding similar queries using pgvector:', {
        embeddingDimensions: queryEmbedding.length,
        limit,
        excludeAssignmentId: excludeAssignmentId?.substring(0, 8) + '...' || 'none'
      });

      // Use pgvector's cosine similarity for query assignments
      const { data: results, error } = await supabase.rpc('find_similar_queries', {
        query_embedding: queryEmbedding,
        result_limit: limit,
        exclude_assignment_id: excludeAssignmentId
      });

      if (error) {
        throw error;
      }

      console.log('[VECTOR SIMILARITY] ✅ Found similar queries:', {
        resultsCount: results?.length || 0
      });

      return results || [];

    } catch (error) {
      console.error('[VECTOR SIMILARITY] Error finding similar queries:', error);
      return [];
    }
  }

  /**
   * Get embedding statistics from the database
   * @returns {Promise<Object>} - Embedding statistics
   */
  async getEmbeddingStats() {
    try {
      const { data: clusterStats, error: clusterError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('id')
        .not('centroid_embedding', 'is', null);

      const { data: queryStats, error: queryError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('id')
        .not('query_embedding', 'is', null);

      if (clusterError || queryError) {
        throw clusterError || queryError;
      }

      return {
        clustersWithEmbeddings: clusterStats?.length || 0,
        queriesWithEmbeddings: queryStats?.length || 0,
        totalVectors: (clusterStats?.length || 0) + (queryStats?.length || 0)
      };

    } catch (error) {
      console.error('[VECTOR SIMILARITY] Error getting embedding stats:', error);
      return {
        clustersWithEmbeddings: 0,
        queriesWithEmbeddings: 0,
        totalVectors: 0
      };
    }
  }
}

// Export singleton instance
const vectorSimilarity = new VectorSimilarity();
export default vectorSimilarity; 