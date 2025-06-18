// Server-side secret feedback classifier
// Supabase client (server version)
import { supabase } from '../lib/supabaseClient.js';

// Import the enhancement functions
import { 
  moderateContent, 
  classifyWithNLP, 
  scoreFeedbackQuality, 
  generateFeedbackEmbedding 
} from './feedbackEnhancements.js';

/**
 * Main function to process user messages for secret feedback
 * @param {string} userId - User ID who submitted the feedback
 * @param {string} message - The user's message/feedback content
 * @param {string} conversationId - Optional conversation context ID
 * @param {Object} metadata - Additional metadata about the feedback
 * @returns {Object} Processing results including scores and stored data
 */
export async function processUserMessage(userId, message, conversationId = null, metadata = {}) {
  try {
    console.log('[SECRET FEEDBACK] Processing message for user:', userId);

    // Step 1: Content moderation
    const moderation = await moderateContent(message);
    if (!moderation.safe) {
      console.warn('[SECRET FEEDBACK] Content flagged by moderation:', moderation);
      return {
        success: false,
        error: 'Content flagged by moderation system',
        moderation
      };
    }

    // Step 2: NLP Classification
    const classification = await classifyWithNLP(message);
    console.log('[SECRET FEEDBACK] Classification results:', classification);

    // Step 3: Quality scoring
    const qualityResult = await scoreFeedbackQuality(message, metadata);
    console.log('[SECRET FEEDBACK] Quality score:', qualityResult.score);

    // Step 4: Generate embedding for similarity matching
    const embedding = await generateFeedbackEmbedding(message);

    // Step 5: Calculate secret feedback score
    const secretScore = calculateScore(classification, qualityResult, moderation);

    // Step 6: Determine feedback type based on classification and score
    const feedbackType = determineFeedbackType(classification, secretScore);

    // Step 7: Store in database
    const storedFeedback = await storeFeedbackData({
      userId,
      content: message,
      conversationId,
      classification: classification.classification,
      qualityScore: qualityResult.score,
      qualityBreakdown: qualityResult.breakdown,
      secretScore,
      feedbackType,
      embedding,
      moderation,
      metadata
    });

    if (!storedFeedback.success) {
      throw new Error('Failed to store feedback data');
    }

    return {
      success: true,
      feedbackId: storedFeedback.feedbackId,
      scores: {
        quality: qualityResult.score,
        secret: secretScore,
        sentiment: classification.classification?.sentiment || 'neutral'
      },
      classification: classification.classification,
      feedbackType,
      stored: true
    };

  } catch (error) {
    console.error('[SECRET FEEDBACK] Error processing message:', error);
    return {
      success: false,
      error: error.message,
      scores: { quality: 0, secret: 0, sentiment: 'neutral' }
    };
  }
}

/**
 * Calculate the secret feedback score based on multiple factors
 * @param {Object} classification - NLP classification results
 * @param {Object} qualityResult - Quality scoring results
 * @param {Object} moderation - Content moderation results
 * @returns {number} Secret feedback score (0-100)
 */
