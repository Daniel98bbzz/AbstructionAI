import ResponseClusterManager from './ResponseClusterManager.js';
import UserClusterManager from './UserClusterManager.js';
import FeedbackProcessor from './FeedbackProcessor.js';
import { supabase } from '../lib/supabaseClient.js';

class Supervisor {
  constructor() {
    // No direct initialization required
    this.responseClusterManager = ResponseClusterManager;
    this.userClusterManager = UserClusterManager;
    this.feedbackProcessor = new FeedbackProcessor();
  }

  /**
   * Suggest activities based on the query and response
   * @param {string} query - The user's query
   * @param {Object} response - The AI's response
   * @returns {Promise<Array>} - Suggested activities
   */
  async suggestActivities(query, response) {
    // In a real implementation, this would:
    // 1. Analyze the query and response
    // 2. Match with a database of activities
    // 3. Consider user's learning history and preferences
    // 4. Return personalized activity suggestions
    
    // For now, we'll return generic suggestions based on keywords
    const keywords = this.extractKeywords(query);
    return this.generateSuggestions(keywords);
  }

  /**
   * Extract keywords from a query
   * @param {string} query - The user's query
   * @returns {Array} - Extracted keywords
   */
  extractKeywords(query) {
    // Simple keyword extraction
    // In a real implementation, this would use NLP techniques
    const words = query.toLowerCase().split(/\W+/);
    const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'of', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might', 'must'];
    
    return words.filter(word => 
      word.length > 3 && 
      !stopWords.includes(word)
    );
  }

