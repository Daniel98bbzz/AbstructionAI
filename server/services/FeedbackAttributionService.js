import { supabase } from '../lib/supabaseClient.js';

class FeedbackAttributionService {
  constructor() {
    this.attributionTimeWindowMinutes = 30; // Look back 30 minutes for attribution
    this.maxAttributionCandidates = 10; // Maximum number of queries to consider
  }

  /**
   * Find the most appropriate query to attribute feedback to across sessions
   * @param {string} userId - User ID
   * @param {string} currentSessionId - Current session ID  
   * @param {string} feedbackText - The feedback text
   * @param {number} timeWindowMinutes - Time window to look back (default: 30 min)
   * @returns {Promise<Object|null>} - Attribution result or null if no match
   */
  async findFeedbackAttribution(userId, currentSessionId, feedbackText, timeWindowMinutes = null) {
    try {
      const lookbackWindow = timeWindowMinutes || this.attributionTimeWindowMinutes;
      const cutoffTime = new Date(Date.now() - lookbackWindow * 60 * 1000).toISOString();
      
      console.log('[FEEDBACK ATTRIBUTION] 🔍 Searching for attribution candidate', {
        userId,
        currentSessionId,
        feedbackText: feedbackText.substring(0, 50) + '...',
        lookbackWindowMinutes: lookbackWindow,
        cutoffTime
      });

      // Get recent query assignments for this user across all sessions
      const { data: candidateQueries, error } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select(`
          id,
          query_text,
          cluster_id,
          similarity_score,
          session_id,
          user_id,
          user_feedback_positive,
          feedback_confidence,
          response_text,
          created_at,
          crowd_wisdom_clusters!inner(
            cluster_name,
            representative_query,
            prompt_enhancement
          )
        `)
        .eq('user_id', userId)
        .gte('created_at', cutoffTime)
        .is('user_feedback_positive', null) // Only queries without feedback yet
        .order('created_at', { ascending: false })
        .limit(this.maxAttributionCandidates);

      if (error) {
        console.error('[FEEDBACK ATTRIBUTION] ❌ Database query failed:', error);
        throw error;
      }

      if (!candidateQueries || candidateQueries.length === 0) {
        console.log('[FEEDBACK ATTRIBUTION] 📭 No attribution candidates found', {
          userId,
          lookbackWindowMinutes: lookbackWindow,
          reason: 'No recent queries without feedback'
        });
        return null;
      }

      console.log('[FEEDBACK ATTRIBUTION] 📋 Found attribution candidates:', {
        candidateCount: candidateQueries.length,
        queries: candidateQueries.map(q => ({
          id: q.id.substring(0, 8) + '...',
          query: q.query_text?.substring(0, 50) + '...',
          sessionId: q.session_id,
          createdAt: q.created_at,
          cluster: q.crowd_wisdom_clusters?.cluster_name
        }))
      });

      // Score and rank candidates
      const scoredCandidates = candidateQueries.map(query => {
        const score = this.calculateAttributionScore(query, feedbackText, currentSessionId);
        return {
          ...query,
          attributionScore: score.totalScore,
          attributionFactors: score.factors
        };
      });

      // Sort by attribution score (highest first)
      scoredCandidates.sort((a, b) => b.attributionScore - a.attributionScore);

      const bestMatch = scoredCandidates[0];
      const minimumThreshold = 0.3; // Minimum score needed for attribution

      if (bestMatch.attributionScore < minimumThreshold) {
        console.log('[FEEDBACK ATTRIBUTION] 🎯 No suitable attribution found', {
          bestScore: bestMatch.attributionScore,
          threshold: minimumThreshold,
          reason: 'Best candidate score below threshold'
        });
        return null;
      }

      console.log('[FEEDBACK ATTRIBUTION] ✅ Attribution match found:', {
        assignmentId: bestMatch.id,
        queryText: bestMatch.query_text?.substring(0, 50) + '...',
        clusterName: bestMatch.crowd_wisdom_clusters?.cluster_name,
        attributionScore: bestMatch.attributionScore,
        attributionFactors: bestMatch.attributionFactors,
        sessionId: bestMatch.session_id,
        timeAgo: Math.round((Date.now() - new Date(bestMatch.created_at).getTime()) / (1000 * 60)) + ' minutes ago'
      });

      return {
        assignmentId: bestMatch.id,
        queryText: bestMatch.query_text,
        clusterId: bestMatch.cluster_id,
        clusterName: bestMatch.crowd_wisdom_clusters?.cluster_name,
        originalSessionId: bestMatch.session_id,
        createdAt: bestMatch.created_at,
        attributionScore: bestMatch.attributionScore,
        attributionFactors: bestMatch.attributionFactors,
        responseText: bestMatch.response_text
      };

    } catch (error) {
      console.error('[FEEDBACK ATTRIBUTION] ❌ Error finding attribution:', error);
      await this.logEvent('ERROR', 'Feedback attribution search failed', {
        error: error.message,
        userId,
        currentSessionId,
        feedbackText: feedbackText.substring(0, 100)
      });
      return null;
    }
  }

