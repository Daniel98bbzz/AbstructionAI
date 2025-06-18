import express from 'express';
import { 
  analyzeFeedbackTrends, 
  getQualityDistribution, 
  generateFeedbackThemes, 
  getUserFeedbackInsights 
} from '../utils/feedbackAnalytics.js';
import { processUserMessage } from '../utils/secretFeedbackClassifier.js';

const router = express.Router();

/**
 * Process user feedback message
 * POST /api/feedback/process
 */
router.post('/process', async (req, res) => {
  try {
    const { userId, message, conversationId, metadata } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId and message'
      });
    }

    const result = await processUserMessage(userId, message, conversationId, metadata);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[FEEDBACK API] Error processing feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error processing feedback'
    });
  }
});

/**
 * Get feedback trends over time
 * GET /api/feedback/trends?timeframe=week&limit=30
 */
router.get('/trends', async (req, res) => {
  try {
    const { timeframe = 'week', limit = 30 } = req.query;
    
    const result = await analyzeFeedbackTrends(timeframe, parseInt(limit));
    
    res.json(result);
  } catch (error) {
    console.error('[FEEDBACK API] Error getting trends:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error getting trends'
    });
  }
});

/**
 * Get quality distribution analysis
 * GET /api/feedback/quality?userId=optional
 */
router.get('/quality', async (req, res) => {
  try {
    const { userId } = req.query;
    
    const result = await getQualityDistribution(userId);
    
    res.json(result);
  } catch (error) {
    console.error('[FEEDBACK API] Error getting quality distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error getting quality distribution'
    });
  }
});

/**
 * Generate feedback themes using clustering
 * POST /api/feedback/themes
 */
router.post('/themes', async (req, res) => {
  try {
    const { numClusters = 5, minQuality = 20 } = req.body;
    
    const result = await generateFeedbackThemes(numClusters, minQuality);
    
    res.json(result);
  } catch (error) {
    console.error('[FEEDBACK API] Error generating themes:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error generating themes'
    });
  }
});

/**
 * Get user-specific feedback insights
 * GET /api/feedback/insights/:userId
 */
router.get('/insights/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }
    
    const result = await getUserFeedbackInsights(userId);
    
    res.json(result);
  } catch (error) {
    console.error('[FEEDBACK API] Error getting user insights:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error getting user insights'
    });
  }
});

/**
 * Get feedback summary for admin dashboard
 * GET /api/feedback/summary
 */
router.get('/summary', async (req, res) => {
  try {
    // Get multiple analytics in parallel
    const [trends, quality, themes] = await Promise.all([
      analyzeFeedbackTrends('week', 7),
      getQualityDistribution(),
      generateFeedbackThemes(3, 30) // Fewer clusters for summary
    ]);

    res.json({
      success: true,
      data: {
        weeklyTrends: trends,
        qualityDistribution: quality,
        topThemes: themes.themes || [],
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[FEEDBACK API] Error getting summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error getting summary'
    });
  }
});

export default router; 