import { supabase } from '../lib/supabaseClient.js';
import { generateFeedbackEmbedding, calculateCosineSimilarity, clusterFeedbackEmbeddings } from './feedbackEnhancements.js';

const DEBUG = true;

/**
 * Analyze feedback trends over time
 * @param {string} timeframe - 'day', 'week', 'month', or 'year'
 * @param {number} limit - Maximum number of data points to return
 * @returns {Promise<Object>} - Trend analysis data
 */
export async function analyzeFeedbackTrends(timeframe = 'week', limit = 30) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ANALYTICS DEBUG] Analyzing trends for timeframe:', timeframe);
    }

    let interval;
    switch (timeframe) {
      case 'day':
        interval = '1 day';
        break;
      case 'week':
        interval = '1 week';
        break;
      case 'month':
        interval = '1 month';
        break;
      case 'year':
        interval = '1 year';
        break;
      default:
        interval = '1 week';
    }

    const { data, error } = await supabase.rpc('get_feedback_trends', {
      time_interval: interval,
      data_limit: limit
    });

    if (error) {
      console.error('[FEEDBACK ANALYTICS DEBUG] Error fetching trends:', error);
      // Fallback to basic query if RPC doesn't exist
      return await getFeedbackTrendsBasic(timeframe, limit);
    }

    return {
      success: true,
      trends: data,
      timeframe,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error in trend analysis:', error);
    return {
      success: false,
      error: error.message,
      trends: []
    };
  }
}

/**
 * Fallback method for feedback trends when RPC is not available
 */
async function getFeedbackTrendsBasic(timeframe, limit) {
  try {
    const { data, error } = await supabase
      .from('secret_feedback')
      .select('feedback_type, quality_score, timestamp')
      .order('timestamp', { ascending: false })
      .limit(1000); // Get recent feedback

    if (error) throw error;

    // Group by time periods
    const trends = groupFeedbackByTime(data, timeframe);
    
    return {
      success: true,
      trends: trends.slice(0, limit),
      timeframe,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error in basic trend analysis:', error);
    return {
      success: false,
      error: error.message,
      trends: []
    };
  }
}

/**
 * Group feedback data by time periods
 */
function groupFeedbackByTime(feedbackData, timeframe) {
  const groups = {};
  
  feedbackData.forEach(feedback => {
    const date = new Date(feedback.timestamp);
    let key;
    
    switch (timeframe) {
      case 'day':
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'year':
        key = String(date.getFullYear());
        break;
      default:
        key = date.toISOString().split('T')[0];
    }
    
    if (!groups[key]) {
      groups[key] = {
        period: key,
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0,
        unknown: 0,
        avgQuality: 0,
        qualitySum: 0
      };
    }
    
    groups[key].total++;
    groups[key][feedback.feedback_type]++;
    groups[key].qualitySum += feedback.quality_score || 0;
    groups[key].avgQuality = groups[key].qualitySum / groups[key].total;
  });
  
  return Object.values(groups).sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Get quality distribution analysis
 * @param {string} userId - Optional user ID to filter by
 * @returns {Promise<Object>} - Quality distribution data
 */
export async function getQualityDistribution(userId = null) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ANALYTICS DEBUG] Getting quality distribution for user:', userId || 'all users');
    }

    let query = supabase
      .from('secret_feedback')
      .select('quality_score, feedback_type');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Analyze quality distribution
    const distribution = {
      total: data.length,
      byQualityRange: {
        low: 0,      // 0-30
        medium: 0,   // 31-70
        high: 0      // 71-100
      },
      bySentiment: {
        positive: { total: 0, avgQuality: 0 },
        negative: { total: 0, avgQuality: 0 },
        neutral: { total: 0, avgQuality: 0 },
        unknown: { total: 0, avgQuality: 0 }
      },
      overall: {
        avgQuality: 0,
        medianQuality: 0
      }
    };

    const qualityScores = [];
    const sentimentTotals = { positive: 0, negative: 0, neutral: 0, unknown: 0 };

    data.forEach(feedback => {
      const quality = feedback.quality_score || 0;
      qualityScores.push(quality);

      // Quality range distribution
      if (quality <= 30) {
        distribution.byQualityRange.low++;
      } else if (quality <= 70) {
        distribution.byQualityRange.medium++;
      } else {
        distribution.byQualityRange.high++;
      }

      // Sentiment distribution
      const sentiment = feedback.feedback_type;
      distribution.bySentiment[sentiment].total++;
      sentimentTotals[sentiment] += quality;
    });

    // Calculate averages
    Object.keys(distribution.bySentiment).forEach(sentiment => {
      const count = distribution.bySentiment[sentiment].total;
      if (count > 0) {
        distribution.bySentiment[sentiment].avgQuality = sentimentTotals[sentiment] / count;
      }
    });

    // Overall statistics
    distribution.overall.avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length || 0;
    qualityScores.sort((a, b) => a - b);
    distribution.overall.medianQuality = qualityScores[Math.floor(qualityScores.length / 2)] || 0;

    return {
      success: true,
      distribution,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error getting quality distribution:', error);
    return {
      success: false,
      error: error.message,
      distribution: null
    };
  }
}