  /**
   * Generate activity suggestions based on keywords
   * @param {Array} keywords - Extracted keywords
   * @returns {Array} - Suggested activities
   */
  generateSuggestions(keywords) {
    const suggestions = [];
    
    // Map of keywords to activities
    const activityMap = {
      'algorithm': [
        { type: 'practice', title: 'Implement the algorithm in your preferred programming language' },
        { type: 'visualization', title: 'Draw a flowchart of the algorithm steps' }
      ],
      'quantum': [
        { type: 'simulation', title: 'Try a quantum computing simulator online' },
        { type: 'research', title: 'Read a research paper on recent quantum computing breakthroughs' }
      ],
      'neural': [
        { type: 'project', title: 'Build a simple neural network using TensorFlow or PyTorch' },
        { type: 'visualization', title: 'Visualize how neurons activate with different inputs' }
      ],
      'circuit': [
        { type: 'simulation', title: 'Use a circuit simulator to build and test the circuit' },
        { type: 'project', title: 'Build a physical version of the circuit if components are available' }
      ],
      'physics': [
        { type: 'experiment', title: 'Design a simple experiment to demonstrate this concept' },
        { type: 'visualization', title: 'Create a diagram showing the forces or interactions involved' }
      ],
      'math': [
        { type: 'practice', title: 'Solve practice problems related to this concept' },
        { type: 'application', title: 'Find a real-world application where this math is used' }
      ],
      'programming': [
        { type: 'project', title: 'Create a small project implementing this concept' },
        { type: 'practice', title: 'Solve coding challenges related to this topic' }
      ]
    };
    
    // Add generic suggestions
    suggestions.push(
      { type: 'reflection', title: 'Write a summary of this concept in your own words' },
      { type: 'teaching', title: 'Try explaining this concept to someone else' }
    );
    
    // Add keyword-specific suggestions
    keywords.forEach(keyword => {
      Object.keys(activityMap).forEach(key => {
        if (keyword.includes(key) && suggestions.length < 5) {
          activityMap[key].forEach(activity => {
            if (!suggestions.some(s => s.title === activity.title)) {
              suggestions.push(activity);
            }
          });
        }
      });
    });
    
    // Limit to 5 suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Process user query with crowd wisdom enhancement
   * @param {string} query - The user's query
   * @param {string} sessionId - The session ID
   * @param {string} userId - The user ID (optional)
   * @param {Object} openai - OpenAI client
   * @param {boolean} useCompositeScore - Whether to use composite quality score (default: true)
   * @param {number} explorationRate - Rate of exploring newer templates (0-1)
   * @returns {Promise<Object>} - Enhanced query and template information
   */
  async processQueryWithCrowdWisdom(query, sessionId, userId, openai, useCompositeScore = true, explorationRate = 0.1) {
    try {
      console.log('[Crowd Wisdom] Processing query with crowd wisdom enhancement');
      console.log(`[Crowd Wisdom] Using ${useCompositeScore ? 'composite' : 'efficacy'} score with exploration rate: ${explorationRate}`);
      
      // Step 1: Classify the topic of the query
      const topic = await this.responseClusterManager.classifyTopic(query, openai);
      console.log(`[Crowd Wisdom] Classified topic: ${topic}`);
      
      // Step 2: Get a template for this topic using new parameters
      const template = await this.responseClusterManager.getTemplateForTopic(
        topic, 
        useCompositeScore, 
        explorationRate
      );
      
      if (!template) {
        console.log(`[Crowd Wisdom] No template found for topic: ${topic}`);
        return {
          enhancedQuery: query,
          template: null,
          topic
        };
      }
      
      console.log(`[Crowd Wisdom] Found template (ID: ${template.id})`);
      
      // Step 3: Enhance the prompt with the template
      const enhancedQuery = this.responseClusterManager.enhancePromptWithTemplate(query, template);
      
      // Step 4: Log this template usage
      await this.responseClusterManager.logTemplateUsage(template.id, sessionId, userId, query, null);
      
      return {
        enhancedQuery,
        template,
        topic,
        selectionMethod: useCompositeScore ? 'composite_score' : 'efficacy_score'
      };
    } catch (error) {
      console.error('Error in processQueryWithCrowdWisdom:', error);
      return {
        enhancedQuery: query,
        template: null,
        topic: 'general',
        selectionMethod: 'none'
      };
    }
  }

  /**
   * Update template efficacy based on feedback
   * @param {string} responseId - The response ID
   * @param {number} rating - The feedback rating (1-5)
   * @param {string} query - The original query
   * @param {Object} response - The response object
   * @param {Object} openai - OpenAI client (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async processFeedbackForCrowdWisdom(responseId, rating, query, response, openai) {
    try {
      // Update efficacy for existing template
      const updated = await this.responseClusterManager.updateTemplateEfficacy(responseId, rating);
      
      if (!updated && rating >= 4) {
        // If no template was used, but the response was highly rated,
        // create a new template from this successful interaction
        const topic = await this.responseClusterManager.classifyTopic(query, openai);
        await this.responseClusterManager.createTemplateFromSuccess(topic, query, response, rating, openai);
      }
      
      // Recalculate composite quality scores periodically
      // Only do this sometimes to avoid overhead on every feedback
      if (Math.random() < 0.2) { // 20% chance
        console.log('[Crowd Wisdom] Triggering periodic composite quality score update');
        // Run in the background to not block the response
        setTimeout(async () => {
          try {
            await this.responseClusterManager.calculateCompositeQualityScores();
          } catch (error) {
            console.error('[Crowd Wisdom] Error in background quality score update:', error);
          }
        }, 100);
      }
      
      return true;
    } catch (error) {
      console.error('Error in processFeedbackForCrowdWisdom:', error);
      return false;
    }
  }

  /**
   * Calculate composite quality scores for all templates
   * @param {Object} customWeights - Optional custom weights for signals
   * @returns {Promise<number>} - Number of templates updated
   */
  async updateCompositeScores(customWeights = null) {
    try {
      console.log('[Crowd Wisdom] Admin-triggered composite quality score update');
      return await this.responseClusterManager.calculateCompositeQualityScores(customWeights);
    } catch (error) {
      console.error('Error updating composite scores:', error);
      return 0;
    }
  }

  /**
   * Get enhanced template recommendations for a user
   * Factors in user's cluster, most active topics, and sentiment history
   * @param {string} userId - The user ID
   * @param {string} topic - Optional specific topic to filter by
   * @param {Object} options - Optional configuration
   * @returns {Promise<Array>} - Array of recommended templates with scores
   */
  async getTemplateRecommendationsForUser(userId, topic = null, options = {}) {
    try {
      console.log(`[Enhanced Recommendations] Getting recommendations for user ${userId}, topic: ${topic || 'any'}`);
      
      const {
        maxRecommendations = 10,
        includeScoreBreakdown = false,
        weights = {
          clusterPopularity: 0.4,
          topicRelevance: 0.35,
          sentimentWeight: 0.25
        }
      } = options;

      // Step 1: Get user's cluster information
      const userCluster = await this.getUserCluster(userId);
      console.log(`[Enhanced Recommendations] User cluster: ${userCluster?.clusterId || 'none'}`);

      // Step 2: Get user's most active topics
      const userTopics = await this.getUserMostActiveTopics(userId, 5);
      console.log(`[Enhanced Recommendations] User's top topics:`, userTopics);

      // Step 3: Get user's sentiment score
      const userSentiment = await this.getUserSentimentStats(userId);
      console.log(`[Enhanced Recommendations] User sentiment stats:`, userSentiment);

      // Step 4: Get template candidates
      const templateCandidates = await this.getTemplateCandidates(userCluster, userTopics, topic);
      console.log(`[Enhanced Recommendations] Found ${templateCandidates.length} template candidates`);

      if (templateCandidates.length === 0) {
        console.log(`[Enhanced Recommendations] No template candidates found`);
        return [];
      }

      // Step 5: Score and rank templates
      const scoredTemplates = await this.scoreTemplates(
        templateCandidates,
        userCluster,
        userTopics,
        userSentiment,
        weights
      );

      // Step 6: Sort and return top recommendations
      scoredTemplates.sort((a, b) => b.finalScore - a.finalScore);
      const recommendations = scoredTemplates.slice(0, maxRecommendations);

      console.log(`[Enhanced Recommendations] Returning ${recommendations.length} recommendations`);
      
      if (includeScoreBreakdown) {
        return recommendations.map(template => ({
          ...template,
          scoreBreakdown: template.scoreBreakdown
        }));
      }

      return recommendations.map(template => ({
        id: template.id,
        topic: template.topic,
        template_text: template.template_text,
        efficacy_score: template.efficacy_score,
        usage_count: template.usage_count,
        finalScore: template.finalScore,
        recommendationReason: template.recommendationReason
      }));

    } catch (error) {
      console.error('Error getting enhanced template recommendations:', error);
      return [];
    }
  }

  /**
   * Get user's cluster information
   * @param {string} userId - The user ID
   * @returns {Promise<Object|null>} - User cluster info
   */
  async getUserCluster(userId) {
    try {
      const { data: assignment, error } = await supabase
        .from('user_cluster_assignments')
        .select('cluster_id, similarity, preferences')
        .eq('user_id', userId)
        .single();

      if (error || !assignment) {
        console.log(`[Enhanced Recommendations] No cluster assignment found for user ${userId}`);
        return null;
      }

      // Get cluster members
      const { data: members, error: membersError } = await supabase
        .from('user_cluster_assignments')
        .select('user_id')
        .eq('cluster_id', assignment.cluster_id)
        .neq('user_id', userId);

      return {
        clusterId: assignment.cluster_id,
        similarity: assignment.similarity,
        preferences: assignment.preferences,
        memberIds: membersError ? [] : members.map(m => m.user_id)
      };
    } catch (error) {
      console.error('Error getting user cluster:', error);
      return null;
    }
  }

  /**
   * Get user's most active topics from session history
   * @param {string} userId - The user ID
   * @param {number} limit - Number of top topics to return
   * @returns {Promise<Array>} - Array of topics with counts
   */
  async getUserMostActiveTopics(userId, limit = 5) {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('secret_topic')
        .eq('user_id', userId)
        .not('secret_topic', 'is', null);

      if (error || !sessions) {
        console.log(`[Enhanced Recommendations] No sessions found for user ${userId}`);
        return [];
      }

      // Count topic frequencies
      const topicCounts = {};
      sessions.forEach(session => {
        if (session.secret_topic) {
          topicCounts[session.secret_topic] = (topicCounts[session.secret_topic] || 0) + 1;
        }
      });

      // Sort by frequency and return top topics
      return Object.entries(topicCounts)
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting user topics:', error);
      return [];
    }
  }

