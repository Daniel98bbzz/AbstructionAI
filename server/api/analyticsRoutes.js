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
  
  switch (timeframe) {
    case '1d':
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startDate: yesterday.toISOString() };
    case '7d':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: weekAgo.toISOString() };
    case '30d':
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: monthAgo.toISOString() };
    case '90d':
      const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { startDate: quarterAgo.toISOString() };
    case 'custom':
      if (startDate && endDate) {
        return { 
          startDate: `${startDate}T00:00:00.000Z`,
          endDate: `${endDate}T23:59:59.999Z`
        };
      }
      break;
    case 'all':
      return { allTime: true }; // Special flag for no time filter
    default:
      const defaultWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: defaultWeekAgo.toISOString() };
  }
  
  return null;
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
      .from('sessions')
      .select('*')
      .not('secret_topic', 'is', null);
    
    // Apply time filter
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter && !timeFilter.allTime) {
      query = query.gte('created_at', timeFilter.startDate);
      if (timeFilter.endDate) {
        query = query.lte('created_at', timeFilter.endDate);
      }
    }
    
    const { data: sessions, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching sessions:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }
    
    // Apply user segment filter if needed
    let filteredSessions = sessions;
    if (userSegment !== 'all') {
      // Get users matching the segment
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id')
          .or(userFilter);
        
        const userIds = users?.map(u => u.user_id) || [];
        filteredSessions = sessions.filter(s => userIds.includes(s.user_id));
      }
    }
    
    // Count sessions by topic using secret_topic
    const topicCounts = {};
    
    filteredSessions.forEach(session => {
      if (session.secret_topic) {
        const topic = session.secret_topic;
        
        // Apply topic filter
        if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
          return;
        }
        
        if (!topicCounts[topic]) {
          topicCounts[topic] = 0;
        }
        topicCounts[topic]++;
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
    
    // Check cache first
    const cacheKey = getCacheKey('topics_timeline', req.query);
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log('[Analytics] Returning cached timeline data');
      return res.json(cachedResult);
    }
    
    console.log('[Analytics] Fetching topic timeline with filters:', req.query);
    
    // Use sessions table which has the secret_topic data
    let query = supabase
      .from('sessions')
      .select('secret_topic, created_at, user_id')
      .not('secret_topic', 'is', null);
    
    // Apply time filter
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter && !timeFilter.allTime) {
      query = query.gte('created_at', timeFilter.startDate);
      if (timeFilter.endDate) {
        query = query.lte('created_at', timeFilter.endDate);
      }
    }
    
    const { data: sessions, error } = await query;
    
    if (error) {
      console.error('[Analytics] Error fetching sessions:', error);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }
    
    console.log(`[Analytics Timeline Debug] Found ${sessions?.length || 0} sessions`);
    if (sessions && sessions.length > 0) {
      console.log(`[Analytics Timeline Debug] Sample session:`, sessions[0]);
    }
    
    // Apply user segment filter if needed
    let filteredSessions = sessions;
    if (userSegment !== 'all') {
      const userFilter = buildUserSegmentFilter(userSegment);
      if (userFilter) {
        const { data: users } = await supabase
          .from('user_profiles')
          .select('user_id')
          .or(userFilter);
        
        const userIds = users?.map(u => u.user_id) || [];
        filteredSessions = sessions.filter(s => userIds.includes(s.user_id));
      }
    }
    
    // Group by date and topic
    const timelineData = {};
    
    filteredSessions.forEach(session => {
      if (session.secret_topic) {
        const topic = session.secret_topic;
        
        // Apply topic filter
        if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
          return;
        }
        
        const date = new Date(session.created_at).toISOString().split('T')[0];
        
        if (!timelineData[date]) {
          timelineData[date] = {};
        }
        
        if (!timelineData[date][topic]) {
          timelineData[date][topic] = 0;
        }
        
        timelineData[date][topic]++;
      }
    });
    
    const result = {
      timeline_data: timelineData,
      period: timeframe === 'custom' ? `${startDate} to ${endDate}` : `Last ${timeframe}`,
      total_sessions: filteredSessions.length,
      // Debug info
      debug: {
        sessions_found: sessions?.length || 0,
        filtered_sessions: filteredSessions?.length || 0,
        sample_session: sessions?.length > 0 ? {
          secret_topic: sessions[0].secret_topic,
          created_at: sessions[0].created_at,
          date_extracted: new Date(sessions[0].created_at).toISOString().split('T')[0]
        } : null,
        timeframe_used: timeframe,
        time_filter: timeFilter
      }
    };
    
    // Cache the result
    setCache(cacheKey, result);
    
    res.json(result);
    
  } catch (error) {
    console.error('[Analytics] Error in topic timeline endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/engagement', async (req, res) => {
  try {
    const { timeframe = '30d', startDate, endDate, userSegment = 'all', includeInactive = 'false' } = req.query;
    
    console.log('[Analytics] Fetching user engagement with filters:', req.query);
    
    // Get session counts for time period first
    let sessionQuery = supabase
      .from('sessions')
      .select('user_id');
    
    const timeFilter = buildTimeFilter(timeframe, startDate, endDate);
    if (timeFilter) {
      sessionQuery = sessionQuery.gte('created_at', timeFilter.startDate);
      if (timeFilter.endDate) {
        sessionQuery = sessionQuery.lte('created_at', timeFilter.endDate);
      }
    }
    
    const { data: sessions } = await sessionQuery;
    
    // Calculate session counts per user
    const sessionCounts = {};
    sessions?.forEach(session => {
      if (session.user_id) { // Filter out null user_ids
        sessionCounts[session.user_id] = (sessionCounts[session.user_id] || 0) + 1;
      }
    });
    
    // Get active user profiles (only users who have sessions in timeframe)
    const activeUserIds = Object.keys(sessionCounts);
    let profiles = [];
    
    if (activeUserIds.length > 0) {
      const { data: userProfiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', activeUserIds);
      profiles = userProfiles || [];
    }
    
    // If includeInactive is true, get all profiles
    if (includeInactive === 'true') {
      const { data: allProfiles } = await supabase
        .from('user_profiles')
        .select('*');
      profiles = allProfiles || [];
    }
    
    // Calculate engagement levels with better thresholds
    const userEngagement = {};
    
    profiles?.forEach(profile => {
      const sessionCount = sessionCounts[profile.id] || 0;
      let level;
      
      // Better engagement thresholds based on timeframe
      const isLongTimeframe = timeframe === '30d' || timeframe === '90d';
      
      if (sessionCount === 0) {
        level = 'Inactive';
      } else if (isLongTimeframe) {
        // Thresholds for longer timeframes
        if (sessionCount <= 3) level = 'Low';
        else if (sessionCount <= 10) level = 'Medium';
        else if (sessionCount <= 25) level = 'High';
        else level = 'Very High';
      } else {
        // Thresholds for shorter timeframes (7d, 1d)
        if (sessionCount <= 2) level = 'Low';
        else if (sessionCount <= 5) level = 'Medium';
        else if (sessionCount <= 15) level = 'High';
        else level = 'Very High';
      }
      
      userEngagement[level] = (userEngagement[level] || 0) + 1;
    });
    
    const totalUsers = profiles?.length || 0;
    const totalSessions = sessions?.length || 0;
    const activeUsers = Object.keys(sessionCounts).length;
    const avgSessionsPerUser = activeUsers > 0 ? (totalSessions / activeUsers).toFixed(1) : '0';
    
    res.json({
      engagement_distribution: userEngagement,
      total_users: totalUsers,
      active_users: activeUsers,
      total_sessions: totalSessions,
      avg_sessions_per_user: avgSessionsPerUser,
      timeframe_info: {
        period: timeframe,
        showing_only_active: includeInactive !== 'true',
        note: includeInactive !== 'true' ? 'Only showing users active in selected timeframe' : 'Showing all users'
      }
    });
    
  } catch (error) {
    console.error('[Analytics] Error in user engagement endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics/trends', async (req, res) => {
  try {
    const { timeframe = '7d', topicFilter, minSessions = 1 } = req.query;
    
    // Check cache first
    const cacheKey = getCacheKey('topics_trends', req.query);
    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log('[Analytics] Returning cached trends data');
      return res.json(cachedResult);
    }
    
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
    
    // Use sessions table instead of queries for trend analysis
    const [recentSessions, previousSessions] = await Promise.all([
      supabase
        .from('sessions')
        .select('secret_topic, user_id, created_at')
        .not('secret_topic', 'is', null)
        .gte('created_at', recentStart.toISOString()),
      supabase
        .from('sessions')
        .select('secret_topic, user_id, created_at')
        .not('secret_topic', 'is', null)
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', previousEnd.toISOString())
    ]);
    
    // Count sessions by topic for both periods
    const countTopicSessions = (sessions) => {
      const topicCounts = {};
      
      sessions.data?.forEach(session => {
        if (session.secret_topic) {
          const topic = session.secret_topic;
          
          // Apply topic filter
          if (topicFilter && !topic.toLowerCase().includes(topicFilter.toLowerCase())) {
            return;
          }
          
          if (!topicCounts[topic]) {
            topicCounts[topic] = 0;
          }
          
          topicCounts[topic]++;
        }
      });
      
      return topicCounts;
    };
    
    const recentCounts = countTopicSessions(recentSessions);
    const previousCounts = countTopicSessions(previousSessions);
    
    // Calculate trends
    const allTopics = new Set([...Object.keys(recentCounts), ...Object.keys(previousCounts)]);
    const trends = [];
    
    allTopics.forEach(topic => {
      const recentSessionsCount = recentCounts[topic] || 0;
      const previousSessionsCount = previousCounts[topic] || 0;
      
      // Apply minimum sessions filter
      if (recentSessionsCount < parseInt(minSessions) && previousSessionsCount < parseInt(minSessions)) {
        return;
      }
      
      let growthPercentage;
      let trend;
      
      if (previousSessionsCount === 0) {
        growthPercentage = recentSessionsCount > 0 ? 'New' : '0';
        trend = recentSessionsCount > 0 ? 'up' : 'stable';
      } else {
        growthPercentage = (((recentSessionsCount - previousSessionsCount) / previousSessionsCount) * 100).toFixed(1);
        trend = recentSessionsCount > previousSessionsCount ? 'up' : 
               recentSessionsCount < previousSessionsCount ? 'down' : 'stable';
      }
      
      trends.push({
        topic_name: topic,
        recent_sessions: recentSessionsCount,
        previous_sessions: previousSessionsCount,
        growth_percentage: growthPercentage,
        trend: trend
      });
    });
    
    // Sort by recent sessions
    trends.sort((a, b) => b.recent_sessions - a.recent_sessions);
    
    const result = {
      trends: trends,
      period: `Comparing last ${timeframe} vs previous ${timeframe}`,
      recent_period: {
        start: recentStart.toISOString(),
        end: now.toISOString(),
        total_sessions: recentSessions.data?.length || 0
      },
      previous_period: {
        start: previousStart.toISOString(),
        end: previousEnd.toISOString(),
        total_sessions: previousSessions.data?.length || 0
      }
    };
    
    // Cache the result
    setCache(cacheKey, result);
    
    res.json(result);
    
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
        // User segment filtering moved to post-processing
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
      query = query.gte('created_at', timeFilter.startDate);
      if (timeFilter.endDate) {
        query = query.lte('created_at', timeFilter.endDate);
      }
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

// Debug endpoint to see sessions data
router.get('/debug/sessions', async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('secret_topic, created_at, user_id')
      .not('secret_topic', 'is', null)
      .limit(5);
    
    if (error) {
      return res.json({ error: error.message });
    }
    
    res.json({
      total_found: sessions?.length || 0,
      sample_sessions: sessions,
      timeline_example: sessions?.length > 0 ? {
        date: new Date(sessions[0].created_at).toISOString().split('T')[0],
        topic: sessions[0].secret_topic
      } : null
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

export default router; 