/**
 * Generate feedback themes using clustering
 * @param {number} numClusters - Number of themes to identify
 * @param {number} minQuality - Minimum quality score to include
 * @returns {Promise<Object>} - Theme analysis results
 */
export async function generateFeedbackThemes(numClusters = 5, minQuality = 20) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ANALYTICS DEBUG] Generating feedback themes with', numClusters, 'clusters');
    }

    // Get feedback with embeddings and quality filter
    const { data: feedbackData, error } = await supabase
      .from('secret_feedback')
      .select('id, message, feedback_type, quality_score, embedding, timestamp, user_id')
      .gte('quality_score', minQuality)
      .not('embedding', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(500); // Limit for performance

    if (error) throw error;

    if (feedbackData.length < numClusters) {
      return {
        success: false,
        error: 'Not enough quality feedback with embeddings for clustering',
        themes: []
      };
    }

    // Use existing clustering functionality
    const clusterResults = await clusterFeedbackEmbeddings(feedbackData, numClusters);

    // Store cluster results in database
    await storeFeedbackClusters(clusterResults.clusters);

    return {
      success: true,
      themes: clusterResults.clusters,
      totalFeedback: feedbackData.length,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error generating themes:', error);
    return {
      success: false,
      error: error.message,
      themes: []
    };
  }
}

/**
 * Store feedback clusters in the database
 */
async function storeFeedbackClusters(clusters) {
  try {
    for (const cluster of clusters) {
      // Create or update cluster
      const { data: clusterData, error: clusterError } = await supabase
        .from('feedback_clusters')
        .upsert({
          name: `Theme ${cluster.id + 1}`,
          description: generateClusterDescription(cluster.themes),
          centroid: cluster.centroid,
          member_count: cluster.size,
          avg_quality_score: calculateAverageQuality(cluster.feedback),
          sentiment_distribution: calculateSentimentDistribution(cluster.feedback),
          top_keywords: cluster.themes.topWords || []
        })
        .select()
        .single();

      if (clusterError) {
        console.error('[FEEDBACK ANALYTICS DEBUG] Error storing cluster:', clusterError);
        continue;
      }

      // Create assignments
      const assignments = cluster.feedback.map(feedback => ({
        feedback_id: feedback.id,
        cluster_id: clusterData.id,
        similarity_score: 0.8 // Default similarity, can be calculated more precisely
      }));

      const { error: assignmentError } = await supabase
        .from('feedback_cluster_assignments')
        .upsert(assignments);

      if (assignmentError) {
        console.error('[FEEDBACK ANALYTICS DEBUG] Error storing assignments:', assignmentError);
      }
    }
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error in cluster storage:', error);
  }
}

/**
 * Generate a description for a cluster based on its themes
 */
function generateClusterDescription(themes) {
  if (!themes || !themes.topWords || themes.topWords.length === 0) {
    return 'Mixed feedback theme';
  }

  const topWords = themes.topWords.slice(0, 3).map(item => item.word).join(', ');
  const dominantSentiment = Object.entries(themes.avgSentiment)
    .reduce((a, b) => themes.avgSentiment[a[0]] > themes.avgSentiment[b[0]] ? a : b)[0];

  return `${dominantSentiment} feedback about ${topWords}`;
}

