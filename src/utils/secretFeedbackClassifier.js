import { createClient } from '@supabase/supabase-js';
import Fuse from 'fuse.js';

// Supabase client (we'll import from existing client)
import { supabase } from '../lib/supabaseClient.js';

// Import the new enhancement functions
import { 
  moderateContent, 
  classifyWithPatterns, 
  scoreFeedbackQuality, 
  generateFeedbackEmbedding 
} from './feedbackEnhancements.js';

// Enable debug mode
const DEBUG = true;

// Feedback classifier
const feedbackPhrases = {
  positive: [
    "thank you", "thanks", "got it", "makes sense", "very helpful", "understood",
    "that helps", "perfect", "awesome", "great explanation", "clear now",
    "that's exactly what I needed", "brilliant", "excellent", "love it",
    "this is helpful", "you nailed it", "very clear", "appreciate it", "that was quick"
  ],
  negative: [
    "i don't understand", "confusing", "explain again", "makes no sense",
    "didn't get it", "i'm lost", "still unclear", "that's wrong",
    "not helpful", "please elaborate", "what do you mean",
    "this is hard to follow", "this doesn't help", "i'm stuck",
    "this is incorrect", "too vague", "not what i asked", "that's not it",
    "explain it better", "i'm confused"
  ],
  neutral: [
    "okay", "i see", "alright", "hmm", "interesting", "noted",
    "fine", "right", "i guess", "cool", "gotcha", "sure",
    "makes me think", "well", "huh", "okay then", "i suppose",
    "whatever", "maybe", "fair enough"
  ]
};

const allPhrases = [];
for (const [category, phrases] of Object.entries(feedbackPhrases)) {
  for (const phrase of phrases) {
    allPhrases.push({ phrase, category });
  }
}

const fuse = new Fuse(allPhrases, {
  keys: ['phrase'],
  threshold: 0.3,
  includeScore: true
});

export function classifyFeedback(message) {
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] Input message:', message);
  }
  
  const result = fuse.search(message.toLowerCase().trim());
  
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] Fuse search results:', result);
  }
  
  if (result.length && result[0].score <= 0.3) {
    const classification = result[0].item.category;
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Classification:', classification, 'with score:', result[0].score);
    }
    return classification;
  }
  
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] No match found - returning unknown');
  }
  return 'unknown';
}

// Store feedback in the secret_feedback table
export async function storeSecretFeedback(userId, message, feedbackType, conversationId = null, options = {}) {
  try {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Attempting to store:', {
        userId,
        message,
        feedbackType,
        conversationId,
        options
      });
    }

    // Calculate quality score
    const qualityScore = options.qualityScore || scoreFeedbackQuality(message);
    
    // Generate embedding for future clustering
    const embedding = options.embedding || generateFeedbackEmbedding(message);
    
    // Prepare the insert data
    const insertData = {
      user_id: userId,
      message: message,
      feedback_type: feedbackType,
      conversation_id: conversationId,
      quality_score: qualityScore,
      metadata: options.metadata || {},
      processed_by: options.processedBy || 'phrase_matching',
      confidence_score: options.confidenceScore || 0.8
    };

    // Only add embedding if we have one (to avoid null values)
    if (embedding) {
      insertData.embedding = embedding;
    }
    
    const { data, error } = await supabase
      .from('secret_feedback')
      .insert([insertData])
      .select();

    if (error) {
      console.error('[SECRET FEEDBACK DEBUG] Error storing secret feedback:', error);
      return { success: false, error };
    }

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Successfully stored feedback:', data);
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('[SECRET FEEDBACK DEBUG] Exception storing secret feedback:', error);
    return { success: false, error };
  }
}

// Calculate user feedback score
export async function calculateScore(userId) {
  try {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Calculating score for user:', userId);
    }
    
    const { data, error } = await supabase
      .from('secret_feedback')
      .select('feedback_type')
      .eq('user_id', userId);

    if (error) {
      console.error('[SECRET FEEDBACK DEBUG] Fetch error:', error);
      return null;
    }

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Raw feedback data:', data);
    }

    let score = 0;
    data.forEach(entry => {
      if (entry.feedback_type === 'positive') score += 1;
      else if (entry.feedback_type === 'negative') score -= 1;
    });

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Calculated score:', score);
    }

    return score;
  } catch (error) {
    console.error('[SECRET FEEDBACK DEBUG] Error calculating score:', error);
    return null;
  }
}

// Get recent feedback for analysis
export async function getRecentFeedback(userId, limit = 50) {
  try {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Getting recent feedback for user:', userId);
    }
    
    const { data, error } = await supabase
      .from('secret_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SECRET FEEDBACK DEBUG] Error fetching recent feedback:', error);
      return { success: false, error };
    }

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Recent feedback data:', data);
    }

    return { success: true, data };
  } catch (error) {
    console.error('[SECRET FEEDBACK DEBUG] Error fetching recent feedback:', error);
    return { success: false, error };
  }
}

