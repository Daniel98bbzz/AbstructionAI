import { OpenAI } from 'openai';
import { supabase } from '../lib/supabaseClient.js';
import QueryClusteringService from '../services/QueryClusteringService.js';
import SuccessAnalyzer from '../services/SuccessAnalyzer.js';
import EmbeddingGenerator from '../utils/embeddingGenerator.js';

class CrowdWisdomManager {
  constructor(openaiClient) {
    this.openai = openaiClient;
    this.queryClusteringService = new QueryClusteringService(openaiClient);
    this.successAnalyzer = new SuccessAnalyzer(openaiClient);
    this.embeddingGenerator = new EmbeddingGenerator(openaiClient);
    
    // Configuration  
    this.learningEnabled = true;
    this.minFeedbackConfidence = 0.7; // Reset to production value
    this.promptUpdateThreshold = 1; // Temporarily reduced for testing (production: 2)
  }

  /**
   * Process a query through the crowd wisdom system
   * @param {string} queryText - User's query
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Processing result with cluster info and prompt enhancement
   */
  async processQuery(queryText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      console.log('[CROWD WISDOM MANAGER] 🚀 Starting crowd wisdom query processing:', {
        query: queryText.substring(0, 80) + (queryText.length > 80 ? '...' : ''),
        queryLength: queryText.length,
        sessionId,
        userId
      });
      
      await this.logEvent('INFO', '🚀 Starting crowd wisdom query processing', {
        queryText: queryText,
        queryLength: queryText.length,
        sessionId,
        userId
      });

      // Step 1: Process query through clustering service
      const clusterResult = await this.queryClusteringService.processQuery(
        queryText, 
        sessionId, 
        userId
      );

      if (!clusterResult) {
        await this.logEvent('ERROR', 'Query clustering failed', {
          queryText: queryText.substring(0, 100),
          sessionId,
          userId
        });
        return null;
      }

      // Step 2: Get cluster-specific prompt enhancement
      console.log('[CROWD WISDOM MANAGER] 📝 Retrieving prompt enhancement for cluster:', clusterResult.clusterId.substring(0, 8) + '...');
      const promptEnhancement = await this.getClusterPromptEnhancement(
        clusterResult.clusterId,
        sessionId
      );
      
      console.log('[CROWD WISDOM MANAGER] 🎨 Prompt enhancement retrieved:', {
        clusterId: clusterResult.clusterId.substring(0, 8) + '...',
        hasEnhancement: !!promptEnhancement && promptEnhancement.length > 0,
        enhancementLength: promptEnhancement ? promptEnhancement.length : 0,
        enhancementPreview: promptEnhancement ? promptEnhancement.substring(0, 100) + '...' : 'None'
      });

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Crowd wisdom query processing completed', {
        clusterId: clusterResult.clusterId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        hasPromptEnhancement: promptEnhancement.length > 0,
        promptEnhancementLength: promptEnhancement.length,
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        clusterId: clusterResult.clusterId,
        assignmentId: clusterResult.assignmentId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        promptEnhancement,
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Crowd wisdom query processing failed', {
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
   * Process user feedback and trigger learning if positive
   * @param {string} assignmentId - Query assignment ID
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response that was given
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Feedback processing result
   */
  async processFeedback(assignmentId, feedbackText, responseText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', 'Starting crowd wisdom feedback processing', {
        assignmentId,
        feedbackLength: feedbackText.length,
        responseLength: responseText.length,
        sessionId,
        userId
      });

      // Step 1: Analyze feedback for positive sentiment
      const feedbackAnalysis = await this.successAnalyzer.analyzeFeedback(
        feedbackText,
        sessionId,
        userId
      );

