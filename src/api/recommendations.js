/**
 * API service for Enhanced Template Recommendations
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Get template recommendations for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Recommendations response
 */
export const getTemplateRecommendations = async (userId, options = {}) => {
  try {
    const { 
      topic, 
      maxRecommendations = 10, 
      includeScoreBreakdown = false 
    } = options;
    
    const params = new URLSearchParams();
    if (topic) params.append('topic', topic);
    if (maxRecommendations) params.append('max_recommendations', maxRecommendations);
    if (includeScoreBreakdown) params.append('include_score_breakdown', 'true');
    
    const response = await fetch(
      `${API_BASE_URL}/api/users/${userId}/template-recommendations?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching template recommendations:', error);
    throw error;
  }
};

/**
 * Get template recommendations with custom weights
 * @param {string} userId - User ID
 * @param {Object} requestData - Request configuration
 * @returns {Promise<Object>} - Recommendations response
 */
export const getCustomWeightedRecommendations = async (userId, requestData = {}) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/${userId}/template-recommendations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching custom weighted recommendations:', error);
    throw error;
  }
};

/**
 * Get user recommendation insights
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - User insights response
 */
export const getUserRecommendationInsights = async (userId) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/users/${userId}/recommendation-insights`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching user recommendation insights:', error);
    throw error;
  }
};

/**
 * Format recommendation score as percentage
 * @param {number} score - Recommendation score (0-1)
 * @returns {string} - Formatted percentage
 */
export const formatRecommendationScore = (score) => {
  return `${Math.round(score * 100)}%`;
};

/**
 * Get recommendation quality indicator
 * @param {number} score - Recommendation score (0-1)
 * @returns {Object} - Quality indicator with color and label
 */
export const getRecommendationQuality = (score) => {
  if (score >= 0.8) {
    return { label: 'Excellent', color: 'green', bgColor: 'bg-green-100', textColor: 'text-green-800' };
  } else if (score >= 0.6) {
    return { label: 'Good', color: 'blue', bgColor: 'bg-blue-100', textColor: 'text-blue-800' };
  } else if (score >= 0.4) {
    return { label: 'Fair', color: 'yellow', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' };
  } else {
    return { label: 'Poor', color: 'red', bgColor: 'bg-red-100', textColor: 'text-red-800' };
  }
};

/**
 * Group recommendations by topic
 * @param {Array} recommendations - Array of recommendations
 * @returns {Object} - Recommendations grouped by topic
 */
export const groupRecommendationsByTopic = (recommendations) => {
  return recommendations.reduce((groups, rec) => {
    const topic = rec.topic || 'general';
    if (!groups[topic]) {
      groups[topic] = [];
    }
    groups[topic].push(rec);
    return groups;
  }, {});
}; 