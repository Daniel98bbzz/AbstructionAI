import { supabase } from '../lib/supabaseClient.js';
import EmbeddingGenerator from '../utils/embeddingGenerator.js';
import CosineUtils from '../utils/cosineUtils.js';

class QueryClusteringService {
  constructor(openaiClient) {
    this.embeddingGenerator = new EmbeddingGenerator(openaiClient);
    this.cosineUtils = new CosineUtils();
    this.similarityThreshold = 0.75; // Threshold for cluster assignment
    this.maxClusters = 50; // Maximum number of clusters to maintain
    this.centroidUpdateRate = 0.1; // How much new embeddings influence centroids
  }

  /**
   * Process a query and assign it to a cluster
   * @param {string} queryText - The user's query
   * @param {string} sessionId - Session ID for tracking
   * @param {string} userId - User ID for tracking
   * @returns {Promise<Object>} - Cluster assignment result
   */
  async processQuery(queryText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', 'Starting query processing', {
        queryLength: queryText.length,
        sessionId,
        userId
      });

      // Generate embedding for the query
      const queryEmbedding = await this.embeddingGenerator.generateEmbedding(
        queryText, 
        'query_clustering', 
        sessionId
      );

      if (!queryEmbedding) {
        await this.logEvent('ERROR', 'Failed to generate embedding for query', {
          queryText: queryText.substring(0, 100),
          sessionId,
          userId
        });
        return null;
      }

      // Find or create appropriate cluster
      const clusterResult = await this.findOrCreateCluster(
        queryText, 
        queryEmbedding, 
        sessionId, 
        userId
      );

      if (!clusterResult) {
        await this.logEvent('ERROR', 'Failed to find or create cluster', {
          queryText: queryText.substring(0, 100),
          sessionId,
          userId
        });
        return null;
      }

      // Create query assignment record
      const assignmentId = await this.createQueryAssignment(
        queryText,
        queryEmbedding,
        clusterResult.clusterId,
        clusterResult.similarity,
        sessionId,
        userId
      );

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Query processing completed successfully', {
        clusterId: clusterResult.clusterId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        assignmentId,
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        clusterId: clusterResult.clusterId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        assignmentId,
        promptEnhancement: clusterResult.promptEnhancement
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Query processing failed', {
        error: error.message,
        queryText: queryText?.substring(0, 100),
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return null;
    }
  }

  /**
   * Find the best matching cluster or create a new one
   * @param {string} queryText - The query text
   * @param {Array} queryEmbedding - The query embedding
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Cluster result
   */
  async findOrCreateCluster(queryText, queryEmbedding, sessionId, userId) {
    try {
      await this.logEvent('INFO', 'Finding best cluster match', {
        sessionId,
        userId
      });

      // Get all existing clusters
      const { data: clusters, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('*')
        .order('total_queries', { ascending: false });

      if (error) {
        await this.logEvent('ERROR', 'Failed to retrieve existing clusters', {
          error: error.message,
          sessionId,
          userId
        });
        throw error;
      }

      await this.logEvent('DEBUG', `Retrieved ${clusters.length} existing clusters`, {
        clusterCount: clusters.length,
        sessionId,
        userId
      });

      // If no clusters exist, create the first one
      if (!clusters || clusters.length === 0) {
        await this.logEvent('INFO', 'No existing clusters found, creating first cluster', {
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        return {
          clusterId: newClusterId,
          similarity: 1.0,
          isNewCluster: true,
          promptEnhancement: '' // New clusters start with no enhancement
        };
      }

      // Find the most similar cluster
      const candidateClusters = clusters.map(cluster => ({
        id: cluster.id,
        embedding: cluster.centroid_embedding,
        promptEnhancement: cluster.prompt_enhancement || '',
        representativeQuery: cluster.representative_query,
        totalQueries: cluster.total_queries,
        successRate: cluster.success_rate
      }));

      const bestMatch = await this.cosineUtils.findMostSimilar(
        queryEmbedding,
        candidateClusters,
        'cluster_matching',
        sessionId
      );

      if (!bestMatch) {
        await this.logEvent('WARN', 'No best match found among clusters, creating new cluster', {
          candidateCount: candidateClusters.length,
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        return {
          clusterId: newClusterId,
          similarity: 1.0,
          isNewCluster: true,
          promptEnhancement: ''
        };
      }

      await this.logEvent('INFO', 'Best cluster match found', {
        clusterId: bestMatch.id,
        similarity: bestMatch.similarity,
        threshold: this.similarityThreshold,
        representativeQuery: bestMatch.representativeQuery?.substring(0, 100),
        sessionId,
        userId
      });

      // Check if similarity meets threshold
      if (bestMatch.similarity >= this.similarityThreshold) {
        // Update cluster centroid with new embedding
        await this.updateClusterCentroid(bestMatch.id, queryEmbedding, sessionId);
        
        return {
          clusterId: bestMatch.id,
          similarity: bestMatch.similarity,
          isNewCluster: false,
          promptEnhancement: bestMatch.promptEnhancement
        };
      } else {
        // Similarity too low, create new cluster
        await this.logEvent('INFO', 'Similarity below threshold, creating new cluster', {
          bestSimilarity: bestMatch.similarity,
          threshold: this.similarityThreshold,
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        return {
          clusterId: newClusterId,
          similarity: 1.0,
          isNewCluster: true,
          promptEnhancement: ''
        };
      }

    } catch (error) {
      await this.logEvent('ERROR', 'Error in findOrCreateCluster', {
        error: error.message,
        sessionId,
        userId
      });
      throw error;
    }
  }

  /**
   * Create a new cluster
   * @param {string} queryText - Representative query text
   * @param {Array} queryEmbedding - Query embedding as centroid
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - New cluster ID
   */
  async createNewCluster(queryText, queryEmbedding, sessionId, userId) {
    try {
      await this.logEvent('INFO', 'Creating new cluster', {
        representativeQuery: queryText.substring(0, 100),
        sessionId,
        userId
      });

      // Check cluster limit
      const { count: clusterCount } = await supabase
        .from('crowd_wisdom_clusters')
        .select('*', { count: 'exact', head: true });

      if (clusterCount >= this.maxClusters) {
        await this.logEvent('WARN', 'Maximum cluster limit reached, consider cleanup', {
          currentClusters: clusterCount,
          maxClusters: this.maxClusters,
          sessionId,
          userId
        });
        
        // For now, still create the cluster but log the warning
        // In production, you might want to merge low-performing clusters
      }

      // Generate a meaningful cluster name based on query content
      const clusterName = this.generateClusterName(queryText);

      const { data, error } = await supabase
        .from('crowd_wisdom_clusters')
        .insert([
          {
            centroid_embedding: queryEmbedding,
            representative_query: queryText,
            cluster_name: clusterName,
            prompt_enhancement: '', // Start with no enhancement
            total_queries: 1,
            success_count: 0,
            success_rate: 0.0
          }
        ])
        .select()
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to create new cluster', {
          error: error.message,
          sessionId,
          userId
        });
        throw error;
      }

      await this.logEvent('INFO', 'New cluster created successfully', {
        clusterId: data.id,
        clusterName,
        representativeQuery: queryText.substring(0, 100),
        sessionId,
        userId
      });

      return data.id;

    } catch (error) {
      await this.logEvent('ERROR', 'Error creating new cluster', {
        error: error.message,
        sessionId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update cluster centroid with new embedding
   * @param {string} clusterId - Cluster ID
   * @param {Array} newEmbedding - New embedding to incorporate
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateClusterCentroid(clusterId, newEmbedding, sessionId) {
    try {
      await this.logEvent('DEBUG', 'Updating cluster centroid', {
        clusterId,
        sessionId
      });

      // Get current cluster data
      const { data: cluster, error: fetchError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();

      if (fetchError) {
        await this.logEvent('ERROR', 'Failed to fetch cluster for centroid update', {
          error: fetchError.message,
          clusterId,
          sessionId
        });
        return false;
      }

      // Calculate new centroid using exponential moving average
      const currentCentroid = cluster.centroid_embedding;
      const newCentroid = currentCentroid.map((value, index) => 
        value * (1 - this.centroidUpdateRate) + newEmbedding[index] * this.centroidUpdateRate
      );

      // Update cluster with new centroid and increment total queries
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          centroid_embedding: newCentroid,
          total_queries: cluster.total_queries + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', clusterId);

      if (updateError) {
        await this.logEvent('ERROR', 'Failed to update cluster centroid', {
          error: updateError.message,
          clusterId,
          sessionId
        });
        return false;
      }

      await this.logEvent('DEBUG', 'Cluster centroid updated successfully', {
        clusterId,
        totalQueries: cluster.total_queries + 1,
        updateRate: this.centroidUpdateRate,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error updating cluster centroid', {
        error: error.message,
        clusterId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Create query assignment record
   * @param {string} queryText - Query text
   * @param {Array} queryEmbedding - Query embedding
   * @param {string} clusterId - Cluster ID
   * @param {number} similarity - Similarity score
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Assignment ID
   */
  async createQueryAssignment(queryText, queryEmbedding, clusterId, similarity, sessionId, userId) {
    try {
      const { data, error } = await supabase
        .from('crowd_wisdom_query_assignments')
        .insert([
          {
            query_text: queryText,
            query_embedding: queryEmbedding,
            cluster_id: clusterId,
            similarity_score: similarity,
            session_id: sessionId,
            user_id: userId,
            processing_time_ms: 0 // Will be updated later with response time
          }
        ])
        .select()
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to create query assignment', {
          error: error.message,
          clusterId,
          sessionId,
          userId
        });
        throw error;
      }

      await this.logEvent('DEBUG', 'Query assignment created', {
        assignmentId: data.id,
        clusterId,
        similarity,
        sessionId,
        userId
      });

      return data.id;

    } catch (error) {
      await this.logEvent('ERROR', 'Error creating query assignment', {
        error: error.message,
        clusterId,
        sessionId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update query assignment with response and processing time
   * @param {string} assignmentId - Assignment ID
   * @param {string} responseText - AI response
   * @param {number} processingTimeMs - Total processing time
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateQueryAssignmentWithResponse(assignmentId, responseText, processingTimeMs, sessionId) {
    try {
      const { error } = await supabase
        .from('crowd_wisdom_query_assignments')
        .update({
          response_text: responseText,
          processing_time_ms: processingTimeMs
        })
        .eq('id', assignmentId);

      if (error) {
        await this.logEvent('ERROR', 'Failed to update query assignment with response', {
          error: error.message,
          assignmentId,
          sessionId
        });
        return false;
      }

      await this.logEvent('DEBUG', 'Query assignment updated with response', {
        assignmentId,
        responseLength: responseText?.length || 0,
        processingTimeMs,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error updating query assignment', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Get cluster prompt enhancement
   * @param {string} clusterId - Cluster ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<string>} - Prompt enhancement text
   */
  async getClusterPromptEnhancement(clusterId, sessionId) {
    try {
      const { data, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('prompt_enhancement')
        .eq('id', clusterId)
        .single();

      if (error) {
        await this.logEvent('WARN', 'Failed to get cluster prompt enhancement', {
          error: error.message,
          clusterId,
          sessionId
        });
        return '';
      }

      return data.prompt_enhancement || '';

    } catch (error) {
      await this.logEvent('ERROR', 'Error getting cluster prompt enhancement', {
        error: error.message,
        clusterId,
        sessionId
      });
      return '';
    }
  }

  /**
   * Generate a meaningful cluster name based on query content
   * @param {string} queryText - Query text
   * @returns {string} - Generated cluster name
   */
  generateClusterName(queryText) {
    // Extract key words and create a name
    const words = queryText.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['what', 'how', 'why', 'when', 'where', 'which', 'that', 'this'].includes(word))
      .slice(0, 3);

    if (words.length === 0) {
      return 'General Query Cluster';
    }

    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' Queries';
  }

  /**
   * Get clustering statistics
   * @param {string} timeframe - Timeframe for statistics
   * @returns {Promise<Object>} - Statistics object
   */
  async getClusteringStats(timeframe = '24 hours') {
    try {
      const { data: clusters, error: clustersError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('*')
        .order('total_queries', { ascending: false });

      if (clustersError) throw clustersError;

      const { data: assignments, error: assignmentsError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (assignmentsError) throw assignmentsError;

      const stats = {
        totalClusters: clusters.length,
        totalQueries: assignments.length,
        averageQueriesPerCluster: clusters.length > 0 ? assignments.length / clusters.length : 0,
        averageSimilarity: 0,
        clusterDistribution: {},
        newClustersCreated: 0
      };

      // Calculate average similarity
      const similarities = assignments.map(a => a.similarity_score).filter(s => s !== null);
      if (similarities.length > 0) {
        stats.averageSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
      }

      // Count new clusters created in timeframe
      const newClusters = clusters.filter(c => 
        new Date(c.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );
      stats.newClustersCreated = newClusters.length;

      // Cluster size distribution
      clusters.forEach(cluster => {
        const size = cluster.total_queries;
        const category = size === 1 ? 'singleton' : 
                       size <= 5 ? 'small' : 
                       size <= 20 ? 'medium' : 'large';
        stats.clusterDistribution[category] = (stats.clusterDistribution[category] || 0) + 1;
      });

      await this.logEvent('INFO', 'Clustering statistics calculated', {
        timeframe,
        stats
      });

      return stats;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to calculate clustering statistics', {
        error: error.message,
        timeframe
      });
      return null;
    }
  }

  /**
   * Log events to the crowd wisdom system logs
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  async logEvent(level, message, metadata = {}) {
    try {
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'QueryClusteringService',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      console.error('[QueryClusteringService] Failed to log event:', error);
    }
  }
}

export default QueryClusteringService;
