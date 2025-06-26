  import { WebSocketServer } from 'ws';
import { supabase } from './lib/supabaseClient.js';

class AnalyticsWebSocketServer {
  constructor() {
    this.clients = new Set();
    this.updateInterval = null;
    this.BROADCAST_INTERVAL = 15000; // 15 seconds
  }

  init(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/analytics-ws'
    });

    this.wss.on('connection', (ws, req) => {
      console.log('[WebSocket] New analytics client connected');
      this.clients.add(ws);

      // Send initial data
      this.sendAnalyticsUpdate(ws);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('[WebSocket] Received message:', data);
          
          if (data.type === 'subscribe') {
            // Client is subscribing to real-time updates
            ws.isSubscribed = true;
            ws.filters = data.filters || {};
            ws.isUserSpecific = data.isUserSpecific || false;
            ws.userId = data.userId;
          } else if (data.type === 'updateFilters') {
            // Client is updating their filters
            ws.filters = data.filters || {};
            this.sendAnalyticsUpdate(ws);
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Analytics client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error);
        this.clients.delete(ws);
      });
    });

    // Start periodic updates
    this.startPeriodicUpdates();

    console.log('[WebSocket] Analytics WebSocket server initialized');
  }

  startPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.broadcastAnalyticsUpdate();
    }, this.BROADCAST_INTERVAL);
  }

  async sendAnalyticsUpdate(ws) {
    try {
      const analytics = await this.fetchAnalytics(ws.filters || {}, ws.isUserSpecific, ws.userId);
      
      ws.send(JSON.stringify({
        type: 'analyticsUpdate',
        data: analytics,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('[WebSocket] Error sending analytics update:', error);
    }
  }

  async broadcastAnalyticsUpdate() {
    if (this.clients.size === 0) return;

    console.log(`[WebSocket] Broadcasting analytics update to ${this.clients.size} clients`);

    // Group clients by their filter settings
    const clientGroups = new Map();
    
    this.clients.forEach(ws => {
      if (ws.isSubscribed && ws.readyState === ws.OPEN) {
        const key = JSON.stringify({
          filters: ws.filters || {},
          isUserSpecific: ws.isUserSpecific || false,
          userId: ws.userId
        });
        
        if (!clientGroups.has(key)) {
          clientGroups.set(key, []);
        }
        clientGroups.get(key).push(ws);
      }
    });

    // Fetch and broadcast for each unique filter combination
    for (const [key, clients] of clientGroups) {
      try {
        const config = JSON.parse(key);
        const analytics = await this.fetchAnalytics(
          config.filters, 
          config.isUserSpecific, 
          config.userId
        );

        const message = JSON.stringify({
          type: 'analyticsUpdate',
          data: analytics,
          timestamp: new Date().toISOString()
        });

        clients.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(message);
          }
        });
      } catch (error) {
        console.error('[WebSocket] Error in broadcast group:', error);
      }
    }
  }

  async fetchAnalytics(filters = {}, isUserSpecific = false, userId = null) {
    try {
      // Simplified analytics fetch - you might want to optimize this
      const { timeframe = '7d', startDate, endDate, userSegment = 'all', topicFilter, minSessions = 1 } = filters;
      
      // Build time filter
      const now = new Date();
      let timeCondition = '';
      
      switch (timeframe) {
        case '1d':
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          timeCondition = `created_at >= '${yesterday.toISOString()}'`;
          break;
        case '7d':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          timeCondition = `created_at >= '${weekAgo.toISOString()}'`;
          break;
        case '30d':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          timeCondition = `created_at >= '${monthAgo.toISOString()}'`;
          break;
        default:
          const defaultWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          timeCondition = `created_at >= '${defaultWeekAgo.toISOString()}'`;
      }

      // Get basic query data
      let queryBuilder = supabase.from('queries').select('*');
      
      if (isUserSpecific && userId) {
        queryBuilder = queryBuilder.eq('user_id', userId);
      }
      
      if (timeCondition) {
        queryBuilder = queryBuilder.gte('created_at', timeCondition.split("'")[1]);
      }

      const { data: queries } = await queryBuilder;

      // Basic analytics calculation
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

      const totalSessions = Object.values(topicCounts).reduce((sum, count) => sum + count, 0);
      const popularTopics = Object.entries(topicCounts)
        .filter(([topic, count]) => count >= parseInt(minSessions))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({
          topic_name: topic,
          session_count: count,
          percentage: totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : '0'
        }));

      return {
        popularity: {
          popular_topics: popularTopics,
          total_sessions: totalSessions,
          unique_topics: popularTopics.length
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[WebSocket] Error fetching analytics:', error);
      return { error: 'Failed to fetch analytics' };
    }
  }

  shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.clients.forEach(ws => {
      ws.close();
    });
    
    if (this.wss) {
      this.wss.close();
    }
    
    console.log('[WebSocket] Analytics WebSocket server shutdown');
  }
}

export default AnalyticsWebSocketServer; 