      await this.logEvent('DEBUG', 'Feedback analysis completed', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        method: feedbackAnalysis.method,
        assignmentId,
        sessionId,
        userId
      });

      // Step 2: Update query assignment with feedback results
      await this.updateQueryAssignmentWithFeedback(
        assignmentId,
        feedbackAnalysis,
        sessionId
      );

      // Step 3: If feedback is positive and confident, trigger learning
      let learningResult = null;
      const shouldTriggerLearning = feedbackAnalysis.isPositive && 
          feedbackAnalysis.confidence >= this.minFeedbackConfidence &&
          this.learningEnabled;
          
      console.log('[CROWD WISDOM MANAGER] 🎓 Learning trigger evaluation:', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        minRequired: this.minFeedbackConfidence,
        learningEnabled: this.learningEnabled,
        shouldTriggerLearning: shouldTriggerLearning
      });
      
      if (shouldTriggerLearning) {
        console.log('[CROWD WISDOM MANAGER] ✅ Positive feedback detected - triggering learning process!');
        await this.logEvent('INFO', '✅ Positive feedback detected, triggering learning process', {
          confidence: feedbackAnalysis.confidence,
          feedbackText: feedbackText,
          assignmentId,
          sessionId,
          userId
        });

        learningResult = await this.triggerLearning(
          assignmentId,
          feedbackText,
          responseText,
          feedbackAnalysis,
          sessionId,
          userId
        );
        
        console.log('[CROWD WISDOM MANAGER] 🎉 Learning process completed:', {
          success: !!learningResult && !learningResult.error,
          clusterId: learningResult?.clusterId?.substring(0, 8) + '...' || 'Unknown',
          promptUpdated: !!learningResult?.promptUpdate,
          learningEventLogged: learningResult?.learningEventLogged || false
        });
      } else {
        console.log('[CROWD WISDOM MANAGER] ❌ Learning not triggered:', {
          reason: !feedbackAnalysis.isPositive ? 'Negative feedback' :
                  feedbackAnalysis.confidence < this.minFeedbackConfidence ? 'Low confidence' :
                  !this.learningEnabled ? 'Learning disabled' : 'Unknown'
        });
      }

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Crowd wisdom feedback processing completed', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        learningTriggered: learningResult !== null,
        processingTimeMs: processingTime,
        assignmentId,
        sessionId,
        userId
      });

      return {
        feedbackAnalysis,
        learningResult,
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Crowd wisdom feedback processing failed', {
        error: error.message,
        assignmentId,
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        feedbackAnalysis: { isPositive: false, confidence: 0, error: error.message },
        learningResult: null,
        error: error.message
      };
    }
  }

  /**
   * Trigger the learning process for successful responses
   * @param {string} assignmentId - Query assignment ID
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response
   * @param {Object} feedbackAnalysis - Feedback analysis result
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Learning result
   */
  async triggerLearning(assignmentId, feedbackText, responseText, feedbackAnalysis, sessionId, userId) {
    try {
      await this.logEvent('INFO', 'Starting learning process', {
        assignmentId,
        feedbackConfidence: feedbackAnalysis.confidence,
        sessionId,
        userId
      });

      // Step 1: Get the cluster for this assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('cluster_id, query_text')
        .eq('id', assignmentId)
        .single();

      if (assignmentError) {
        await this.logEvent('ERROR', 'Failed to get assignment for learning', {
          error: assignmentError.message,
          assignmentId,
          sessionId
        });
        return null;
      }

      // Step 2: Analyze what made the response successful
      const successFactors = await this.analyzeSuccessFactors(
        feedbackText,
        responseText,
        assignment.query_text,
        sessionId,
        userId
      );

      // Step 3: Check if we should update the cluster's prompt
      const shouldUpdate = await this.shouldUpdateClusterPrompt(
        assignment.cluster_id,
        sessionId
      );

      if (shouldUpdate) {
        await this.logEvent('INFO', 'Updating cluster prompt based on learning', {
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId,
          userId
        });

        const promptUpdate = await this.updateClusterPrompt(
          assignment.cluster_id,
          successFactors,
          responseText,
          sessionId,
          userId
        );

        // Step 4: Log the learning event
        await this.logLearningEvent(
          assignment.cluster_id,
          assignmentId,
          successFactors,
          promptUpdate,
          feedbackAnalysis.confidence,
          sessionId
        );

        return {
          clusterId: assignment.cluster_id,
          successFactors,
          promptUpdate,
          learningEventLogged: true
        };
      } else {
        await this.logEvent('DEBUG', 'Cluster prompt update not needed at this time', {
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });

        return {
          clusterId: assignment.cluster_id,
          successFactors,
          promptUpdate: null,
          learningEventLogged: false
        };
      }

    } catch (error) {
      await this.logEvent('ERROR', 'Learning process failed', {
        error: error.message,
        assignmentId,
        sessionId,
        userId
      });

      return {
        error: error.message,
        learningEventLogged: false
      };
    }
  }

  /**
   * Analyze what factors made the response successful
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response
   * @param {string} queryText - Original query
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Success factors
   */
  async analyzeSuccessFactors(feedbackText, responseText, queryText, sessionId, userId) {
    try {
      const prompt = `Analyze why this AI response was successful based on user feedback.

Query: "${queryText}"
AI Response: "${responseText.substring(0, 1000)}..."
User Feedback: "${feedbackText}"

Identify the key factors that made this response effective and suggest how to replicate this success for similar queries.

Respond with JSON:
{
  "successFactors": {
    "usedAnalogy": boolean,
    "clearStructure": boolean,
    "appropriateLevel": boolean,
    "goodExamples": boolean,
    "stepByStep": boolean
  },
  "specificStrengths": ["list specific things that worked well"],
  "teachingTechniques": ["effective teaching methods used"],
  "promptGuidance": "brief instruction for how AI should handle similar queries"
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert educator analyzing successful teaching interactions to extract replicable patterns.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      await this.logEvent('DEBUG', 'Success factors analyzed', {
        analysis,
        tokensUsed: response.usage?.total_tokens || 0,
        sessionId,
        userId
      });

      return analysis;

    } catch (error) {
      await this.logEvent('ERROR', 'Success factor analysis failed', {
        error: error.message,
        sessionId,
        userId
      });

      return {
        successFactors: {
          usedAnalogy: false,
          clearStructure: false,
          appropriateLevel: false,
          goodExamples: false,
          stepByStep: false
        },
        specificStrengths: [],
        teachingTechniques: [],
        promptGuidance: ''
      };
    }
  }

  /**
   * Check if cluster prompt should be updated
   * @param {string} clusterId - Cluster ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Whether to update
   */
  async shouldUpdateClusterPrompt(clusterId, sessionId) {
    try {
      // Get cluster statistics
      const { data: cluster, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('success_count, total_queries, updated_at')
        .eq('id', clusterId)
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to get cluster stats for update decision', {
          error: error.message,
          clusterId,
          sessionId
        });
        return false;
      }

      // Check if we have enough successful responses
      const hasEnoughSuccesses = cluster.success_count >= this.promptUpdateThreshold;
      
      // Check if it's been a while since last update
      const lastUpdate = new Date(cluster.updated_at);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      const hasBeenAWhile = daysSinceUpdate >= 0; // Temporarily removed for testing (production: 0.5 = 12 hours)

      const shouldUpdate = hasEnoughSuccesses && hasBeenAWhile;

      await this.logEvent('DEBUG', 'Cluster prompt update decision', {
        clusterId,
        successCount: cluster.success_count,
        threshold: this.promptUpdateThreshold,
        daysSinceUpdate: daysSinceUpdate.toFixed(1),
        shouldUpdate,
        sessionId
      });

      return shouldUpdate;

    } catch (error) {
      await this.logEvent('ERROR', 'Error checking cluster prompt update criteria', {
        error: error.message,
        clusterId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Update cluster prompt based on learning
   * @param {string} clusterId - Cluster ID
   * @param {Object} successFactors - Success factors analysis
   * @param {string} responseText - Successful response
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - New prompt enhancement
   */
  async updateClusterPrompt(clusterId, successFactors, responseText, sessionId, userId) {
    try {
      // Get current prompt enhancement
      const { data: cluster, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('prompt_enhancement, representative_query')
        .eq('id', clusterId)
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to get current cluster prompt', {
          error: error.message,
          clusterId,
          sessionId
        });
        return '';
      }

      // Generate improved prompt enhancement
      const newPromptEnhancement = await this.generatePromptEnhancement(
        cluster.representative_query,
        cluster.prompt_enhancement,
        successFactors,
        responseText,
        sessionId,
        userId
      );

      // Update cluster with new prompt enhancement
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          prompt_enhancement: newPromptEnhancement,
          updated_at: new Date().toISOString()
        })
        .eq('id', clusterId);

      if (updateError) {
        await this.logEvent('ERROR', 'Failed to update cluster prompt', {
          error: updateError.message,
          clusterId,
          sessionId
        });
        return cluster.prompt_enhancement || '';
      }

      await this.logEvent('INFO', 'Cluster prompt updated successfully', {
        clusterId,
        previousPromptLength: cluster.prompt_enhancement?.length || 0,
        newPromptLength: newPromptEnhancement.length,
        sessionId,
        userId
      });

      return newPromptEnhancement;

    } catch (error) {
      await this.logEvent('ERROR', 'Error updating cluster prompt', {
        error: error.message,
        clusterId,
        sessionId,
        userId
      });
      return '';
    }
  }

  /**
   * Generate new prompt enhancement based on successful patterns
   * @param {string} representativeQuery - Cluster's representative query
   * @param {string} currentPrompt - Current prompt enhancement
   * @param {Object} successFactors - Success factors analysis
   * @param {string} successfulResponse - The successful response
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - New prompt enhancement
   */
  async generatePromptEnhancement(representativeQuery, currentPrompt, successFactors, successfulResponse, sessionId, userId) {
    try {
      const prompt = `Create an improved prompt enhancement for queries similar to: "${representativeQuery}"

Current prompt enhancement: "${currentPrompt || 'None'}"

Based on this successful interaction analysis:
${JSON.stringify(successFactors, null, 2)}

Successful response excerpt: "${successfulResponse.substring(0, 500)}..."

Generate a concise prompt enhancement (2-3 sentences max) that instructs the AI on how to handle similar queries effectively. Focus on the specific techniques that worked well.

The enhancement should be actionable and specific to this type of query.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at creating concise, actionable prompt enhancements that improve AI responses based on successful patterns.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.2
      });

      const enhancement = response.choices[0].message.content.trim();
      
      await this.logEvent('DEBUG', 'Prompt enhancement generated', {
        representativeQuery: representativeQuery.substring(0, 100),
        currentPromptLength: currentPrompt?.length || 0,
        newPromptLength: enhancement.length,
        tokensUsed: response.usage?.total_tokens || 0,
        sessionId,
        userId
      });

      return enhancement;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to generate prompt enhancement', {
        error: error.message,
        sessionId,
        userId
      });
      return currentPrompt || '';
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
      const enhancement = await this.queryClusteringService.getClusterPromptEnhancement(
        clusterId,
        sessionId
      );

      await this.logEvent('DEBUG', 'Retrieved cluster prompt enhancement', {
        clusterId,
        enhancementLength: enhancement.length,
        hasEnhancement: enhancement.length > 0,
        sessionId
      });

      return enhancement;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to get cluster prompt enhancement', {
        error: error.message,
        clusterId,
        sessionId
      });
      return '';
    }
  }

  /**
   * Update query assignment with feedback results
   * @param {string} assignmentId - Assignment ID
   * @param {Object} feedbackAnalysis - Feedback analysis result
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateQueryAssignmentWithFeedback(assignmentId, feedbackAnalysis, sessionId) {
    try {
      const success = await this.successAnalyzer.updateQueryAssignmentWithFeedback(
        assignmentId,
        feedbackAnalysis,
        sessionId
      );

      if (success && feedbackAnalysis.isPositive) {
        // Also update cluster success count
        await this.incrementClusterSuccessCount(assignmentId, sessionId);
      }

      return success;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to update query assignment with feedback', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Increment cluster success count for positive feedback
   * @param {string} assignmentId - Assignment ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async incrementClusterSuccessCount(assignmentId, sessionId) {
    try {
      // Get cluster ID from assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('cluster_id')
        .eq('id', assignmentId)
        .single();

      if (assignmentError) {
        await this.logEvent('ERROR', 'Failed to get cluster ID for success count increment', {
          error: assignmentError.message,
          assignmentId,
          sessionId
        });
        return false;
      }

      // Get current cluster data first
      const { data: currentCluster, error: selectError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('success_count, total_queries')
        .eq('id', assignment.cluster_id)
        .single();

      if (selectError) {
        await this.logEvent('ERROR', 'Failed to get current cluster data for increment', {
          error: selectError.message,
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });
        return false;
      }

      // Calculate new values
      const newSuccessCount = (currentCluster.success_count || 0) + 1;
      const newSuccessRate = currentCluster.total_queries > 0 
        ? newSuccessCount / currentCluster.total_queries 
        : 0;

      // Update cluster with incremented success count
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          success_count: newSuccessCount,
          success_rate: newSuccessRate,
          last_success_at: new Date().toISOString()
        })
        .eq('id', assignment.cluster_id);

      if (updateError) {
        await this.logEvent('ERROR', 'Failed to increment cluster success count', {
          error: updateError.message,
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });
        return false;
      }

      await this.logEvent('INFO', 'Cluster success count incremented successfully', {
        clusterId: assignment.cluster_id,
        previousSuccessCount: currentCluster.success_count || 0,
        newSuccessCount: newSuccessCount,
        newSuccessRate: newSuccessRate.toFixed(2),
        assignmentId,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error incrementing cluster success count', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Log learning event to database
   * @param {string} clusterId - Cluster ID
   * @param {string} assignmentId - Assignment ID
   * @param {Object} successFactors - Success factors
   * @param {string} promptUpdate - Prompt update
   * @param {number} confidence - Confidence score
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async logLearningEvent(clusterId, assignmentId, successFactors, promptUpdate, confidence, sessionId) {
    try {
      const { error } = await supabase
        .from('crowd_wisdom_learning_logs')
        .insert([
          {
            cluster_id: clusterId,
            query_assignment_id: assignmentId,
            extracted_patterns: successFactors,
            prompt_update: promptUpdate,
            confidence_score: confidence,
            learning_trigger: 'positive_feedback'
          }
        ]);

      if (error) {
        await this.logEvent('ERROR', 'Failed to log learning event', {
          error: error.message,
          clusterId,
          assignmentId,
          sessionId
        });
        return false;
      }

      await this.logEvent('DEBUG', 'Learning event logged successfully', {
        clusterId,
        assignmentId,
        confidence,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error logging learning event', {
        error: error.message,
        clusterId,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Get crowd wisdom system statistics
   * @param {string} timeframe - Timeframe for statistics
   * @returns {Promise<Object>} - System statistics
   */
  async getSystemStats(timeframe = '24 hours') {
    try {
      const [clusteringStats, analysisStats] = await Promise.all([
        this.queryClusteringService.getClusteringStats(timeframe),
        this.successAnalyzer.getSuccessAnalysisStats(timeframe)
      ]);

      // Get learning events count
      const { count: learningEvents } = await supabase
        .from('crowd_wisdom_learning_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const stats = {
        clustering: clusteringStats,
        analysis: analysisStats,
        learning: {
          eventsInTimeframe: learningEvents || 0
        },
        system: {
          learningEnabled: this.learningEnabled,
          minFeedbackConfidence: this.minFeedbackConfidence,
          promptUpdateThreshold: this.promptUpdateThreshold
        }
      };

      await this.logEvent('INFO', 'System statistics compiled', {
        timeframe,
        stats
      });

      return stats;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to compile system statistics', {
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
        p_component: 'CrowdWisdomManager',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      console.error('[CrowdWisdomManager] Failed to log event:', error);
    }
  }
}

export default CrowdWisdomManager; 