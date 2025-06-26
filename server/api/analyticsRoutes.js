import express from 'express';
import { supabase } from '../lib/supabaseClient.js';

const router = express.Router();

// Simple in-memory cache for analytics data
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCacheKey(endpoint, query) {
  return `${endpoint}_${JSON.stringify(query)}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Helper function to build time filter condition
function buildTimeFilter(timeframe, startDate, endDate) {
  const now = new Date();
  let condition = '';
  
  switch (timeframe) {
    case '1d':
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      condition = `created_at >= '${yesterday.toISOString()}'`;
      break;
    case '7d':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      condition = `created_at >= '${weekAgo.toISOString()}'`;
      break;
    case '30d':
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      condition = `created_at >= '${monthAgo.toISOString()}'`;
      break;
    case '90d':
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      condition = `created_at >= '${quarterAgo.toISOString()}'`;
      break;
    case 'custom':
      if (startDate && endDate) {
        condition = `created_at >= '${startDate}T00:00:00.000Z' AND created_at <= '${endDate}T23:59:59.999Z'`;
      }
      break;
    default:
      const defaultWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      condition = `created_at >= '${defaultWeekAgo.toISOString()}'`;
  }
  
  return condition;
}

// Helper function to build user segment filter
function buildUserSegmentFilter(userSegment) {
  const now = new Date();
  
  switch (userSegment) {
    case 'new':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return `created_at >= '${weekAgo.toISOString()}'`;
    case 'active':
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return `last_active >= '${monthAgo.toISOString()}'`;
    case 'returning':
      return `session_count > 1`;
    default:
      return '';
  }
}

// System-wide analytics routes
router.get('/topics/popularity', async (req, res) => {
  try {
    const { timeframe = '7d', startDate, endDate, userSegment = 'all', topicFilter, minSessions = 1 } = req.query;
    
    // Check cache first
    const cacheKey = getCacheKey('topics_popularity', req.query);
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log('[Analytics] Returning cached topic popularity data');
      return res.json(cachedResult);
    }
    
    console.log('[Analytics] Fetching topic popularity with filters:', req.query);
    
    let query = supabase
      .from('queries')
      .select('*');
    
    // Apply time filter
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter) {
      query = query.or(timeFilter);
    }
    
    const { data: queries, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching queries:', error);
      return res.status(500).json({ error: 'Failed to fetch queries' });
    }
    
    // Apply user segment filter if needed
    let filteredQueries = queries;
    if (userSegment !== 'all') {
      // Get users matching the segment
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id')
          .or(userFilter);
        
        const userIds = users?.map(u => u.user_id) || [];
        filteredQueries = queries.filter(q => userIds.includes(q.user_id));
      }
    }
    
    // Count sessions by topic
    const topicCounts = {};
    const sessionTopics = {};
    
    filteredQueries.forEach(query => {
      if (query.discovered_topic) {
        const topic = query.discovered_topic;
        
        // Apply topic filter
        if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
          return;
        }
        
        if (!topicCounts[topic]) {
          topicCounts[topic] = 0;
        }
        
        if (!sessionTopics[query.session_id]) {
          sessionTopics[query.session_id] = new Set();
        }
        
        if (!sessionTopics[query.session_id].has(topic)) {
          topicCounts[topic]++;
          sessionTopics[query.session_id].add(topic);
        }
      }
    });
    
    // Apply minimum sessions filter
    const filteredTopics = Object.entries(topicCounts)
      .filter(([topic, count]) => count >= parseInt(minSessions))
      .sort((a, b) => b[1] - a[1]);
    
    const totalSessions = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
    
    const popularTopics = filteredTopics.map(([topic, count]) => ({
      topic_name: topic,
      session_count: count,
      percentage: totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : '0'
    }));
    
    const result = {
      popular_topics: popularTopics,
      total_sessions: totalSessions,
      unique_topics: popularTopics.length,
      period: timeframe === 'custom' ? `${startDate} to ${endDate}` : `Last ${timeframe}`
    };
    
    // Cache the result
    setCache(cacheKey, result);
    
    res.json(result);
    
  } catch (error) {
    console.error('[Analytics] Error in topic popularity endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics/timeline', async (req, res) => {
  try {
    const { timeframe = '7d', startDate, endDate, userSegment = 'all', topicFilter } = req.query;
    
    console.log('[Analytics] Fetching topic timeline with filters:', req.query);
    
    let query = supabase
      .from('queries')
      .select('*');
    
    // Apply time filter
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter) {
      query = query.or(timeFilter);
    }
    
    const { data: queries, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching queries:', error);
      return res.status(500).json({ error: 'Failed to fetch queries' });
    }
    
    // Apply user segment filter if needed
    let filteredQueries = queries;
    if (userSegment !== 'all') {
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id')
          .or(userFilter);
        
        const userIds = users?.map(u => u.user_id) || [];
        filteredQueries = queries.filter(q => userIds.includes(q.user_id));
      }
    }
    
    // Group by date and topic
    const timelineData = {};
    const sessionTopics = {};
    
    filteredQueries.forEach(query => {
      if (query.discovered_topic) {
        const topic = query.discovered_topic;
        
        // Apply topic filter
        if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
          return;
        }
        
        const date = new Date(query.created_at).toISOString().split('T')[0];
        
        if (!timelineData[date]) {
          timelineData[date] = {};
        }
        
        if (!timelineData[date][topic]) {
          timelineData[date][topic] = 0;
        }
        
        const sessionKey = `${query.session_id}-${topic}`;
        if (!sessionTopics[sessionKey]) {
          timelineData[date][topic]++;
          sessionTopics[sessionKey] = true;
        }
      }
    });
    
    res.json({
      timeline_data: timelineData,
      period: timeframe === 'custom' ? `${startDate} to ${endDate}` : `Last ${timeframe}`
    });
    
  } catch (error) {
    console.error('[Analytics] Error in topic timeline endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/engagement', async (req, res) => {
  try {
    const { timeframe = '7d', startDate, endDate, userSegment = 'all' } = req.query;
    
    console.log('[Analytics] Fetching user engagement with filters:', req.query);
    
    let query = supabase
      .from('user_profiles')
      .select('*');
    
    // Apply user segment filter
    if (userSegment !== 'all') {
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        query = query.or(userFilter);
      }
    }
    
    const { data: profiles, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching user profiles:', error);
      return res.status(500).json({ error: 'Failed to fetch user profiles' });
    }
    
    // Get session counts for time period
    let sessionQuery = supabase
      .from('sessions')
      .select('user_id');
    
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter) {
      sessionQuery = sessionQuery.or(timeFilter);
    }
    
    const { data: sessions } = await sessionQuery;
    
    // Calculate engagement levels
    const userEngagement = {};
    const sessionCounts = {};
    
    sessions?.forEach(session => {
      sessionCounts[session.user_id] = (sessionCounts[session.user_id] || 0) + 1;
    });
    
    profiles?.forEach(profile => {
      const sessionCount = sessionCounts[profile.user_id] || 0;
      let level;
      
      if (sessionCount === 0) level = 'Inactive';
      else if (sessionCount <= 2) level = 'Low';
      else if (sessionCount <= 5) level = 'Medium';
      else if (sessionCount <= 10) level = 'High';
      else level = 'Very High';
      
      userEngagement[level] = (userEngagement[level] || 0) + 1;
    });
    
    const totalUsers = profiles?.length || 0;
    const totalSessions = sessions?.length || 0;
    const avgSessionsPerUser = totalUsers > 0 ? (totalSessions / totalUsers).toFixed(1) : '0';
    
    res.json({
      engagement_distribution: userEngagement,
      total_users: totalUsers,
      total_sessions: totalSessions,
      avg_sessions_per_user: avgSessionsPerUser
    });
    
  } catch (error) {
    console.error('[Analytics] Error in user engagement endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics/trends', async (req, res) => {
  try {
    const { timeframe = '7d', topicFilter, minSessions = 1 } = req.query;
    
    console.log('[Analytics] Fetching topic trends with filters:', req.query);
    
    const now = new Date();
    let recentStart, previousStart, previousEnd;
    
    switch (timeframe) {
      case '1d':
        recentStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        previousEnd = recentStart;
        break;
      case '7d':
        recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        previousEnd = recentStart;
        break;
      case '30d':
        recentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        previousEnd = recentStart;
        break;
      default:
        recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        previousEnd = recentStart;
    }
    
    const [recentQueries, previousQueries] = await Promise.all([
      supabase
        .from('queries')
        .select('*')
        .gte('created_at', recentStart.toISOString()),
      supabase
        .from('queries')
        .select('*')
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', previousEnd.toISOString())
    ]);
    
    // Count sessions by topic for both periods
    const countTopicSessions = (queries) => {
      const topicCounts = {};
      const sessionTopics = {};
      
      queries.data?.forEach(query => {
        if (query.discovered_topic) {
          const topic = query.discovered_topic;
          
          // Apply topic filter
          if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
            return;
          }
          
          if (!topicCounts[topic]) {
            topicCounts[topic] = 0;
          }
          
          if (!sessionTopics[query.session_id]) {
            sessionTopics[query.session_id] = new Set();
          }
          
          if (!sessionTopics[query.session_id].has(topic)) {
            topicCounts[topic]++;
            sessionTopics[query.session_id].add(topic);
          }
        }
      });
      
      return topicCounts;
    };
    
    const recentCounts = countTopicSessions(recentQueries);
    const previousCounts = countTopicSessions(previousQueries);
    
    // Calculate trends
    const allTopics = new Set([...Object.keys(recentCounts), ...Object.keys(previousCounts)]);
    const trends = [];
    
    allTopics.forEach(topic => {
      const recentSessions = recentCounts[topic] || 0;
      const previousSessions = previousCounts[topic] || 0;
      
      // Apply minimum sessions filter
      if (recentSessions < parseInt(minSessions) && previousSessions < parseInt(minSessions)) {
        return;
      }
      
      let growthPercentage;
      let trend;
      
      if (previousSessions === 0) {
        growthPercentage = recentSessions > 0 ? 'New' : '0';
        trend = recentSessions > 0 ? 'up' : 'stable';
      } else {
        growthPercentage = (((recentSessions - previousSessions) / previousSessions) * 100).toFixed(1);
        trend = recentSessions > previousSessions ? 'up' : 
               recentSessions < previousSessions ? 'down' : 'stable';
      }
      
      trends.push({
        topic_name: topic,
        recent_sessions: recentSessions,
        previous_sessions: previousSessions,
        growth_percentage: growthPercentage,
        trend: trend
      });
    });
    
    // Sort by recent sessions
    trends.sort((a, b) => b.recent_sessions - a.recent_sessions);
    
    res.json({
      trends: trends,
      period: `Comparing last ${timeframe} vs previous ${timeframe}`
    });
    
  } catch (error) {
    console.error('[Analytics] Error in topic trends endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/clusters/distribution', async (req, res) => {
  try {
    const { userSegment = 'all' } = req.query;
    
    console.log('[Analytics] Fetching cluster distribution with filters:', req.query);
    
    let query = supabase
      .from('user_profiles')
      .select('*');
    
    // Apply user segment filter
    if (userSegment !== 'all') {
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        query = query.or(userFilter);
      }
    }
    
    const { data: profiles, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching user profiles:', error);
      return res.status(500).json({ error: 'Failed to fetch user profiles' });
    }
    
    // Count users by cluster
    const clusterCounts = {};
    profiles?.forEach(profile => {
      const clusterId = profile.cluster_id || 'unassigned';
      clusterCounts[clusterId] = (clusterCounts[clusterId] || 0) + 1;
    });
    
    const clusterStats = Object.entries(clusterCounts)
      .map(([clusterId, count]) => ({
        cluster_id: clusterId,
        user_count: count,
        percentage: ((count / profiles.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.user_count - a.user_count);
    
    res.json({
      cluster_distribution: clusterStats,
      total_clusters: Object.keys(clusterCounts).length,
      total_users: profiles?.length || 0
    });
    
  } catch (error) {
    console.error('[Analytics] Error in cluster distribution endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User-specific analytics routes
router.get('/self/topics/popularity', async (req, res) => {
  try {
    const userId = req.user?.id || req.headers['user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }
    
    const { timeframe = '7d', startDate, endDate, topicFilter, minSessions = 1 } = req.query;
    
    console.log(`[Analytics] Fetching user ${userId} topic popularity with filters:`, req.query);
    
    let query = supabase
      .from('queries')
      .select('*')
      .eq('user_id', userId);
    
    // Apply time filter
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter) {
      query = query.or(timeFilter);
    }
    
    const { data: queries, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching user queries:', error);
      return res.status(500).json({ error: 'Failed to fetch user queries' });
    }
    
    // Count sessions by topic
    const topicCounts = {};
    const sessionTopics = {};
    
    queries?.forEach(query => {
      if (query.discovered_topic) {
        const topic = query.discovered_topic;
        
        // Apply topic filter
        if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
          return;
        }
        
        if (!topicCounts[topic]) {
          topicCounts[topic] = 0;
        }
        
        if (!sessionTopics[query.session_id]) {
          sessionTopics[query.session_id] = new Set();
        }
        
        if (!sessionTopics[query.session_id].has(topic)) {
          topicCounts[topic]++;
          sessionTopics[query.session_id].add(topic);
        }
      }
    });
    
    // Apply minimum sessions filter
    const filteredTopics = Object.entries(topicCounts)
      .filter(([topic, count]) => count >= parseInt(minSessions))
      .sort((a, b) => b[1] - a[1]);
    
    const totalSessions = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
    
    const popularTopics = filteredTopics.map(([topic, count]) => ({
      topic_name: topic,
      session_count: count,
      percentage: totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : '0'
    }));
    
    res.json({
      popular_topics: popularTopics,
      total_sessions: totalSessions,
      unique_topics: popularTopics.length,
      period: timeframe === 'custom' ? `${startDate} to ${endDate}` : `Last ${timeframe}`
    });
    
  } catch (error) {
    console.error('[Analytics] Error in user topic popularity endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Additional user-specific routes would follow similar patterns...
router.get('/self/topics/timeline', async (req, res) => {
  // Similar implementation but filtered by user_id
  // Implementation would be similar to the system timeline but with user_id filter
  res.json({ message: 'User timeline endpoint - implementation needed' });
});

router.get('/self/users/engagement', async (req, res) => {
  // User's personal engagement metrics
  res.json({ message: 'User engagement endpoint - implementation needed' });
});

router.get('/self/topics/trends', async (req, res) => {
  // User's personal topic trends
  res.json({ message: 'User trends endpoint - implementation needed' });
});

router.get('/self/clusters/distribution', async (req, res) => {
  // User's cluster information
  res.json({ message: 'User cluster endpoint - implementation needed' });
});

export default router; 