  /**
   * Get user's sentiment statistics from secret feedback
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Sentiment statistics
   */
  async getUserSentimentStats(userId) {
    try {
      const { data: feedback, error } = await supabase
        .from('secret_feedback')
        .select('feedback_type')
        .eq('user_id', userId);

      if (error || !feedback) {
        console.log(`[Enhanced Recommendations] No feedback found for user ${userId}`);
        return { positive: 0, negative: 0, neutral: 0, score: 0 };
      }

      const stats = {
        positive: feedback.filter(f => f.feedback_type === 'positive').length,
        negative: feedback.filter(f => f.feedback_type === 'negative').length,
        neutral: feedback.filter(f => f.feedback_type === 'neutral').length
      };

      stats.total = stats.positive + stats.negative + stats.neutral;
      stats.score = stats.positive - stats.negative;
      stats.positivityRatio = stats.total > 0 ? stats.positive / stats.total : 0.5;

      return stats;
    } catch (error) {
      console.error('Error getting user sentiment:', error);
      return { positive: 0, negative: 0, neutral: 0, score: 0, positivityRatio: 0.5 };
    }
  }

  /**
   * Get template candidates based on cluster and topics
   * @param {Object} userCluster - User's cluster information
   * @param {Array} userTopics - User's most active topics
   * @param {string} specificTopic - Optional specific topic filter
   * @returns {Promise<Array>} - Array of template candidates
   */
  async getTemplateCandidates(userCluster, userTopics, specificTopic = null) {
    try {
      // Build topic list for query
      const topicsToQuery = specificTopic 
        ? [specificTopic] 
        : userTopics.map(t => t.topic);

      if (topicsToQuery.length === 0) {
        // Fallback to all templates if no topics
        const { data: allTemplates, error } = await supabase
          .from('prompt_templates')
          .select('*')
          .order('efficacy_score', { ascending: false })
          .limit(50);

        return allTemplates || [];
      }

      // Get templates for user's topics
      const { data: templates, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .in('topic', topicsToQuery)
        .order('efficacy_score', { ascending: false });

      if (error) {
        console.error('Error fetching template candidates:', error);
        return [];
      }

      return templates || [];
    } catch (error) {
      console.error('Error getting template candidates:', error);
      return [];
    }
  }

  /**
   * Score templates based on multiple factors
   * @param {Array} templates - Template candidates
   * @param {Object} userCluster - User's cluster information
   * @param {Array} userTopics - User's most active topics
   * @param {Object} userSentiment - User's sentiment statistics
   * @param {Object} weights - Scoring weights
   * @returns {Promise<Array>} - Scored templates
   */
  async scoreTemplates(templates, userCluster, userTopics, userSentiment, weights) {
    const scoredTemplates = [];

    for (const template of templates) {
      try {
        // Calculate cluster popularity score
        const clusterScore = await this.calculateClusterPopularityScore(
          template.id, 
          userCluster
        );

        // Calculate topic relevance score
        const topicScore = this.calculateTopicRelevanceScore(
          template.topic, 
          userTopics
        );

        // Calculate sentiment-based score
        const sentimentScore = this.calculateSentimentScore(
          template, 
          userSentiment
        );

        // Calculate final weighted score
        const finalScore = (
          clusterScore * weights.clusterPopularity +
          topicScore * weights.topicRelevance +
          sentimentScore * weights.sentimentWeight
        );

        // Generate recommendation reason
        const recommendationReason = this.generateRecommendationReason(
          clusterScore,
          topicScore,
          sentimentScore,
          template
        );

        scoredTemplates.push({
          ...template,
          finalScore,
          recommendationReason,
          scoreBreakdown: {
            clusterPopularity: clusterScore,
            topicRelevance: topicScore,
            sentimentWeight: sentimentScore,
            weights
          }
        });
      } catch (error) {
        console.error(`Error scoring template ${template.id}:`, error);
        // Include template with minimal score on error
        scoredTemplates.push({
          ...template,
          finalScore: 0.1,
          recommendationReason: 'Fallback recommendation',
          scoreBreakdown: {
            clusterPopularity: 0,
            topicRelevance: 0,
            sentimentWeight: 0.1,
            weights
          }
        });
      }
    }

    return scoredTemplates;
  }

  /**
   * Calculate cluster popularity score for a template
   * @param {string} templateId - Template ID
   * @param {Object} userCluster - User's cluster information
   * @returns {Promise<number>} - Score between 0 and 1
   */
  async calculateClusterPopularityScore(templateId, userCluster) {
    if (!userCluster || !userCluster.memberIds || userCluster.memberIds.length === 0) {
      return 0.3; // Default neutral score
    }

    try {
      // Get template usage by cluster members
      const { data: usages, error } = await supabase
        .from('prompt_template_usage')
        .select('feedback_score')
        .eq('template_id', templateId)
        .in('user_id', userCluster.memberIds)
        .not('feedback_score', 'is', null);

      if (error || !usages || usages.length === 0) {
        return 0.2; // Low score if no cluster usage
      }

      // Calculate average rating from cluster members
      const totalRating = usages.reduce((sum, usage) => sum + usage.feedback_score, 0);
      const averageRating = totalRating / usages.length;
      
      // Normalize to 0-1 scale (rating is 1-5)
      const normalizedRating = (averageRating - 1) / 4;

      // Factor in usage frequency (more usage = higher confidence)
      const usageBonus = Math.min(usages.length / 10, 0.3); // Cap at 0.3 bonus
      
      return Math.min(normalizedRating + usageBonus, 1.0);
    } catch (error) {
      console.error('Error calculating cluster popularity score:', error);
      return 0.3;
    }
  }

  /**
   * Calculate topic relevance score
   * @param {string} templateTopic - Template's topic
   * @param {Array} userTopics - User's active topics with counts
   * @returns {number} - Score between 0 and 1
   */
  calculateTopicRelevanceScore(templateTopic, userTopics) {
    if (!userTopics || userTopics.length === 0) {
      return 0.5; // Neutral score if no topic data
    }

    // Find exact topic match
    const exactMatch = userTopics.find(ut => ut.topic === templateTopic);
    if (exactMatch) {
      // Score based on how frequently user engages with this topic
      const maxCount = userTopics[0].count; // Topics are sorted by count
      return 0.7 + (0.3 * (exactMatch.count / maxCount));
    }

    // Check for partial matches (e.g., "linear_algebra" matches "algebra")
    const partialMatch = userTopics.find(ut => 
      ut.topic.includes(templateTopic) || templateTopic.includes(ut.topic)
    );
    if (partialMatch) {
      const maxCount = userTopics[0].count;
      return 0.4 + (0.2 * (partialMatch.count / maxCount));
    }

    // No match found
    return 0.1;
  }

  /**
   * Calculate sentiment-based score
   * @param {Object} template - Template object
   * @param {Object} userSentiment - User's sentiment statistics
   * @returns {number} - Score between 0 and 1
   */
  calculateSentimentScore(template, userSentiment) {
    // Base score from template's inherent quality
    let baseScore = 0.5;
    
    if (template.efficacy_score && template.efficacy_score > 0) {
      // Normalize efficacy score (1-5 scale) to 0.2-1.0 range
      baseScore = 0.2 + (template.efficacy_score - 1) / 4 * 0.8;
    }

    // Adjust based on user's sentiment patterns
    if (userSentiment.positivityRatio > 0.7) {
      // User is generally positive - boost high-quality templates
      if (baseScore > 0.6) {
        baseScore += 0.1;
      }
    } else if (userSentiment.positivityRatio < 0.3) {
      // User is frequently negative - be more conservative
      if (baseScore < 0.7) {
        baseScore -= 0.1;
      }
    }

    // Factor in template usage patterns
    if (template.usage_count && template.usage_count > 10) {
      baseScore += 0.05; // Slight boost for well-tested templates
    }

    return Math.max(0, Math.min(1, baseScore));
  }

  /**
   * Generate human-readable recommendation reason
   * @param {number} clusterScore - Cluster popularity score
   * @param {number} topicScore - Topic relevance score
   * @param {number} sentimentScore - Sentiment score
   * @param {Object} template - Template object
   * @returns {string} - Recommendation reason
   */
  generateRecommendationReason(clusterScore, topicScore, sentimentScore, template) {
    const reasons = [];

    if (topicScore > 0.7) {
      reasons.push("matches your frequently used topics");
    } else if (topicScore > 0.4) {
      reasons.push("relates to topics you've explored");
    }

    if (clusterScore > 0.7) {
      reasons.push("highly rated by users with similar preferences");
    } else if (clusterScore > 0.4) {
      reasons.push("used successfully by similar users");
    }

    if (sentimentScore > 0.8) {
      reasons.push("has excellent quality metrics");
    } else if (sentimentScore > 0.6) {
      reasons.push("has good user feedback");
    }

    if (template.usage_count > 20) {
      reasons.push("proven effective in many interactions");
    }

    if (reasons.length === 0) {
      return "recommended based on overall compatibility";
    }

    return "Recommended because it " + reasons.join(" and ");
  }
}

export default Supervisor;