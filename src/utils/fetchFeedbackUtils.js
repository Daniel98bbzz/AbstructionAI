import { supabase } from '../lib/supabaseClient';

/**
 * Fetch all feedback from the database and local storage
 * @param {Object} options - Options for fetching feedback
 * @param {number} options.limit - Maximum number of records to fetch
 * @param {number} options.offset - Number of records to skip
 * @returns {Promise<Array>} Array of feedback items
 */
export async function fetchAllFeedback({ limit = 100, offset = 0 } = {}) {
  try {
    // First try to get feedback from the database
    const { data: dbFeedback, error } = await supabase
      .from('interactions')
      .select(`
        id,
        type,
        session_id,
        rating,
        comments,
        related_to,
        created_at,
        feedback_content,
        message_id
      `)
      .eq('type', 'feedback')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    // Get localStorage feedback as fallback or additional data
    let localStorageFeedback = [];
    try {
      const storedFeedback = localStorage.getItem('user_feedback');
      if (storedFeedback) {
        localStorageFeedback = JSON.parse(storedFeedback);
      }
    } catch (e) {
      console.warn('Error parsing stored feedback:', e);
    }
    
    // Combine both sources with database having priority
    let combinedFeedback = [];
    
    // Process database feedback if available
    if (!error && dbFeedback && dbFeedback.length > 0) {
      combinedFeedback = dbFeedback.map(item => ({
        id: item.id,
        type: item.type,
        sessionId: item.session_id,
        responseId: item.related_to || item.message_id,
        rating: item.rating,
        comments: item.comments,
        explanationClear: item.feedback_content?.explanationClear || 'unknown',
        explanationDetail: item.feedback_content?.explanationDetail || 'unknown',
        analogyHelpful: item.feedback_content?.analogyHelpful || 'unknown',
        analogyPreference: item.feedback_content?.analogyPreference || '',
        timestamp: item.created_at,
        source: 'database'
      }));
    }
    
    // Add localStorage feedback items that don't appear to be duplicates
    if (localStorageFeedback.length > 0) {
      const dbIds = new Set(combinedFeedback.map(item => item.responseId));
      
      const uniqueLocalFeedback = localStorageFeedback
        .filter(item => !dbIds.has(item.responseId))
        .map(item => ({
          ...item,
          source: 'localStorage'
        }));
      
      combinedFeedback = [...combinedFeedback, ...uniqueLocalFeedback];
    }
    
    // Sort by timestamp, most recent first
    combinedFeedback.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA;
    });
    
    return combinedFeedback;
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return [];
  }
}

/**
 * Submit a feedback from local storage to the database
 * @param {Object} feedback - The feedback object to submit
 * @returns {Promise<Object>} Result of the submission
 */
export async function submitFeedbackToDatabase(feedback) {
  try {
    const { data, error } = await supabase.rpc('submit_feedback', {
      p_message_id: feedback.responseId,
      p_session_id: feedback.sessionId,
      p_feedback_content: {
        rating: feedback.rating,
        explanationClear: feedback.explanationClear,
        explanationDetail: feedback.explanationDetail,
        analogyHelpful: feedback.analogyHelpful,
        analogyPreference: feedback.analogyPreference,
        comments: feedback.comments
      },
      p_user_id: feedback.user_id || 'anonymous'
    });

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error submitting feedback to database:', error);
    return { success: false, error };
  }
}

/**
 * Sync all local storage feedback to the database
 * @returns {Promise<Object>} Result of the sync operation
 */
export async function syncLocalFeedbackToDatabase() {
  try {
    // Get localStorage feedback
    const storedFeedback = localStorage.getItem('user_feedback');
    if (!storedFeedback) {
      return { success: true, message: 'No local feedback to sync', synced: 0 };
    }
    
    const feedbackArray = JSON.parse(storedFeedback);
    if (!Array.isArray(feedbackArray) || feedbackArray.length === 0) {
      return { success: true, message: 'No local feedback to sync', synced: 0 };
    }
    
    // Track successful and failed syncs
    const results = {
      success: true,
      total: feedbackArray.length,
      synced: 0,
      failed: 0,
      failures: []
    };
    
    // Process each feedback item
    for (const feedback of feedbackArray) {
      try {
        const result = await submitFeedbackToDatabase(feedback);
        if (result.success) {
          results.synced++;
        } else {
          results.failed++;
          results.failures.push({
            feedback: feedback.id,
            error: result.error
          });
        }
      } catch (error) {
        results.failed++;
        results.failures.push({
          feedback: feedback.id,
          error: error.message
        });
      }
    }
    
    // Update success status based on results
    results.success = results.failed === 0;
    
    // If all items were synced successfully, clear localStorage
    if (results.success && results.synced === results.total) {
      localStorage.removeItem('user_feedback');
      results.message = 'All feedback synced and local storage cleared';
    } else if (results.synced > 0) {
      results.message = `Synced ${results.synced} of ${results.total} feedback items`;
    } else {
      results.message = 'Failed to sync any feedback';
    }
    
    return results;
  } catch (error) {
    console.error('Error syncing feedback to database:', error);
    return { 
      success: false, 
      message: 'Error syncing feedback to database', 
      error: error.message 
    };
  }
}

/**
 * Delete a feedback item from local storage
 * @param {string} feedbackId - ID of the feedback to delete
 * @returns {boolean} Success status
 */
export function deleteLocalFeedback(feedbackId) {
  try {
    const storedFeedback = localStorage.getItem('user_feedback');
    if (!storedFeedback) {
      return false;
    }
    
    const feedbackArray = JSON.parse(storedFeedback);
    if (!Array.isArray(feedbackArray)) {
      return false;
    }
    
    const updatedFeedback = feedbackArray.filter(item => item.id !== feedbackId);
    
    localStorage.setItem('user_feedback', JSON.stringify(updatedFeedback));
    return true;
  } catch (error) {
    console.error('Error deleting local feedback:', error);
    return false;
  }
}

/**
 * Delete a feedback item from the database
 * @param {string} feedbackId - ID of the feedback to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteDatabaseFeedback(feedbackId) {
  try {
    const { error } = await supabase
      .from('interactions')
      .delete()
      .eq('id', feedbackId);
      
    return !error;
  } catch (error) {
    console.error('Error deleting database feedback:', error);
    return false;
  }
}