/**
 * Calculate average quality for feedback items
 */
function calculateAverageQuality(feedbackItems) {
  if (feedbackItems.length === 0) return 0;
  const total = feedbackItems.reduce((sum, item) => sum + (item.quality_score || 0), 0);
  return total / feedbackItems.length;
}

/**
 * Calculate sentiment distribution for feedback items
 */
function calculateSentimentDistribution(feedbackItems) {
  const distribution = { positive: 0, negative: 0, neutral: 0, unknown: 0 };
  
  feedbackItems.forEach(item => {
    distribution[item.feedback_type] = (distribution[item.feedback_type] || 0) + 1;
  });

  const total = feedbackItems.length;
  Object.keys(distribution).forEach(key => {
    distribution[key] = distribution[key] / total;
  });

  return distribution;
}

/**
 * Get insights for a specific user's feedback patterns
 * @param {string} userId - User ID to analyze
 * @returns {Promise<Object>} - User insights
 */
export async function getUserFeedbackInsights(userId) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ANALYTICS DEBUG] Getting insights for user:', userId);
    }

    const { data, error } = await supabase
      .from('secret_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    const insights = {
      totalFeedback: data.length,
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 0, unknown: 0 },
      averageQuality: 0,
      feedbackFrequency: calculateFeedbackFrequency(data),
      improvementTrend: calculateImprovementTrend(data),
      topIssues: extractTopIssues(data.filter(f => f.feedback_type === 'negative')),
      recentActivity: data.slice(0, 10)
    };

    // Calculate sentiment breakdown
    data.forEach(feedback => {
      insights.sentimentBreakdown[feedback.feedback_type]++;
    });

    // Calculate average quality
    const qualityScores = data.map(f => f.quality_score || 0);
    insights.averageQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length || 0;

    return {
      success: true,
      insights,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[FEEDBACK ANALYTICS DEBUG] Error getting user insights:', error);
    return {
      success: false,
      error: error.message,
      insights: null
    };
  }
}

/**
 * Calculate how frequently a user provides feedback
 */
function calculateFeedbackFrequency(feedbackData) {
  if (feedbackData.length < 2) return 'insufficient_data';

  const timestamps = feedbackData.map(f => new Date(f.timestamp)).sort((a, b) => a - b);
  const intervals = [];

  for (let i = 1; i < timestamps.length; i++) {
    const interval = timestamps[i] - timestamps[i - 1];
    intervals.push(interval / (1000 * 60 * 60 * 24)); // Convert to days
  }

  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

  if (avgInterval < 1) return 'very_frequent'; // Multiple times per day
  if (avgInterval < 7) return 'frequent';      // Multiple times per week
  if (avgInterval < 30) return 'regular';      // Multiple times per month
  return 'occasional';                         // Less frequent
}

/**
 * Calculate if user's feedback quality is improving over time
 */
function calculateImprovementTrend(feedbackData) {
  if (feedbackData.length < 5) return 'insufficient_data';

  const sortedData = feedbackData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const firstHalf = sortedData.slice(0, Math.floor(sortedData.length / 2));
  const secondHalf = sortedData.slice(Math.floor(sortedData.length / 2));

  const firstHalfAvg = firstHalf.reduce((sum, f) => sum + (f.quality_score || 0), 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, f) => sum + (f.quality_score || 0), 0) / secondHalf.length;

  const improvement = secondHalfAvg - firstHalfAvg;

  if (improvement > 10) return 'improving';
  if (improvement < -10) return 'declining';
  return 'stable';
}

/**
 * Extract common issues from negative feedback
 */
function extractTopIssues(negativeFeedback) {
  const issues = {};
  
  negativeFeedback.forEach(feedback => {
    const words = feedback.message.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(word => {
      if (word.length > 3) { // Ignore short words
        issues[word] = (issues[word] || 0) + 1;
      }
    });
  });

  return Object.entries(issues)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word, count]) => ({ issue: word, frequency: count }));
} 