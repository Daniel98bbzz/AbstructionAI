import express from 'express';
import { OpenAI } from 'openai';
import CrowdWisdomManager from '../managers/CrowdWisdomManager.js';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Crowd Wisdom Manager
const crowdWisdomManager = new CrowdWisdomManager(openai);

/**
 * Process a query through the crowd wisdom system
 * POST /api/crowd-wisdom/process-query
 */
router.post('/process-query', async (req, res) => {
  try {
    const { queryText, sessionId, userId } = req.body;

    if (!queryText || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: queryText, sessionId'
      });
    }

    console.log('[CrowdWisdomAPI] Processing query', {
      queryLength: queryText.length,
      sessionId,
      userId: userId || 'anonymous'
    });

    const result = await crowdWisdomManager.processQuery(queryText, sessionId, userId);

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to process query through crowd wisdom system'
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error processing query:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Process feedback through the crowd wisdom system
 * POST /api/crowd-wisdom/process-feedback
 */
router.post('/process-feedback', async (req, res) => {
  try {
    const { assignmentId, feedbackText, responseText, sessionId, userId } = req.body;

    if (!assignmentId || !feedbackText || !responseText || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: assignmentId, feedbackText, responseText, sessionId'
      });
    }

    console.log('[CrowdWisdomAPI] Processing feedback', {
      assignmentId,
      feedbackLength: feedbackText.length,
      responseLength: responseText.length,
      sessionId,
      userId: userId || 'anonymous'
    });

    const result = await crowdWisdomManager.processFeedback(
      assignmentId,
      feedbackText,
      responseText,
      sessionId,
      userId
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error processing feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get crowd wisdom system statistics
 * GET /api/crowd-wisdom/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeframe = '24 hours' } = req.query;

    console.log('[CrowdWisdomAPI] Getting system statistics', {
      timeframe
    });

    const stats = await crowdWisdomManager.getSystemStats(timeframe);

    res.json({
      success: true,
      data: stats,
      timeframe
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cluster information
 * GET /api/crowd-wisdom/clusters
 */
router.get('/clusters', async (req, res) => {
  try {
    console.log('[CrowdWisdomAPI] Fetching clusters');
    
    const { data: clusters, error } = await supabase
      .from('crowd_wisdom_clusters')
      .select('*')
      .order('total_queries', { ascending: false });

    if (error) {
      console.error('[CrowdWisdomAPI] Error fetching clusters:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    console.log('[CrowdWisdomAPI] Fetched', clusters?.length || 0, 'clusters');
    
    res.json({ 
      success: true, 
      data: clusters || [],
      count: clusters?.length || 0
    });
    
  } catch (error) {
    console.error('[CrowdWisdomAPI] Server error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get specific cluster details
 * GET /api/crowd-wisdom/clusters/:clusterId
 */
router.get('/clusters/:clusterId', async (req, res) => {
  try {
    const { clusterId } = req.params;

    console.log('[CrowdWisdomAPI] Getting cluster details', {
      clusterId
    });

    // Get cluster info
    const { data: cluster, error: clusterError } = await supabase
      .from('crowd_wisdom_clusters')
      .select('*')
      .eq('id', clusterId)
      .single();

    if (clusterError) {
      if (clusterError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Cluster not found'
        });
      }
      throw clusterError;
    }

    // Get recent queries for this cluster
    const { data: recentQueries, error: queriesError } = await supabase
      .from('crowd_wisdom_query_assignments')
      .select('id, query_text, similarity_score, user_feedback_positive, created_at')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (queriesError) {
      console.warn('[CrowdWisdomAPI] Failed to get recent queries:', queriesError);
    }

    // Get learning logs for this cluster
    const { data: learningLogs, error: logsError } = await supabase
      .from('crowd_wisdom_learning_logs')
      .select('id, extracted_patterns, prompt_update, confidence_score, created_at')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (logsError) {
      console.warn('[CrowdWisdomAPI] Failed to get learning logs:', logsError);
    }

    const clusterDetails = {
      id: cluster.id,
      name: cluster.cluster_name,
      representativeQuery: cluster.representative_query,
      promptEnhancement: cluster.prompt_enhancement,
      totalQueries: cluster.total_queries,
      successCount: cluster.success_count,
      successRate: cluster.success_rate,
      lastSuccessAt: cluster.last_success_at,
      createdAt: cluster.created_at,
      updatedAt: cluster.updated_at,
      recentQueries: recentQueries || [],
      learningLogs: learningLogs || []
    };

    res.json({
      success: true,
      data: clusterDetails
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error getting cluster details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get system logs
 * GET /api/crowd-wisdom/logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { 
      component,
      level,
      limit = 100,
      timeframe = '24 hours'
    } = req.query;

    console.log('[CrowdWisdomAPI] Getting system logs', {
      component,
      level,
      limit,
      timeframe
    });

    let query = supabase
      .from('crowd_wisdom_system_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (component) {
      query = query.eq('component', component);
    }

    if (level) {
      query = query.eq('log_level', level);
    }

    const { data: logs, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: logs,
      total: logs.length,
      filters: { component, level, timeframe }
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get learning events
 * GET /api/crowd-wisdom/learning-events
 */
router.get('/learning-events', async (req, res) => {
  try {
    const { 
      clusterId,
      limit = 50,
      timeframe = '7 days'
    } = req.query;

    console.log('[CrowdWisdomAPI] Getting learning events', {
      clusterId,
      limit,
      timeframe
    });

    let query = supabase
      .from('crowd_wisdom_learning_logs')
      .select(`
        *,
        crowd_wisdom_clusters!inner(cluster_name, representative_query),
        crowd_wisdom_query_assignments!inner(query_text)
      `)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (clusterId) {
      query = query.eq('cluster_id', clusterId);
    }

    const { data: events, error } = await query;

    if (error) {
      throw error;
    }

    const transformedEvents = events.map(event => ({
      id: event.id,
      clusterId: event.cluster_id,
      clusterName: event.crowd_wisdom_clusters?.cluster_name,
      queryText: event.crowd_wisdom_query_assignments?.query_text,
      extractedPatterns: event.extracted_patterns,
      promptUpdate: event.prompt_update,
      confidenceScore: event.confidence_score,
      learningTrigger: event.learning_trigger,
      createdAt: event.created_at
    }));

    res.json({
      success: true,
      data: transformedEvents,
      total: events.length,
      filters: { clusterId, timeframe }
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error getting learning events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check endpoint
 * GET /api/crowd-wisdom/health
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    const { data, error } = await supabase
      .from('crowd_wisdom_clusters')
      .select('count(*)')
      .single();

    if (error) {
      throw error;
    }

    // Check OpenAI connectivity (simple test)
    const testResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1
    });

    res.json({
      success: true,
      status: 'healthy',
      checks: {
        database: 'connected',
        openai: 'connected',
        crowdWisdomManager: 'initialized'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get recent assignments
 * GET /api/crowd-wisdom/assignments
 */
router.get('/assignments', async (req, res) => {
  try {
    console.log('[CrowdWisdomAPI] Fetching recent assignments');
    
    const { data: assignments, error } = await supabase
      .from('crowd_wisdom_query_assignments')
      .select(`
        *,
        crowd_wisdom_clusters!inner(cluster_name)
      `)
      .order('created_at', { ascending: false })
      .limit(req.query.limit || 10);

    if (error) {
      console.error('[CrowdWisdomAPI] Error fetching assignments:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    console.log('[CrowdWisdomAPI] Fetched', assignments?.length || 0, 'assignments');
    
    res.json({ 
      success: true, 
      data: assignments || [],
      count: assignments?.length || 0
    });
    
  } catch (error) {
    console.error('[CrowdWisdomAPI] Server error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get system statistics
 * GET /api/crowd-wisdom/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const [clustersResult, assignmentsResult, learningResult] = await Promise.all([
      supabase.from('crowd_wisdom_clusters').select('*'),
      supabase.from('crowd_wisdom_query_assignments').select('id'),
      supabase.from('crowd_wisdom_learning_logs').select('id')
    ]);

    const clusters = clustersResult.data || [];
    const totalQueries = clusters.reduce((sum, c) => sum + (c.total_queries || 0), 0);
    const enhancedClusters = clusters.filter(c => c.prompt_enhancement && c.prompt_enhancement.length > 0).length;

    res.json({
      success: true,
      data: {
        totalClusters: clusters.length,
        totalQueries,
        enhancedClusters,
        totalAssignments: assignmentsResult.data?.length || 0,
        totalLearningEvents: learningResult.data?.length || 0
      }
    });

  } catch (error) {
    console.error('[CrowdWisdomAPI] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 