export function calculateScore(classification, qualityResult, moderation) {
  let score = 0;

  // Base quality score (40% weight)
  score += (qualityResult.score || 0) * 0.4;

  // Classification confidence bonus (20% weight)
  if (classification.success && classification.classification) {
    score += (classification.classification.confidence || 0) * 100 * 0.2;
  }

  // Intent-based scoring (20% weight)
  if (classification.success && classification.classification) {
    const intent = classification.classification.intent;
    const intentScores = {
      'bug_report': 20,
      'feature_request': 18,
      'complaint': 15,
      'question': 12,
      'general_feedback': 10,
      'praise': 8
    };
    score += (intentScores[intent] || 10);
  }

  // Urgency bonus (10% weight)
  if (classification.success && classification.classification) {
    const urgency = classification.classification.urgency;
    const urgencyScores = {
      'high': 10,
      'medium': 7,
      'low': 5
    };
    score += (urgencyScores[urgency] || 5);
  }

  // Safety bonus (10% weight)
  if (moderation.safe) {
    score += 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Determine feedback type based on classification and secret score
 * @param {Object} classification - NLP classification results
 * @param {number} secretScore - Calculated secret score
 * @returns {string} Feedback type category
 */
function determineFeedbackType(classification, secretScore) {
  if (!classification.success || !classification.classification) {
    return 'general';
  }

  const { intent, urgency, sentiment } = classification.classification;

  // High-value feedback
  if (secretScore >= 80) {
    return 'high_value';
  }

  // Bug reports and feature requests are important
  if (intent === 'bug_report' || intent === 'feature_request') {
    return intent;
  }

  // Urgent items get special handling
  if (urgency === 'high') {
    return 'urgent';
  }

  // Complaints need attention
  if (intent === 'complaint' || sentiment === 'negative') {
    return 'complaint';
  }

  // Praise is good to track
  if (intent === 'praise' || sentiment === 'positive') {
    return 'praise';
  }

  return 'general';
}

/**
 * Store feedback data in the database
 * @param {Object} feedbackData - All feedback data to store
 * @returns {Object} Storage result with feedback ID
 */
async function storeFeedbackData(feedbackData) {
  try {
    const {
      userId,
      content,
      conversationId,
      classification,
      qualityScore,
      qualityBreakdown,
      secretScore,
      feedbackType,
      embedding,
      moderation,
      metadata
    } = feedbackData;

    // Prepare secret feedback data object
    const secretFeedbackData = {
      classification,
      qualityBreakdown,
      secretScore,
      moderation: {
        safe: moderation.safe,
        flagged: moderation.flagged,
        categories: moderation.categories
      },
      processedAt: new Date().toISOString(),
      version: '2.0'
    };

    // Validate UUID format for user_id (set to null if invalid)
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
    const validUserId = isValidUUID ? userId : null;

    // Insert into feedbacks table
    const { data, error } = await supabase
      .from('feedbacks')
      .insert({
        user_id: validUserId,
        content,
        conversation_id: conversationId,
        feedback_type: feedbackType,
        quality_score: qualityScore,
        sentiment_score: getSentimentScore(classification?.sentiment),
        secret_feedback_data: secretFeedbackData,
        embedding,
        metadata,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    console.log('[SECRET FEEDBACK] Stored feedback with ID:', data.id);

    return {
      success: true,
      feedbackId: data.id
    };

  } catch (error) {
    console.error('[SECRET FEEDBACK] Error storing feedback:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Convert sentiment string to numeric score
 * @param {string} sentiment - Sentiment classification
 * @returns {number} Numeric sentiment score
 */
function getSentimentScore(sentiment) {
  const sentimentMap = {
    'positive': 0.8,
    'neutral': 0.5,
    'negative': 0.2
  };
  return sentimentMap[sentiment] || 0.5;
}

/**
 * Get recent feedback for analysis
 * @param {number} limit - Number of recent feedbacks to retrieve
 * @param {string} userId - Optional user ID filter
 * @returns {Array} Recent feedback entries
 */
export async function getRecentFeedback(limit = 10, userId = null) {
  try {
    let query = supabase
      .from('feedbacks')
      .select(`
        id,
        user_id,
        content,
        feedback_type,
        quality_score,
        sentiment_score,
        secret_feedback_data,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];

  } catch (error) {
    console.error('[SECRET FEEDBACK] Error getting recent feedback:', error);
    return [];
  }
}

/**
 * Calculate conversation-level feedback score
 * @param {string} conversationId - Conversation ID to analyze
 * @returns {Object} Conversation feedback analysis
 */
export async function calculateConversationScore(conversationId) {
  try {
    const { data: feedbacks, error } = await supabase
      .from('feedbacks')
      .select(`
        id,
        quality_score,
        sentiment_score,
        feedback_type,
        secret_feedback_data,
        created_at
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    if (!feedbacks || feedbacks.length === 0) {
      return {
        success: true,
        conversationId,
        score: 0,
        feedbackCount: 0,
        message: 'No feedback found for this conversation'
      };
    }

    // Calculate averages
    const avgQuality = feedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / feedbacks.length;
    const avgSentiment = feedbacks.reduce((sum, f) => sum + (f.sentiment_score || 0), 0) / feedbacks.length;
    const avgSecret = feedbacks.reduce((sum, f) => 
      sum + (f.secret_feedback_data?.secretScore || 0), 0
    ) / feedbacks.length;

    // Feedback type distribution
    const typeDistribution = feedbacks.reduce((acc, f) => {
      acc[f.feedback_type] = (acc[f.feedback_type] || 0) + 1;
      return acc;
    }, {});

    // Overall conversation score (weighted average)
    const conversationScore = (avgQuality * 0.4) + (avgSentiment * 100 * 0.3) + (avgSecret * 0.3);

    return {
      success: true,
      conversationId,
      score: Math.round(conversationScore),
      feedbackCount: feedbacks.length,
      averages: {
        quality: Math.round(avgQuality * 100) / 100,
        sentiment: Math.round(avgSentiment * 100) / 100,
        secret: Math.round(avgSecret * 100) / 100
      },
      typeDistribution,
      timeline: feedbacks.map(f => ({
        id: f.id,
        type: f.feedback_type,
        quality: f.quality_score,
        sentiment: f.sentiment_score,
        timestamp: f.created_at
      }))
    };

  } catch (error) {
    console.error('[SECRET FEEDBACK] Error calculating conversation score:', error);
    return {
      success: false,
      error: error.message,
      conversationId,
      score: 0
    };
  }
}

/**
 * Get feedback for a specific conversation
 * @param {string} conversationId - Conversation ID
 * @returns {Array} Feedback entries for the conversation
 */
export async function getConversationFeedback(conversationId) {
  try {
    const { data, error } = await supabase
      .from('feedbacks')
      .select(`
        id,
        user_id,
        content,
        feedback_type,
        quality_score,
        sentiment_score,
        secret_feedback_data,
        created_at
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];

  } catch (error) {
    console.error('[SECRET FEEDBACK] Error getting conversation feedback:', error);
    return [];
  }
} 