  /**
   * Calculate attribution score for a query candidate
   * @param {Object} query - Query candidate with metadata
   * @param {string} feedbackText - Feedback text
   * @param {string} currentSessionId - Current session ID
   * @returns {Object} - Score breakdown
   */
  calculateAttributionScore(query, feedbackText, currentSessionId) {
    const factors = {};
    let totalScore = 0;

    // 1. Recency factor (more recent = higher score)
    const ageMinutes = (Date.now() - new Date(query.created_at).getTime()) / (1000 * 60);
    factors.recency = Math.max(0, 1 - (ageMinutes / this.attributionTimeWindowMinutes));
    totalScore += factors.recency * 0.4; // 40% weight

    // 2. Session context factor (same session = higher score)
    factors.sessionContext = query.session_id === currentSessionId ? 1.0 : 0.3;
    totalScore += factors.sessionContext * 0.2; // 20% weight

    // 3. Query complexity factor (more complex queries deserve feedback more)
    const queryLength = query.query_text?.length || 0;
    factors.queryComplexity = Math.min(1.0, queryLength / 100); // Normalize to 100 chars
    totalScore += factors.queryComplexity * 0.15; // 15% weight

    // 4. Cluster significance factor (clusters with enhancements are more important)
    factors.clusterSignificance = query.crowd_wisdom_clusters?.prompt_enhancement ? 0.8 : 0.4;
    totalScore += factors.clusterSignificance * 0.15; // 15% weight

    // 5. Feedback relevance factor (simple heuristic based on feedback content)
    factors.feedbackRelevance = this.calculateFeedbackRelevance(feedbackText, query.query_text);
    totalScore += factors.feedbackRelevance * 0.1; // 10% weight

    return {
      totalScore: Math.min(1.0, totalScore), // Cap at 1.0
      factors
    };
  }

  /**
   * Calculate how relevant the feedback is to a specific query
   * @param {string} feedbackText - Feedback text
   * @param {string} queryText - Original query text
   * @returns {number} - Relevance score (0-1)
   */
  calculateFeedbackRelevance(feedbackText, queryText) {
    const feedbackLower = feedbackText.toLowerCase();
    const queryLower = queryText?.toLowerCase() || '';

    // Check for topic overlap
    const queryWords = queryLower.split(/\W+/).filter(w => w.length > 3);
    const feedbackWords = feedbackLower.split(/\W+/);
    
    const commonWords = queryWords.filter(word => 
      feedbackWords.some(fw => fw.includes(word) || word.includes(fw))
    );

    // Base relevance on word overlap
    const wordOverlap = queryWords.length > 0 ? commonWords.length / queryWords.length : 0;

    // Boost for general positive feedback
    const hasGeneralPositive = /thank|help|understand|clear|good|great|perfect|excellent|amazing/.test(feedbackLower);
    
    return Math.min(1.0, wordOverlap + (hasGeneralPositive ? 0.5 : 0));
  }

  /**
   * Process cross-session feedback attribution
   * @param {string} userId - User ID
   * @param {string} currentSessionId - Current session ID
   * @param {string} feedbackText - Feedback text
   * @param {Object} feedbackAnalysis - Result from SuccessAnalyzer
   * @returns {Promise<Object>} - Attribution result
   */
  async processCrossSessionFeedback(userId, currentSessionId, feedbackText, feedbackAnalysis) {
    try {
      console.log('[FEEDBACK ATTRIBUTION] 🚀 Starting cross-session feedback processing', {
        userId,
        currentSessionId,
        feedbackIsPositive: feedbackAnalysis.isPositive,
        feedbackConfidence: feedbackAnalysis.confidence
      });

      // Only process positive feedback
      if (!feedbackAnalysis.isPositive) {
        console.log('[FEEDBACK ATTRIBUTION] ⏭️ Skipping negative feedback');
        return { processed: false, reason: 'negative_feedback' };
      }

      // Find attribution candidate
      const attribution = await this.findFeedbackAttribution(userId, currentSessionId, feedbackText);
      
      if (!attribution) {
        console.log('[FEEDBACK ATTRIBUTION] 🤷 No attribution candidate found');
        return { processed: false, reason: 'no_attribution_candidate' };
      }

      console.log('[FEEDBACK ATTRIBUTION] 🎯 Attributing feedback to query:', {
        assignmentId: attribution.assignmentId,
        originalQuery: attribution.queryText?.substring(0, 50) + '...',
        attributionScore: attribution.attributionScore
      });

      // Update the query assignment with feedback
      const { error: updateError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .update({
          user_feedback_positive: feedbackAnalysis.isPositive,
          feedback_confidence: feedbackAnalysis.confidence
        })
        .eq('id', attribution.assignmentId);

      if (updateError) {
        console.error('[FEEDBACK ATTRIBUTION] ❌ Failed to update query assignment:', updateError);
        throw updateError;
      }

      console.log('[FEEDBACK ATTRIBUTION] ✅ Successfully attributed cross-session feedback');

      await this.logEvent('INFO', 'Cross-session feedback attribution successful', {
        userId,
        currentSessionId,
        assignmentId: attribution.assignmentId,
        originalSessionId: attribution.originalSessionId,
        attributionScore: attribution.attributionScore,
        feedbackConfidence: feedbackAnalysis.confidence,
        timeDelayMinutes: Math.round((Date.now() - new Date(attribution.createdAt).getTime()) / (1000 * 60))
      });

      return {
        processed: true,
        attribution,
        feedbackAnalysis
      };

    } catch (error) {
      console.error('[FEEDBACK ATTRIBUTION] ❌ Cross-session feedback processing failed:', error);
      
      await this.logEvent('ERROR', 'Cross-session feedback attribution failed', {
        error: error.message,
        userId,
        currentSessionId,
        feedbackText: feedbackText.substring(0, 100)
      });

      return {
        processed: false,
        error: error.message
      };
    }
  }

  /**
   * Log events to the crowd wisdom system
   * @param {string} level - Log level
   * @param {string} message - Log message  
   * @param {Object} metadata - Additional metadata
   */
  async logEvent(level, message, metadata = {}) {
    try {
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'FeedbackAttributionService',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.currentSessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      console.error('[FeedbackAttributionService] Failed to log event:', error);
    }
  }
}

export default FeedbackAttributionService; 