// Enhanced process and store a user message for secret feedback
export async function processUserMessage(userId, message, conversationId = null, metadata = {}) {
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] Processing user message:', {
      userId,
      message,
      conversationId,
      metadata
    });
  }
  
  // Step 1: Moderate content for spam/abuse
  if (!moderateContent(message)) {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Message failed content moderation');
    }
    return { 
      feedbackType: 'spam', 
      stored: false, 
      error: 'Content failed moderation (spam/inappropriate)',
      qualityScore: 0,
      processedBy: 'content_moderation'
    };
  }

  // Step 2: Try phrase-based classification first
  let feedbackType = classifyFeedback(message);
  let processedBy = 'phrase_matching';
  let confidenceScore = 0.8; // Default confidence for phrase matching
  
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] Phrase-based classification:', feedbackType);
  }
  
  // Step 3: Use pattern-based classification fallback if phrase matching returns unknown
  if (feedbackType === 'unknown') {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Trying pattern classification fallback');
    }
    
    feedbackType = classifyWithPatterns(message);
    processedBy = 'pattern_classification';
    confidenceScore = 0.6; // Lower confidence for pattern fallback
    
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Pattern classification result:', feedbackType);
    }
  }

  // Step 4: Calculate quality score
  const qualityScore = scoreFeedbackQuality(message);
  
  if (DEBUG) {
    console.log('[SECRET FEEDBACK DEBUG] Quality score:', qualityScore);
  }

  // Step 5: Store feedback if it's valid (not unknown or spam)
  if (feedbackType !== 'unknown' && feedbackType !== 'spam') {
    const storeOptions = {
      qualityScore,
      metadata: {
        ...metadata,
        page: metadata.page,
        feature: metadata.feature,
        sessionId: metadata.sessionId
      },
      processedBy,
      confidenceScore
    };

    const result = await storeSecretFeedback(userId, message, feedbackType, conversationId, storeOptions);
    
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Storage result:', result);
    }
    
    // Calculate updated user score
    const userScore = await calculateScore(userId);
    
    return { 
      feedbackType, 
      stored: result.success, 
      error: result.error,
      qualityScore,
      processedBy,
      confidenceScore,
      userScore,
      feedbackId: result.data?.[0]?.id
    };
  }
  
  // Step 6: Handle unknown feedback - could prompt for clarification
  if (feedbackType === 'unknown') {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Unknown feedback - could prompt for clarification');
    }
    
    return { 
      feedbackType: 'unknown', 
      stored: false, 
      error: null,
      qualityScore,
      processedBy,
      suggestion: getFollowUpSuggestion(message),
      userScore: await calculateScore(userId)
    };
  }

  // Default return for any other cases
  return { 
    feedbackType, 
    stored: false, 
    error: 'Unhandled feedback type',
    qualityScore,
    processedBy
  };
}

/**
 * Generate follow-up suggestions for unknown feedback
 * @param {string} message - The original message
 * @returns {string} - Suggested follow-up question
 */
function getFollowUpSuggestion(message) {
  // Analyze the message to provide contextual suggestions
  if (message.length < 10) {
    return "Could you tell us more? For example, what specifically didn't work well?";
  }
  
  if (message.toLowerCase().includes('problem') || message.toLowerCase().includes('issue')) {
    return "Could you describe what the problem was and how we might improve it?";
  }
  
  if (message.toLowerCase().includes('good') || message.toLowerCase().includes('nice')) {
    return "Thanks! What specifically did you find helpful?";
  }
  
  return "Could you help us understand your feedback better? What specific aspect would you like us to know about?";
}

// Calculate user feedback score for a specific conversation
export async function calculateConversationScore(userId, conversationId) {
  try {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Calculating conversation score for user:', userId, 'conversation:', conversationId);
    }
    
    const { data, error } = await supabase
      .from('secret_feedback')
      .select('feedback_type')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId);

    if (error) {
      console.error('[SECRET FEEDBACK DEBUG] Fetch error:', error);
      return null;
    }

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Raw conversation feedback data:', data);
    }

    let score = 0;
    data.forEach(entry => {
      if (entry.feedback_type === 'positive') score += 1;
      else if (entry.feedback_type === 'negative') score -= 1;
    });

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Calculated conversation score:', score);
    }

    return score;
  } catch (error) {
    console.error('[SECRET FEEDBACK DEBUG] Error calculating conversation score:', error);
    return null;
  }
}

// Get recent feedback for a specific conversation
export async function getConversationFeedback(userId, conversationId) {
  try {
    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Getting conversation feedback for user:', userId, 'conversation:', conversationId);
    }
    
    const { data, error } = await supabase
      .from('secret_feedback')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[SECRET FEEDBACK DEBUG] Error fetching conversation feedback:', error);
      return { success: false, error };
    }

    if (DEBUG) {
      console.log('[SECRET FEEDBACK DEBUG] Conversation feedback data:', data);
    }

    return { success: true, data };
  } catch (error) {
    console.error('[SECRET FEEDBACK DEBUG] Error fetching conversation feedback:', error);
    return { success: false, error };
  }
} 