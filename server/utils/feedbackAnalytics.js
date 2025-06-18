import { supabase } from '../lib/supabaseClient.js';
import { generateFeedbackEmbedding, calculateCosineSimilarity, clusterFeedbackEmbeddings } from './feedbackEnhancements.js';

/**
 * Analyze feedback trends over time
 * @param {string} timeframe - 'day', 'week', 'month'
 * @param {number} limit - Number of data points to return
 * @returns {Object} Trend analysis results
 */
export async function analyzeFeedbackTrends(timeframe = 'week', limit = 30) {
  try {
    const timeframeDays = {
      'day': 1,
      'week': 7,
      'month': 30
    };

    const days = timeframeDays[timeframe] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days * limit));

    const { data: feedbacks, error } = await supabase
      .from('feedbacks')
      .select(`
        id,
        created_at,
        quality_score,
        sentiment_score,
        feedback_type,
        secret_feedback_data
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by time intervals
    const trends = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= new Date()) {
      const intervalStart = new Date(currentDate);
      const intervalEnd = new Date(currentDate);
      intervalEnd.setDate(intervalEnd.getDate() + days);

      const intervalFeedbacks = feedbacks.filter(f => {
        const feedbackDate = new Date(f.created_at);
        return feedbackDate >= intervalStart && feedbackDate < intervalEnd;
      });

      trends.push({
        period: intervalStart.toISOString().split('T')[0],
        count: intervalFeedbacks.length,
        avgQuality: intervalFeedbacks.length > 0 
          ? intervalFeedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / intervalFeedbacks.length 
          : 0,
        avgSentiment: intervalFeedbacks.length > 0 
          ? intervalFeedbacks.reduce((sum, f) => sum + (f.sentiment_score || 0), 0) / intervalFeedbacks.length 
          : 0,
        types: intervalFeedbacks.reduce((acc, f) => {
          acc[f.feedback_type] = (acc[f.feedback_type] || 0) + 1;
          return acc;
        }, {})
      });

      currentDate.setDate(currentDate.getDate() + days);
    }

    return {
      success: true,
      timeframe,
      trends,
      totalFeedbacks: feedbacks.length,
      dateRange: {
        start: startDate.toISOString(),
        end: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('[FEEDBACK ANALYTICS] Error analyzing trends:', error);
    return {
      success: false,
      error: error.message,
      trends: []
    };
  }
}

/**
 * Get quality score distribution
 * @param {string} userId - Optional user ID filter
 * @returns {Object} Quality distribution data
 */
export async function getQualityDistribution(userId = null) {
  try {
    let query = supabase
      .from('feedbacks')
      .select('quality_score, feedback_type, created_at');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: feedbacks, error } = await query;
    if (error) throw error;

    // Create quality score buckets
    const buckets = {
      'excellent': { min: 80, max: 100, count: 0, percentage: 0 },
      'good': { min: 60, max: 79, count: 0, percentage: 0 },
      'average': { min: 40, max: 59, count: 0, percentage: 0 },
      'poor': { min: 20, max: 39, count: 0, percentage: 0 },
      'very_poor': { min: 0, max: 19, count: 0, percentage: 0 }
    };

    const total = feedbacks.length;
    
    feedbacks.forEach(feedback => {
      const score = feedback.quality_score || 0;
      
      if (score >= 80) buckets.excellent.count++;
      else if (score >= 60) buckets.good.count++;
      else if (score >= 40) buckets.average.count++;
      else if (score >= 20) buckets.poor.count++;
      else buckets.very_poor.count++;
    });

    // Calculate percentages
    Object.keys(buckets).forEach(key => {
      buckets[key].percentage = total > 0 ? (buckets[key].count / total) * 100 : 0;
    });

    return {
      success: true,
      distribution: buckets,
      totalFeedbacks: total,
      averageQuality: total > 0 
        ? feedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / total 
        : 0,
      userId: userId || 'all'
    };

  } catch (error) {
    console.error('[FEEDBACK ANALYTICS] Error getting quality distribution:', error);
    return {
      success: false,
      error: error.message,
      distribution: {}
    };
  }
}

/**
 * Generate feedback themes using clustering
 * @param {number} numClusters - Number of clusters to create
 * @param {number} minQuality - Minimum quality score to include
 * @returns {Object} Themed clusters of feedback
 */
export async function generateFeedbackThemes(numClusters = 5, minQuality = 20) {
  try {
    const { data: feedbacks, error } = await supabase
      .from('feedbacks')
      .select('id, content, quality_score, feedback_type, sentiment_score, embedding')
      .gte('quality_score', minQuality)
      .not('content', 'is', null)
      .limit(1000); // Limit for performance

    if (error) throw error;

    if (feedbacks.length < numClusters) {
      return {
        success: true,
        themes: [],
        message: `Not enough feedback entries (${feedbacks.length}) to create ${numClusters} clusters`
      };
    }

    // Generate embeddings for feedbacks without them
    const feedbacksWithEmbeddings = await Promise.all(
      feedbacks.map(async (feedback) => {
        if (!feedback.embedding && feedback.content) {
          try {
            const embedding = await generateFeedbackEmbedding(feedback.content);
            
            // Update the database with the new embedding
            await supabase
              .from('feedbacks')
              .update({ embedding })
              .eq('id', feedback.id);
            
            return { ...feedback, embedding };
          } catch (embError) {
            console.warn(`Failed to generate embedding for feedback ${feedback.id}:`, embError);
            return feedback;
          }
        }
        return feedback;
      })
    );

    // Filter out feedbacks without embeddings
    const validFeedbacks = feedbacksWithEmbeddings.filter(f => f.embedding && f.embedding.length > 0);

    if (validFeedbacks.length < numClusters) {
      return {
        success: true,
        themes: [],
        message: `Not enough valid embeddings (${validFeedbacks.length}) to create ${numClusters} clusters`
      };
    }

    // Perform clustering
    const clusters = await clusterFeedbackEmbeddings(
      validFeedbacks.map(f => ({
        id: f.id,
        embedding: f.embedding,
        content: f.content,
        quality_score: f.quality_score
      })),
      numClusters
    );

    // Generate themes for each cluster
    const themes = clusters.map((cluster, index) => {
      const clusterFeedbacks = cluster.map(item => 
        validFeedbacks.find(f => f.id === item.id)
      ).filter(Boolean);

      // Extract common keywords/themes
      const allContent = clusterFeedbacks.map(f => f.content).join(' ');
      const words = allContent.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);

      const wordCounts = words.reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {});

      const topWords = Object.entries(wordCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word);

      return {
        id: index + 1,
        size: clusterFeedbacks.length,
        keywords: topWords,
        avgQuality: clusterFeedbacks.reduce((sum, f) => sum + f.quality_score, 0) / clusterFeedbacks.length,
        avgSentiment: clusterFeedbacks.reduce((sum, f) => sum + (f.sentiment_score || 0), 0) / clusterFeedbacks.length,
        sampleFeedbacks: clusterFeedbacks.slice(0, 3).map(f => ({
          id: f.id,
          content: f.content.substring(0, 150) + (f.content.length > 150 ? '...' : ''),
          quality_score: f.quality_score
        }))
      };
    });

    return {
      success: true,
      themes,
      totalAnalyzed: validFeedbacks.length,
      clustersGenerated: clusters.length,
      parameters: { numClusters, minQuality }
    };

  } catch (error) {
    console.error('[FEEDBACK ANALYTICS] Error generating themes:', error);
    return {
      success: false,
      error: error.message,
      themes: []
    };
  }
}

/**
 * Get user-specific feedback insights
 * @param {string} userId - User ID to analyze
 * @returns {Object} User feedback insights
 */
export async function getUserFeedbackInsights(userId) {
  try {
    const { data: userFeedbacks, error } = await supabase
      .from('feedbacks')
      .select(`
        id,
        content,
        quality_score,
        sentiment_score,
        feedback_type,
        created_at,
        secret_feedback_data
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (userFeedbacks.length === 0) {
      return {
        success: true,
        userId,
        insights: {
          totalFeedbacks: 0,
          message: 'No feedback found for this user'
        }
      };
    }

    // Calculate insights
    const totalFeedbacks = userFeedbacks.length;
    const avgQuality = userFeedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / totalFeedbacks;
    const avgSentiment = userFeedbacks.reduce((sum, f) => sum + (f.sentiment_score || 0), 0) / totalFeedbacks;

    // Feedback type distribution
    const typeDistribution = userFeedbacks.reduce((acc, f) => {
      acc[f.feedback_type] = (acc[f.feedback_type] || 0) + 1;
      return acc;
    }, {});

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentFeedbacks = userFeedbacks.filter(f => 
      new Date(f.created_at) >= thirtyDaysAgo
    );

    // Quality trend (comparing first half vs second half of feedback history)
    const midpoint = Math.floor(totalFeedbacks / 2);
    const earlierFeedbacks = userFeedbacks.slice(midpoint);
    const laterFeedbacks = userFeedbacks.slice(0, midpoint);

    const earlierAvgQuality = earlierFeedbacks.length > 0 
      ? earlierFeedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / earlierFeedbacks.length 
      : 0;
    const laterAvgQuality = laterFeedbacks.length > 0 
      ? laterFeedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / laterFeedbacks.length 
      : 0;

    const qualityTrend = laterAvgQuality - earlierAvgQuality;

    return {
      success: true,
      userId,
      insights: {
        totalFeedbacks,
        avgQuality: Math.round(avgQuality * 100) / 100,
        avgSentiment: Math.round(avgSentiment * 100) / 100,
        typeDistribution,
        recentActivity: {
          feedbacksLast30Days: recentFeedbacks.length,
          avgQualityLast30Days: recentFeedbacks.length > 0 
            ? Math.round((recentFeedbacks.reduce((sum, f) => sum + (f.quality_score || 0), 0) / recentFeedbacks.length) * 100) / 100
            : 0
        },
        qualityTrend: {
          direction: qualityTrend > 5 ? 'improving' : qualityTrend < -5 ? 'declining' : 'stable',
          change: Math.round(qualityTrend * 100) / 100
        },
        topFeedbacks: userFeedbacks
          .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
          .slice(0, 5)
          .map(f => ({
            id: f.id,
            content: f.content ? f.content.substring(0, 100) + (f.content.length > 100 ? '...' : '') : '',
            quality_score: f.quality_score,
            created_at: f.created_at
          }))
      }
    };

  } catch (error) {
    console.error('[FEEDBACK ANALYTICS] Error getting user insights:', error);
    return {
      success: false,
      error: error.message,
      userId,
      insights: {}
    };
  }
} 