import { supabase } from '../lib/supabaseClient.js';
import EmbeddingGenerator from '../utils/embeddingGenerator.js';
import CosineUtils from '../utils/cosineUtils.js';

class QueryClusteringService {
  constructor(openaiClient) {
    this.embeddingGenerator = new EmbeddingGenerator(openaiClient);
    this.cosineUtils = new CosineUtils();
    this.similarityThreshold = 0.3; // Further reduced - 0.5 was still too high
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
      await this.logEvent('INFO', '🚀 Starting query processing for crowd wisdom clustering', {
        queryText: queryText.substring(0, 100) + (queryText.length > 100 ? '...' : ''),
        queryLength: queryText.length,
        sessionId,
        userId
      });

      // 🚫 FILTER OUT USER FEEDBACK - Only cluster actual questions!
      if (this.isFeedbackText(queryText)) {
        console.log('[CROWD WISDOM CLUSTERING] 🚫 Detected user feedback - skipping clustering:', {
          feedbackText: queryText.substring(0, 50) + '...',
          reason: 'User feedback should not create clusters',
          sessionId
        });
        
        await this.logEvent('INFO', '🚫 Skipped clustering for user feedback', {
          feedbackText: queryText,
          sessionId,
          userId
        });
        
        return null; // Don't cluster feedback
      }

      // Generate embedding for the query
      console.log('[CROWD WISDOM CLUSTERING] 📊 Generating embedding vector for query:', queryText.substring(0, 50) + '...');
      const queryEmbedding = await this.embeddingGenerator.generateEmbedding(
        queryText, 
        'query_clustering', 
        sessionId
      );
      
      if (queryEmbedding) {
        console.log('[CROWD WISDOM CLUSTERING] ✅ Embedding generated successfully:', {
          dimensions: queryEmbedding.length,
          vectorPreview: queryEmbedding.slice(0, 5),
          sessionId
        });
      }

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
      await this.logEvent('INFO', '🔍 Finding best cluster match for query', {
        sessionId,
        userId
      });

      // Get all existing clusters
      console.log('[CROWD WISDOM CLUSTERING] 🗂️ Retrieving existing clusters from database...');
      const { data: clusters, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('*')
        .order('total_queries', { ascending: false });

      if (error) {
        console.log('[CROWD WISDOM CLUSTERING] ❌ Failed to retrieve clusters:', error.message);
        await this.logEvent('ERROR', 'Failed to retrieve existing clusters', {
          error: error.message,
          sessionId,
          userId
        });
        throw error;
      }

      console.log('[CROWD WISDOM CLUSTERING] 📋 Retrieved clusters from database:', {
        totalClusters: clusters.length,
        clustersWithData: clusters.map(c => ({
          id: c.id.substring(0, 8) + '...',
          name: c.cluster_name,
          totalQueries: c.total_queries,
          successRate: c.success_rate,
          hasPromptEnhancement: !!c.prompt_enhancement
        })),
        sessionId,
        userId
      });

      await this.logEvent('DEBUG', `📊 Retrieved ${clusters.length} existing clusters for similarity matching`, {
        clusterCount: clusters.length,
        clusterDetails: clusters.map(c => ({
          id: c.id,
          name: c.cluster_name,
          queries: c.total_queries,
          successRate: c.success_rate
        })),
        sessionId,
        userId
      });

      // If no clusters exist, create the first one
      if (!clusters || clusters.length === 0) {
        console.log('[CROWD WISDOM CLUSTERING] 🆕 No existing clusters found - creating the very first cluster!');
        await this.logEvent('INFO', '🆕 No existing clusters found, creating first cluster', {
          queryText: queryText.substring(0, 100),
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        console.log('[CROWD WISDOM CLUSTERING] ✅ First cluster created successfully:', {
          clusterId: newClusterId.substring(0, 8) + '...',
          representativeQuery: queryText.substring(0, 50) + '...'
        });
        
        return {
          clusterId: newClusterId,
          similarity: 1.0,
          isNewCluster: true,
          promptEnhancement: '' // New clusters start with no enhancement
        };
      }

      // Find the most similar cluster
      console.log('[CROWD WISDOM CLUSTERING] 🧮 Preparing clusters for similarity comparison...');
      const candidateClusters = clusters.map(cluster => {
        // 🔧 FIX: Parse embedding from JSON string to array if needed
        let embedding = cluster.centroid_embedding;
        if (typeof embedding === 'string') {
          try {
            embedding = JSON.parse(embedding);
            console.log('[CROWD WISDOM CLUSTERING] 🔧 Converted string embedding to array for cluster:', cluster.id.substring(0, 8));
          } catch (error) {
            console.error('[CROWD WISDOM CLUSTERING] ❌ Failed to parse embedding for cluster:', cluster.id.substring(0, 8), error);
            embedding = null;
          }
        }
        
        return {
          id: cluster.id,
          embedding: embedding,
          promptEnhancement: cluster.prompt_enhancement || '',
          representativeQuery: cluster.representative_query,
          totalQueries: cluster.total_queries,
          successRate: cluster.success_rate
        };
      }).filter(cluster => cluster.embedding !== null); // Remove clusters with invalid embeddings

      // 🔍 DEBUG: Check embedding data integrity
      console.log('[CROWD WISDOM CLUSTERING] 🔬 Debugging embedding data:', {
        queryEmbeddingInfo: {
          isArray: Array.isArray(queryEmbedding),
          length: queryEmbedding?.length,
          sampleValues: queryEmbedding?.slice(0, 3),
          hasNaN: queryEmbedding?.some(v => isNaN(v)),
          hasNull: queryEmbedding?.includes(null)
        },
        clusterEmbeddingsInfo: candidateClusters.map((c, i) => ({
          clusterId: c.id.substring(0, 8) + '...',
          embeddingIsArray: Array.isArray(c.embedding),
          embeddingLength: c.embedding?.length,
          embeddingSampleValues: c.embedding?.slice(0, 3),
          representativeQuery: c.representativeQuery?.substring(0, 50) + '...'
        }))
      });

      console.log('[CROWD WISDOM CLUSTERING] ⚖️ Computing cosine similarity with all clusters...');
      const bestMatch = await this.cosineUtils.findMostSimilar(
        queryEmbedding,
        candidateClusters,
        'cluster_matching',
        sessionId
      );

      if (!bestMatch) {
        console.log('[CROWD WISDOM CLUSTERING] ⚠️ No similarity match found - creating new cluster');
        await this.logEvent('WARN', '⚠️ No best match found among clusters, creating new cluster', {
          candidateCount: candidateClusters.length,
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        console.log('[CROWD WISDOM CLUSTERING] ✅ New cluster created due to no similarity match:', {
          clusterId: newClusterId.substring(0, 8) + '...'
        });
        
        return {
          clusterId: newClusterId,
          similarity: 1.0,
          isNewCluster: true,
          promptEnhancement: ''
        };
      }

      console.log('[CROWD WISDOM CLUSTERING] 🎯 Best cluster match found:', {
        clusterId: bestMatch.id.substring(0, 8) + '...',
        similarity: bestMatch.similarity,
        threshold: this.similarityThreshold,
        clusterName: clusters.find(c => c.id === bestMatch.id)?.cluster_name,
        representativeQuery: bestMatch.representativeQuery?.substring(0, 80) + '...',
        clusterStats: {
          totalQueries: bestMatch.totalQueries,
          successRate: bestMatch.successRate,
          hasPromptEnhancement: !!bestMatch.promptEnhancement
        }
      });

      await this.logEvent('INFO', '🎯 Best cluster match found with similarity analysis', {
        clusterId: bestMatch.id,
        similarity: bestMatch.similarity,
        threshold: this.similarityThreshold,
        representativeQuery: bestMatch.representativeQuery?.substring(0, 100),
        clusterMetrics: {
          totalQueries: bestMatch.totalQueries,
          successRate: bestMatch.successRate,
          promptEnhancementLength: bestMatch.promptEnhancement?.length || 0
        },
        sessionId,
        userId
      });

      // Check if similarity meets threshold
      const similarityMeetsThreshold = bestMatch.similarity >= this.similarityThreshold;
      
      console.log('[CROWD WISDOM CLUSTERING] 📏 Similarity threshold decision:', {
        similarity: bestMatch.similarity,
        threshold: this.similarityThreshold,
        meetsThreshold: similarityMeetsThreshold,
        decision: similarityMeetsThreshold ? 'ASSIGN_TO_EXISTING_CLUSTER' : 'CREATE_NEW_CLUSTER'
      });
      
      if (similarityMeetsThreshold) {
        console.log('[CROWD WISDOM CLUSTERING] ✅ Similarity above threshold - assigning to existing cluster');
        console.log('[CROWD WISDOM CLUSTERING] 🔄 Updating cluster centroid with new embedding...');
        
        // 🎯 FIX: Check if this is an instructional query vs follow-up before updating metrics
        console.log('[CROWD WISDOM CLUSTERING] 🔍 Analyzing query type for success rate calculation...');
        const isInstructional = await this.isInstructionalQuery(queryText, queryEmbedding, sessionId, userId);
        
        console.log('[CROWD WISDOM CLUSTERING] 📊 Query classification result:', {
          queryText: queryText.substring(0, 60) + '...',
          classification: isInstructional ? 'INSTRUCTIONAL' : 'FOLLOW-UP',
          willIncrementTotalQueries: isInstructional,
          clusterId: bestMatch.id.substring(0, 8) + '...',
          sessionId
        });
        
        // Update cluster centroid with new embedding - only increment total_queries for instructional queries
        await this.updateClusterCentroid(bestMatch.id, queryEmbedding, sessionId, isInstructional);
        
        console.log('[CROWD WISDOM CLUSTERING] 🎉 Query successfully assigned to existing cluster:', {
          clusterId: bestMatch.id.substring(0, 8) + '...',
          similarity: bestMatch.similarity,
          queryType: isInstructional ? 'INSTRUCTIONAL' : 'FOLLOW-UP',
          promptEnhancement: bestMatch.promptEnhancement ? 'Present' : 'None'
        });
        
        return {
          clusterId: bestMatch.id,
          similarity: bestMatch.similarity,
          isNewCluster: false,
          promptEnhancement: bestMatch.promptEnhancement
        };
      } else {
        console.log('[CROWD WISDOM CLUSTERING] ❌ Similarity below threshold - creating new cluster');
        console.log('[CROWD WISDOM CLUSTERING] 📊 Similarity gap analysis:', {
          actualSimilarity: bestMatch.similarity,
          requiredThreshold: this.similarityThreshold,
          gap: this.similarityThreshold - bestMatch.similarity,
          percentBelow: ((this.similarityThreshold - bestMatch.similarity) / this.similarityThreshold * 100).toFixed(2) + '%'
        });
        
        // Similarity too low, create new cluster
        await this.logEvent('INFO', '❌ Similarity below threshold, creating new cluster', {
          bestSimilarity: bestMatch.similarity,
          threshold: this.similarityThreshold,
          similarityGap: this.similarityThreshold - bestMatch.similarity,
          sessionId,
          userId
        });
        
        const newClusterId = await this.createNewCluster(queryText, queryEmbedding, sessionId, userId);
        console.log('[CROWD WISDOM CLUSTERING] ✅ New cluster created due to low similarity:', {
          clusterId: newClusterId.substring(0, 8) + '...',
          rejectedSimilarity: bestMatch.similarity,
          threshold: this.similarityThreshold
        });
        
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
   * @param {boolean} shouldIncrementQueries - Whether to increment total_queries (only for instructional queries)
   * @returns {Promise<boolean>} - Success status
   */
  async updateClusterCentroid(clusterId, newEmbedding, sessionId, shouldIncrementQueries = true) {
    try {
      await this.logEvent('DEBUG', 'Updating cluster centroid', {
        clusterId,
        sessionId,
        shouldIncrementQueries
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
      let currentCentroid = cluster.centroid_embedding;
      
      // 🔧 FIX: Parse centroid from JSON string to array if needed
      if (typeof currentCentroid === 'string') {
        try {
          currentCentroid = JSON.parse(currentCentroid);
          console.log('[CROWD WISDOM CLUSTERING] 🔧 Converted string centroid to array for update');
        } catch (error) {
          console.error('[CROWD WISDOM CLUSTERING] ❌ Failed to parse centroid for update:', error);
          return false;
        }
      }
      
      if (!Array.isArray(currentCentroid)) {
        console.error('[CROWD WISDOM CLUSTERING] ❌ Current centroid is not an array:', typeof currentCentroid);
        return false;
      }
      
      const newCentroid = currentCentroid.map((value, index) => 
        value * (1 - this.centroidUpdateRate) + newEmbedding[index] * this.centroidUpdateRate
      );

      // Prepare update object - only increment total_queries for instructional queries
      const updateData = {
        centroid_embedding: newCentroid,
        updated_at: new Date().toISOString()
      };

      if (shouldIncrementQueries) {
        updateData.total_queries = cluster.total_queries + 1;
        console.log('[CROWD WISDOM CLUSTERING] ✅ Incrementing total_queries for INSTRUCTIONAL query:', {
          clusterId: clusterId.substring(0, 8) + '...',
          previousCount: cluster.total_queries,
          newCount: cluster.total_queries + 1
        });
      } else {
        console.log('[CROWD WISDOM CLUSTERING] ⏭️ Skipping total_queries increment for FOLLOW-UP query:', {
          clusterId: clusterId.substring(0, 8) + '...',
          currentCount: cluster.total_queries,
          reason: 'Query classified as follow-up, not instructional'
        });
      }

      // Update cluster with new centroid and conditionally increment total queries
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update(updateData)
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
        totalQueries: shouldIncrementQueries ? cluster.total_queries + 1 : cluster.total_queries,
        incrementedQueries: shouldIncrementQueries,
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
      console.log('[CROWD WISDOM CLUSTERING] 📝 Fetching cluster template/enhancement from database...');
      
      const { data, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('prompt_enhancement, cluster_name, representative_query, total_queries, success_count, success_rate, created_at, updated_at')
        .eq('id', clusterId)
        .single();

      if (error) {
        console.log('[CROWD WISDOM CLUSTERING] ❌ Failed to retrieve cluster template:', error.message);
        await this.logEvent('WARN', '❌ Failed to get cluster prompt enhancement', {
          error: error.message,
          clusterId,
          sessionId
        });
        return '';
      }

      const hasEnhancement = Boolean(data.prompt_enhancement && data.prompt_enhancement.trim().length > 0);
      
      console.log('[CROWD WISDOM CLUSTERING] 📊 Cluster template information:', {
        clusterId: clusterId.substring(0, 8) + '...',
        clusterName: data.cluster_name,
        representativeQuery: data.representative_query?.substring(0, 70) + '...',
        clusterAge: Math.floor((Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24)) + ' days',
        lastUpdated: Math.floor((Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60 * 60)) + ' hours ago',
        performance: {
          totalQueries: data.total_queries,
          successCount: data.success_count,
          successRate: (data.success_rate * 100).toFixed(1) + '%'
        },
        template: {
          hasPromptEnhancement: hasEnhancement,
          enhancementLength: data.prompt_enhancement?.length || 0,
          enhancementPreview: hasEnhancement ? data.prompt_enhancement.substring(0, 120) + '...' : 'No custom template - using base prompt only'
        }
      });

      await this.logEvent('INFO', '📝 Retrieved cluster template with full metadata', {
        clusterId,
        clusterName: data.cluster_name,
        representativeQuery: data.representative_query,
        clusterMetrics: {
          totalQueries: data.total_queries,
          successCount: data.success_count,
          successRate: data.success_rate,
          ageInDays: Math.floor((Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24))
        },
        templateInfo: {
          hasEnhancement: hasEnhancement,
          enhancementLength: data.prompt_enhancement?.length || 0,
          lastUpdated: data.updated_at
        },
        sessionId
      });

      return data.prompt_enhancement || '';

    } catch (error) {
      console.log('[CROWD WISDOM CLUSTERING] ❌ Error retrieving cluster template:', error.message);
      await this.logEvent('ERROR', '❌ Error getting cluster prompt enhancement', {
        error: error.message,
        clusterId,
        sessionId
      });
      return '';
    }
  }

  /**
   * Check if text is user feedback rather than a question
   * @param {string} text - Text to analyze
   * @returns {boolean} - True if this is feedback, false if it's a question
   */
  isFeedbackText(text) {
    const textLower = text.toLowerCase().trim();
    
    // Common feedback patterns
    const feedbackPatterns = [
      // Gratitude
      /^(thank you|thanks|ty|thx)/,
      /^(i appreciate|much appreciated|great|excellent|perfect|amazing)/,
      
      // Understanding
      /^(i understand|i get it|got it|makes sense|clear now|i see)/,
      /^(that helps|that's helpful|very helpful|super helpful)/,
      
      // Positive responses
      /^(awesome|brilliant|fantastic|wonderful|nice|good)/,
      /^(exactly|precisely|that's right|correct)/,
      
      // Negative feedback
      /^(i don't understand|still confused|unclear|hard to follow)/,
      /^(doesn't make sense|too complex|too difficult)/,
      
      // Short responses (likely feedback)
      /^(ok|okay|yes|yep|no|nope)$/,
      /^(cool|nice|wow|oh|ah|hmm)$/
    ];
    
    // Check patterns
    const matchesPattern = feedbackPatterns.some(pattern => pattern.test(textLower));
    
    // Additional heuristics
    const isShort = text.length < 20;
    const hasNoQuestionWords = !/\b(what|how|why|when|where|which|who|can|could|would|should|is|are|does|do|explain|tell|show)\b/i.test(text);
    const endsWithExclamation = text.trim().endsWith('!');
    
    // Likely feedback if matches patterns OR (short + no question words + exclamation)
    const isFeedback = matchesPattern || (isShort && hasNoQuestionWords && endsWithExclamation);
    
    if (isFeedback) {
      console.log('[CROWD WISDOM CLUSTERING] 🔍 Feedback detection analysis:', {
        text: text.substring(0, 50) + '...',
        matchesPattern,
        isShort,
        hasNoQuestionWords,
        endsWithExclamation,
        classification: 'FEEDBACK'
      });
    }
    
    return isFeedback;
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

  /**
   * Detect if a query is a new instructional query or a follow-up in the same session
   * @param {string} queryText - Current query text
   * @param {Array} queryEmbedding - Current query embedding
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - True if instructional, false if follow-up
   */
  async isInstructionalQuery(queryText, queryEmbedding, sessionId, userId) {
    try {
      // Get recent queries from the same session (last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: recentQueries, error } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('query_text, query_embedding, created_at')
        .eq('session_id', sessionId)
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(5); // Check last 5 queries max

      if (error) {
        console.log('[CROWD WISDOM CLUSTERING] ⚠️ Error fetching recent queries, assuming instructional:', error.message);
        await this.logEvent('WARN', 'Error fetching recent queries for instructional detection', {
          error: error.message,
          sessionId,
          userId
        });
        return true; // Default to instructional if we can't check
      }

      // If no recent queries, this is definitely instructional
      if (!recentQueries || recentQueries.length === 0) {
        console.log('[CROWD WISDOM CLUSTERING] ✅ No recent queries in session - marking as INSTRUCTIONAL');
        await this.logEvent('DEBUG', 'No recent queries found - classified as instructional', {
          sessionId,
          userId
        });
        return true;
      }

      console.log('[CROWD WISDOM CLUSTERING] 🔍 Analyzing query type against recent session queries:', {
        currentQuery: queryText.substring(0, 50) + '...',
        recentQueriesCount: recentQueries.length,
        sessionId
      });

      // Check each recent query for follow-up patterns
      for (const recentQuery of recentQueries) {
        const timeDiff = Date.now() - new Date(recentQuery.created_at).getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));

        // If recent query is within 10 minutes, check for follow-up patterns
        if (minutesAgo <= 10) {
          // Check semantic similarity if embeddings exist
          let similarity = 0;
          if (recentQuery.query_embedding) {
            let recentEmbedding = recentQuery.query_embedding;
            if (typeof recentEmbedding === 'string') {
              try {
                recentEmbedding = JSON.parse(recentEmbedding);
              } catch (e) {
                console.log('[CROWD WISDOM CLUSTERING] ⚠️ Failed to parse recent query embedding');
                continue;
              }
            }
            
            if (Array.isArray(recentEmbedding) && recentEmbedding.length === queryEmbedding.length) {
              similarity = await this.cosineUtils.calculateCosineSimilarity(queryEmbedding, recentEmbedding);
            }
          }

          // Check for textual follow-up patterns
          const isHighSimilarity = similarity > 0.6; // Lowered from 0.8 - more realistic threshold
          const hasFollowUpKeywords = this.hasFollowUpKeywords(queryText, recentQuery.query_text);
          const isRecentlyAsked = minutesAgo <= 5; // Within 5 minutes
          
          console.log('[CROWD WISDOM CLUSTERING] 🔍 Follow-up analysis:', {
            recentQuery: recentQuery.query_text.substring(0, 50) + '...',
            minutesAgo,
            similarity: similarity.toFixed(3),
            hasFollowUpKeywords,
            isHighSimilarity,
            isRecentlyAsked
          });

          // If high similarity + recent + follow-up keywords = likely follow-up
          if (isRecentlyAsked && (isHighSimilarity || hasFollowUpKeywords)) {
            console.log('[CROWD WISDOM CLUSTERING] 🔄 Detected FOLLOW-UP query:', {
              currentQuery: queryText.substring(0, 50) + '...',
              recentQuery: recentQuery.query_text.substring(0, 50) + '...',
              similarity,
              minutesAgo,
              hasFollowUpKeywords,
              sessionId
            });
            
            await this.logEvent('INFO', 'Query classified as follow-up', {
              queryText: queryText.substring(0, 100),
              recentQuery: recentQuery.query_text.substring(0, 100),
              similarity,
              minutesAgo,
              hasFollowUpKeywords,
              sessionId,
              userId
            });
            
            return false; // This is a follow-up
          }
        }
      }

      // If we get here, no follow-up patterns detected
      console.log('[CROWD WISDOM CLUSTERING] ✅ No follow-up patterns detected - marking as INSTRUCTIONAL');
      await this.logEvent('DEBUG', 'Query classified as instructional (no follow-up patterns)', {
        queryText: queryText.substring(0, 100),
        recentQueriesAnalyzed: recentQueries.length,
        sessionId,
        userId
      });
      
      return true; // This is an instructional query

    } catch (error) {
      console.log('[CROWD WISDOM CLUSTERING] ⚠️ Error in instructional query detection, defaulting to instructional:', error.message);
      await this.logEvent('ERROR', 'Error in instructional query detection', {
        error: error.message,
        queryText: queryText.substring(0, 100),
        sessionId,
        userId
      });
      return true; // Default to instructional on error
    }
  }

  /**
   * Check if current query has follow-up keywords related to recent query
   * @param {string} currentQuery - Current query text
   * @param {string} recentQuery - Recent query text
   * @returns {boolean} - True if follow-up patterns detected
   */
  hasFollowUpKeywords(currentQuery, recentQuery) {
    const currentLower = currentQuery.toLowerCase();
    const recentLower = recentQuery.toLowerCase();

    // Direct follow-up patterns - expanded list
    const followUpPatterns = [
      /^(and |also |what about |how about |can you also |could you also )/,
      /^(but |however |though |although )/,
      /^(wait |actually |oh |hmm )/,
      /^(so |then |next |after that )/,
      /(more detail|more specific|more about|elaborate|expand)/,
      /(example|examples|instance|for instance)/,
      /(clarify|clarification|explain better|explain more)/,
      /(difference|compare|comparison|vs|versus)/,
      // Additional chemistry-specific patterns
      /^(can you explain|what makes|why do|how do)/,
      /(polar|nonpolar|ionic|covalent|bond|bonds|molecule|molecules)/
    ];

    const hasFollowUpPattern = followUpPatterns.some(pattern => pattern.test(currentLower));

    // Enhanced shared key terms analysis with stemming-like approach
    const currentWords = this.extractKeyWords(currentLower);
    const recentWords = this.extractKeyWords(recentLower);
    
    // Find shared terms (including word stems)
    const sharedWords = currentWords.filter(word => {
      return recentWords.some(recentWord => {
        // Exact match
        if (word === recentWord) return true;
        
        // Handle plurals and common variations
        const wordStem = this.getWordStem(word);
        const recentStem = this.getWordStem(recentWord);
        return wordStem === recentStem;
      });
    });

    const hasSharedTerms = sharedWords.length >= 2;

    // Check for pronoun references (it, that, this, they, etc.)
    const hasPronouns = /(^|\s)(it|that|this|they|them|those|these|which)(\s|$)/i.test(currentQuery);

    // More inclusive logic for related topics
    const isTopicContinuation = this.isTopicContinuation(currentLower, recentLower);

    console.log('[CROWD WISDOM CLUSTERING] 🔬 Enhanced follow-up analysis:', {
      currentQuery: currentQuery.substring(0, 50) + '...',
      recentQuery: recentQuery.substring(0, 50) + '...',
      hasFollowUpPattern,
      sharedWords: sharedWords.slice(0, 5), // Show first 5 shared words
      sharedWordsCount: sharedWords.length,
      hasSharedTerms,
      hasPronouns,
      isTopicContinuation,
      finalDecision: hasFollowUpPattern || (hasSharedTerms && hasPronouns) || isTopicContinuation
    });

    return hasFollowUpPattern || (hasSharedTerms && hasPronouns) || isTopicContinuation;
  }

  /**
   * Extract meaningful keywords from text
   * @param {string} text - Text to extract keywords from
   * @returns {Array} - Array of keywords
   */
  extractKeyWords(text) {
    // Remove common stop words and extract meaningful terms
    const stopWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who', 'can', 'could', 'would', 'should', 'do', 'does', 'did', 'is', 'are', 'was', 'were', 'the', 'and', 'or', 'but', 'for', 'with', 'from', 'you', 'explain', 'tell', 'show', 'make', 'makes'];
    
    return text.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !stopWords.includes(word))
      .map(word => word.replace(/[^\w]/g, '')) // Remove punctuation
      .filter(word => word.length > 0);
  }

  /**
   * Get word stem for basic stemming (handle plurals and common variations)
   * @param {string} word - Word to stem
   * @returns {string} - Word stem
   */
  getWordStem(word) {
    // Handle common plurals and variations
    if (word.endsWith('s') && word.length > 4) {
      return word.slice(0, -1); // bonds -> bond
    }
    if (word.endsWith('es') && word.length > 5) {
      return word.slice(0, -2); // molecules -> molecule
    }
    if (word.endsWith('ing') && word.length > 6) {
      return word.slice(0, -3); // bonding -> bond
    }
    if (word.endsWith('ed') && word.length > 5) {
      return word.slice(0, -2); // bonded -> bond
    }
    return word;
  }

  /**
   * Check if current query continues the same topic as recent query
   * @param {string} currentLower - Current query (lowercase)
   * @param {string} recentLower - Recent query (lowercase)
   * @returns {boolean} - True if same topic continuation
   */
  isTopicContinuation(currentLower, recentLower) {
    // Define topic domains
    const topics = {
      chemistry: ['bond', 'bonds', 'covalent', 'ionic', 'polar', 'nonpolar', 'molecule', 'molecules', 'atom', 'atoms', 'electron', 'electrons', 'chemical', 'chemistry'],
      math: ['equation', 'derivative', 'integral', 'function', 'variable', 'algebra', 'calculus'],
      programming: ['code', 'function', 'variable', 'algorithm', 'programming', 'software'],
      physics: ['force', 'energy', 'momentum', 'velocity', 'physics', 'quantum']
    };

    // Check if both queries belong to the same topic domain
    for (const [topicName, keywords] of Object.entries(topics)) {
      const currentMatches = keywords.filter(keyword => currentLower.includes(keyword)).length;
      const recentMatches = keywords.filter(keyword => recentLower.includes(keyword)).length;
      
      // If both queries have significant matches in the same domain
      if (currentMatches >= 2 && recentMatches >= 2) {
        console.log(`[CROWD WISDOM CLUSTERING] 📚 Topic continuation detected: ${topicName}`, {
          currentMatches,
          recentMatches,
          matchingKeywords: keywords.filter(k => currentLower.includes(k) || recentLower.includes(k))
        });
        return true;
      }
    }

    return false;
  }
}

export default QueryClusteringService;
