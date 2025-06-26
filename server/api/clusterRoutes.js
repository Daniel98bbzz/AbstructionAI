import express from 'express';
import ModernClusterManager from '../managers/ModernClusterManager.js';
import { getClusteringStatus } from '../config/clustering.js';

export default function setupClusterRoutes(app, supabase) {
  // ModernClusterManager is already instantiated as a singleton
  const clusterManager = ModernClusterManager;
  // Ensure cluster manager uses the passed supabase instance
  if (supabase) {
    clusterManager.supabase = supabase;
  }

  /**
   * Get all clusters with their centroids for visualization
   */
  app.get('/api/clusters', async (req, res) => {
    try {
      const { data: clusters, error } = await clusterManager.supabase
        .from('user_clusters')
        .select('*');
      
      if (error) throw error;
      
      res.json({ clusters });
    } catch (error) {
      console.error('Error fetching clusters:', error);
      res.status(500).json({ error: 'Failed to fetch clusters' });
    }
  });

  /**
   * Get all topics with usage statistics for filtering
   */
  app.get('/api/clusters/topics', async (req, res) => {
    try {
      const { data: topics, error } = await clusterManager.supabase
        .from('topics')
        .select('name, description, usage_count, is_active')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });
      
      if (error) throw error;
      
      res.json({ topics: topics || [] });
    } catch (error) {
      console.error('Error fetching topics:', error);
      res.status(500).json({ error: 'Failed to fetch topics' });
    }
  });

  /**
   * Get clusters with topic-based filtering and statistics
   */
  app.get('/api/clusters/by-topic', async (req, res) => {
    try {
      const { topic, min_usage } = req.query;
      
      // Get base clusters
      const { data: clusters, error: clustersError } = await clusterManager.supabase
        .from('user_clusters')
        .select('*');
      
      if (clustersError) throw clustersError;
      
      if (!clusters || clusters.length === 0) {
        return res.json({ clusters: [], topic_stats: {} });
      }
      
      console.log(`[Cluster API] Fetching clusters by topic: ${topic || 'all'}`);
      
      // Try to get cluster assignments with user profiles
      let assignments = [];
      let sessionData = [];
      
      try {
        const { data: assignmentData, error: assignmentsError } = await clusterManager.supabase
          .from('user_cluster_assignments')
          .select('cluster_id, user_id');
        
        if (!assignmentsError && assignmentData) {
          assignments = assignmentData;
          console.log(`[Cluster API] Found ${assignments.length} user assignments`);
          
          // Get sessions with topics for each user
          const userIds = assignments.map(a => a.user_id);
          
          if (userIds.length > 0) {
            const { data: sessions, error: sessionsError } = await clusterManager.supabase
              .from('sessions')
              .select('user_id, secret_topic')
              .in('user_id', userIds)
              .not('secret_topic', 'is', null);
            
            if (!sessionsError && sessions) {
              sessionData = sessions;
              console.log(`[Cluster API] Found ${sessionData.length} sessions with topics`);
            }
          }
        } else {
          console.log('[Cluster API] No user assignments found, using mock data');
        }
      } catch (assignmentError) {
        console.log('[Cluster API] Error accessing assignments table, using mock data:', assignmentError.message);
      }
      
      // Calculate topic statistics for each cluster
      const clusterTopicStats = {};
      
      clusters.forEach(cluster => {
        if (assignments.length > 0) {
          // Use real data if available
          const clusterAssignments = assignments.filter(a => a.cluster_id === cluster.id);
          const clusterUserIds = clusterAssignments.map(a => a.user_id);
          const clusterSessions = sessionData.filter(s => clusterUserIds.includes(s.user_id));
          
          // Count topics for this cluster
          const topicCounts = {};
          clusterSessions.forEach(session => {
            if (session.secret_topic) {
              topicCounts[session.secret_topic] = (topicCounts[session.secret_topic] || 0) + 1;
            }
          });
          
          clusterTopicStats[cluster.id] = {
            total_sessions: clusterSessions.length,
            topic_counts: topicCounts,
            dominant_topic: Object.keys(topicCounts).reduce((a, b) => 
              topicCounts[a] > topicCounts[b] ? a : b, null),
            unique_topics: Object.keys(topicCounts).length
          };
        } else {
          // Generate mock topic data for demonstration
          const mockTopics = ['algorithms', 'geometry', 'algebra', 'physics', 'chemistry'];
          const topicCounts = {};
          
          // Randomly assign some topics to this cluster
          const numTopicsForCluster = Math.floor(Math.random() * 3) + 1;
          for (let i = 0; i < numTopicsForCluster; i++) {
            const randomTopic = mockTopics[Math.floor(Math.random() * mockTopics.length)];
            topicCounts[randomTopic] = (topicCounts[randomTopic] || 0) + Math.floor(Math.random() * 5) + 1;
          }
          
          clusterTopicStats[cluster.id] = {
            total_sessions: Object.values(topicCounts).reduce((sum, count) => sum + count, 0),
            topic_counts: topicCounts,
            dominant_topic: Object.keys(topicCounts).reduce((a, b) => 
              topicCounts[a] > topicCounts[b] ? a : b, null),
            unique_topics: Object.keys(topicCounts).length
          };
        }
      });
      
      // Filter clusters based on topic and usage if specified
      let filteredClusters = clusters.map(cluster => ({
        ...cluster,
        topic_stats: clusterTopicStats[cluster.id]
      }));
      
      if (topic) {
        filteredClusters = filteredClusters.filter(cluster => {
          const stats = cluster.topic_stats;
          return stats.topic_counts[topic] && 
                 (!min_usage || stats.topic_counts[topic] >= parseInt(min_usage));
        });
      }
      
      // Calculate overall topic statistics
      const overallTopicStats = {};
      Object.values(clusterTopicStats).forEach(stats => {
        Object.entries(stats.topic_counts).forEach(([topicName, count]) => {
          overallTopicStats[topicName] = (overallTopicStats[topicName] || 0) + count;
        });
      });
      
      console.log(`[Cluster API] Returning ${filteredClusters.length} filtered clusters`);
      
      res.json({ 
        clusters: filteredClusters,
        topic_stats: overallTopicStats,
        filter_applied: { topic, min_usage }
      });
    } catch (error) {
      console.error('Error fetching clusters by topic:', error);
      res.status(500).json({ error: 'Failed to fetch clusters by topic', details: error.message });
    }
  });

  /**
   * Get topic distribution across all clusters
   */
  app.get('/api/clusters/topic-distribution', async (req, res) => {
    try {
      console.log('[Cluster API] Fetching topic distribution');
      
      // Try to get all sessions with topics
      let sessions = [];
      let assignments = [];
      
      try {
        const { data: sessionData, error: sessionsError } = await clusterManager.supabase
          .from('sessions')
          .select('user_id, secret_topic')
          .not('secret_topic', 'is', null);
        
        if (!sessionsError && sessionData) {
          sessions = sessionData;
          console.log(`[Cluster API] Found ${sessions.length} sessions with topics`);
        }
        
        // Get user cluster assignments
        const { data: assignmentData, error: assignmentsError } = await clusterManager.supabase
          .from('user_cluster_assignments')
          .select('user_id, cluster_id');
        
        if (!assignmentsError && assignmentData) {
          assignments = assignmentData;
          console.log(`[Cluster API] Found ${assignments.length} user assignments`);
        }
      } catch (dataError) {
        console.log('[Cluster API] Error accessing session/assignment data, using mock distribution:', dataError.message);
      }
      
      let distribution = {};
      
      if (sessions.length > 0 && assignments.length > 0) {
        // Use real data if available
        // Create lookup map for user to cluster
        const userToCluster = {};
        assignments.forEach(assignment => {
          userToCluster[assignment.user_id] = assignment.cluster_id;
        });
        
        // Calculate topic distribution by cluster
        sessions.forEach(session => {
          const clusterId = userToCluster[session.user_id];
          if (clusterId && session.secret_topic) {
            if (!distribution[clusterId]) {
              distribution[clusterId] = {};
            }
            distribution[clusterId][session.secret_topic] = 
              (distribution[clusterId][session.secret_topic] || 0) + 1;
          }
        });
      } else {
        // Generate mock distribution data for demonstration
        console.log('[Cluster API] Generating mock topic distribution');
        
        // Get clusters to generate mock data for
        const { data: clusters } = await clusterManager.supabase
          .from('user_clusters')
          .select('id');
        
        if (clusters) {
          const mockTopics = ['algorithms', 'geometry', 'algebra', 'physics', 'chemistry', 'biology', 'history'];
          
          clusters.forEach(cluster => {
            distribution[cluster.id] = {};
            
            // Randomly assign topics to each cluster
            const numTopics = Math.floor(Math.random() * 4) + 1;
            const selectedTopics = mockTopics.sort(() => 0.5 - Math.random()).slice(0, numTopics);
            
            selectedTopics.forEach(topic => {
              distribution[cluster.id][topic] = Math.floor(Math.random() * 10) + 1;
            });
          });
        }
      }
      
      console.log(`[Cluster API] Returning distribution for ${Object.keys(distribution).length} clusters`);
      
      res.json({ distribution });
    } catch (error) {
      console.error('Error fetching topic distribution:', error);
      res.status(500).json({ error: 'Failed to fetch topic distribution', details: error.message });
    }
  });

  /**
   * Get users with their cluster assignments for visualization
   */
  app.get('/api/clusters/cluster-users', async (req, res) => {
    try {
      const { topic } = req.query;
      
      let userQuery = clusterManager.supabase
        .from('user_cluster_assignments')
        .select(`
          user_id,
          cluster_id,
          similarity,
          preferences
        `);
      
      const { data: userClusters, error } = await userQuery;
      
      if (error) throw error;
      
      // Fetch user data to get learning preferences
      const userIds = userClusters.map(uc => uc.user_id);
      
      // Limit to 100 users max for visualization performance
      const limitedUserIds = userIds.slice(0, 100);
      
      // Get users with preferences
      const { data: users, userError } = await clusterManager.supabase
        .from('users')
        .select('id, preferences')
        .in('id', limitedUserIds);
      
      if (userError) throw userError;
      
      // If filtering by topic, get sessions for these users
      let sessionData = [];
      if (topic) {
        const { data: sessions, sessionsError } = await clusterManager.supabase
          .from('sessions')
          .select('user_id, secret_topic')
          .in('user_id', limitedUserIds)
          .eq('secret_topic', topic);
        
        if (!sessionsError && sessions) {
          sessionData = sessions;
        }
      }
      
      // Combine the data
      let clusterUsers = userClusters
        .filter(uc => limitedUserIds.includes(uc.user_id))
        .map(uc => {
          const user = users.find(u => u.id === uc.user_id);
          return {
            id: uc.user_id,
            cluster: uc.cluster_id,
            similarity: uc.similarity,
            preferences: uc.preferences || (user ? user.preferences : {})
          };
        });
      
      // Filter by topic if specified
      if (topic && sessionData.length > 0) {
        const topicUserIds = sessionData.map(s => s.user_id);
        clusterUsers = clusterUsers.filter(user => topicUserIds.includes(user.id));
      }
      
      res.json({ users: clusterUsers });
    } catch (error) {
      console.error('Error fetching cluster users:', error);
      res.status(500).json({ error: 'Failed to fetch cluster users' });
    }
  });

  /**
   * Get conversation feedback for a specific user
   */
  app.get('/api/clusters/user-feedback/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      // Fetch user conversation feedback
      const { data: feedback, error } = await clusterManager.supabase
        .from('conversation_feedback')
        .select(`
          id,
          user_input,
          system_response,
          rating,
          comment,
          timestamp
        `)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(10);  // Limit to the 10 most recent feedbacks
      
      if (error) throw error;
      
      res.json({ feedback: feedback || [] });
    } catch (error) {
      console.error('Error fetching user feedback:', error);
      res.status(500).json({ error: 'Failed to fetch user feedback' });
    }
  });

  /**
   * Get recent chat topics from users in the same cluster
   */
  app.get('/api/clusters/cluster-topics/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      console.log(`Fetching cluster topics for user ${userId}...`);
      
      // First, get the user's cluster assignment - only fetch cluster_id
      const { data: userCluster, error: clusterError } = await clusterManager.supabase
        .from('user_profiles')
        .select('cluster_id')
        .eq('id', userId)
        .single();
      
      if (clusterError) {
        console.error('Error fetching user profile:', clusterError);
        throw clusterError;
      }
      
      console.log('User profile data:', userCluster);
      
      if (!userCluster) {
        return res.status(404).json({ 
          error: 'User not found',
          message: 'Could not find this user in the database'
        });
      }
      
      if (!userCluster.cluster_id) {
        return res.status(404).json({ 
          error: 'User has no cluster assignment',
          message: 'This user is not assigned to any cluster yet'
        });
      }
      
      console.log(`User ${userId} belongs to cluster ${userCluster.cluster_id}`);
      
      // Simply match users in the same cluster - don't try to use columns that don't exist
      const { data: clusterUsers, error: usersError } = await clusterManager.supabase
        .from('user_profiles')
        .select('id, username')
        .eq('cluster_id', userCluster.cluster_id)
        .neq('id', userId) // Exclude the current user
        .limit(50);
      
      if (usersError) {
        console.error('Error fetching cluster users:', usersError);
        throw usersError;
      }
      
      if (!clusterUsers || clusterUsers.length === 0) {
        return res.json({ 
          topics: [],
          message: 'No other users found in your cluster'
        });
      }
      
      console.log(`Found ${clusterUsers.length} users in the same cluster`);
      
      // Get user IDs
      const userIds = clusterUsers.map(user => user.id);
      
      // Try to fetch topics from interactions table
      try {
        // First try with topic_name
        const { data: topicsWithNames, error: topicsWithNamesError } = await clusterManager.supabase
          .from('interactions')
          .select('id, user_id, query, created_at, topic_name')
          .in('user_id', userIds)
          .not('query', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);
        
        // If we get data and it has topic_name field, use it
        if (!topicsWithNamesError && topicsWithNames && topicsWithNames.length > 0 && 
            topicsWithNames[0].hasOwnProperty('topic_name')) {
          
          // Format the topics
          const formattedTopics = topicsWithNames.map(item => {
            const user = clusterUsers.find(u => u.id === item.user_id);
            return {
              id: item.id,
              user_id: item.user_id,
              username: user ? user.username : 'Anonymous User',
              query: item.query,
              topic: item.topic_name || 'Untitled Topic',
              timestamp: item.created_at
            };
          });
          
          return res.json({ topics: formattedTopics });
        }
        
        // If no topic_name or error, try without it
        const { data: topics, error: topicsError } = await clusterManager.supabase
          .from('interactions')
          .select('id, user_id, query, created_at')
          .in('user_id', userIds)
          .not('query', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (!topicsError && topics && topics.length > 0) {
          // Format the topics without topic names
          const formattedTopics = topics.map(item => {
            const user = clusterUsers.find(u => u.id === item.user_id);
            return {
              id: item.id,
              user_id: item.user_id,
              username: user ? user.username : 'Anonymous User',
              query: item.query,
              topic: 'Untitled Topic', // No topic name available
              timestamp: item.created_at
            };
          });
          
          return res.json({ topics: formattedTopics });
        }
      } catch (interactionError) {
        console.log('Error querying interactions table:', interactionError);
        // Continue to try the feedback table
      }
      
      // Try the feedback table as a fallback
      try {
        // First try with topic field
        const { data: feedbackWithTopic, error: feedbackWithTopicError } = await clusterManager.supabase
          .from('feedback')
          .select('id, user_id, query_text, created_at, topic')
          .in('user_id', userIds)
          .not('query_text', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);
        
        // If we get data and it has topic field, use it
        if (!feedbackWithTopicError && feedbackWithTopic && feedbackWithTopic.length > 0 &&
            feedbackWithTopic[0].hasOwnProperty('topic')) {
          
          // Format the topics
          const formattedTopics = feedbackWithTopic.map(item => {
            const user = clusterUsers.find(u => u.id === item.user_id);
            return {
              id: item.id,
              user_id: item.user_id,
              username: user ? user.username : 'Anonymous User',
              query: item.query_text,
              topic: item.topic || 'Untitled Topic',
              timestamp: item.created_at
            };
          });
          
          return res.json({ topics: formattedTopics });
        }
        
        // If no topic field or error, try without it
        const { data: feedback, error: feedbackError } = await clusterManager.supabase
          .from('feedback')
          .select('id, user_id, query_text, created_at')
          .in('user_id', userIds)
          .not('query_text', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (!feedbackError && feedback && feedback.length > 0) {
          // Format the feedback without topic names
          const formattedTopics = feedback.map(item => {
            const user = clusterUsers.find(u => u.id === item.user_id);
            return {
              id: item.id,
              user_id: item.user_id,
              username: user ? user.username : 'Anonymous User',
              query: item.query_text,
              topic: 'Untitled Topic', // No topic available
              timestamp: item.created_at
            };
          });
          
          return res.json({ topics: formattedTopics });
        }
      } catch (feedbackError) {
        console.log('Error querying feedback table:', feedbackError);
      }
      
      // If we reach here, no data was found
      return res.json({ 
        topics: [],
        message: 'No recent chat topics found from users in your cluster'
      });
      
    } catch (error) {
      console.error('Error fetching cluster topics:', error);
      res.status(500).json({ error: 'Failed to fetch cluster topics', details: error.message });
    }
  });

  /**
   * Get recent quiz results from users in the same cluster
   */
  app.get('/api/clusters/cluster-quizzes/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      console.log(`Fetching cluster quizzes for user ${userId}...`);
      
      // First, get the user's cluster assignment
      const { data: userCluster, error: clusterError } = await clusterManager.supabase
        .from('user_profiles')
        .select('cluster_id')
        .eq('id', userId)
        .single();
      
      if (clusterError) {
        console.error('Error fetching user profile:', clusterError);
        throw clusterError;
      }
      
      console.log('User profile data:', userCluster);
      
      if (!userCluster) {
        return res.status(404).json({ 
          error: 'User not found',
          message: 'Could not find this user in the database'
        });
      }
      
      if (!userCluster.cluster_id) {
        return res.status(404).json({ 
          error: 'User has no cluster assignment',
          message: 'This user is not assigned to any cluster yet'
        });
      }
      
      console.log(`User ${userId} belongs to cluster ${userCluster.cluster_id}`);
      
      // Get users in the same cluster (excluding current user)
      const { data: clusterUsers, error: usersError } = await clusterManager.supabase
        .from('user_profiles')
        .select('id, username')
        .eq('cluster_id', userCluster.cluster_id)
        .neq('id', userId) // Exclude the current user
        .limit(50);
      
      if (usersError) {
        console.error('Error fetching cluster users:', usersError);
        throw usersError;
      }
      
      if (!clusterUsers || clusterUsers.length === 0) {
        return res.json({ 
          quizzes: [],
          message: 'No other users found in your cluster'
        });
      }
      
      console.log(`Found ${clusterUsers.length} users in the same cluster`);
      
      // Get user IDs
      const userIds = clusterUsers.map(user => user.id);
      
      // Fetch quiz results from cluster users
      const { data: quizResults, error: quizError } = await clusterManager.supabase
        .from('quiz_results')
        .select(`
          id,
          user_id,
          quiz_id,
          score,
          created_at,
          quizzes:quiz_id (
            id,
            title,
            description,
            query,
            difficulty
          )
        `)
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (quizError) {
        console.error('Error fetching quiz results:', quizError);
        throw quizError;
      }
      
      if (!quizResults || quizResults.length === 0) {
        return res.json({ 
          quizzes: [],
          message: 'No quiz results found from users in your cluster yet. Be the first to take a quiz!'
        });
      }
      
      // Format the quiz results
      const formattedQuizzes = quizResults.map(result => {
        const user = clusterUsers.find(u => u.id === result.user_id);
        return {
          id: result.id,
          quiz_id: result.quiz_id,
          user_id: result.user_id,
          username: user ? user.username : 'Anonymous User',
          score: result.score,
          title: result.quizzes?.title || 'Untitled Quiz',
          description: result.quizzes?.description || '',
          query: result.quizzes?.query || '',
          difficulty: result.quizzes?.difficulty || 'medium',
          timestamp: result.created_at
        };
      });
      
      console.log(`Found ${formattedQuizzes.length} quiz results from cluster users`);
      
      return res.json({ quizzes: formattedQuizzes });
      
    } catch (error) {
      console.error('Error fetching cluster quizzes:', error);
      res.status(500).json({ error: 'Failed to fetch cluster quizzes', details: error.message });
    }
  });

  /**
   * Get clustering system status and configuration
   */
  app.get('/api/clusters/status', async (req, res) => {
    try {
      const status = getClusteringStatus();
      
      // Get current cluster statistics
      const vizData = await clusterManager.getClusterVisualizationData();
      
      const response = {
        ...status,
        statistics: vizData ? {
          totalClusters: vizData.clusters.length,
          totalUsers: vizData.totalUsers,
          averageClusterSize: (vizData.totalUsers / vizData.clusters.length).toFixed(1),
          clusterDistribution: vizData.clusters.map((cluster, i) => ({
            clusterId: cluster.id,
            memberCount: cluster.memberCount,
            centroid: cluster.centroid
          }))
        } : null
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching clustering status:', error);
      res.status(500).json({ error: 'Failed to fetch clustering status' });
    }
  });

  /**
   * Get cluster visualization data (for admin dashboards)
   */
  app.get('/api/clusters/visualization', async (req, res) => {
    try {
      const vizData = await clusterManager.getClusterVisualizationData();
      
      if (!vizData) {
        return res.status(404).json({ error: 'No visualization data available' });
      }
      
      res.json(vizData);
    } catch (error) {
      console.error('Error fetching cluster visualization data:', error);
      res.status(500).json({ error: 'Failed to fetch visualization data' });
    }
  });

  /**
   * Trigger cluster regeneration (admin endpoint)
   */
  app.post('/api/clusters/regenerate', async (req, res) => {
    try {
      const { numClusters = 8 } = req.body;
      
      console.log(`[Admin] Triggering cluster regeneration with ${numClusters} clusters`);
      
      const firstClusterId = await clusterManager.generateClusters(numClusters);
      
      // Get updated visualization data
      const vizData = await clusterManager.getClusterVisualizationData();
      
      res.json({
        success: true,
        message: `Successfully regenerated ${vizData?.clusters.length || 0} clusters`,
        firstClusterId,
        statistics: vizData
      });
    } catch (error) {
      console.error('Error regenerating clusters:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to regenerate clusters',
        details: error.message 
      });
    }
  });

  /**
   * Get cluster prompt for a user
   */
  app.get('/api/clusters/prompt/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const clusterPrompt = await clusterManager.getClusterPromptForUser(userId);
      
      if (!clusterPrompt) {
        return res.json({ 
          prompt: null,
          message: 'No cluster prompt available for this user'
        });
      }
      
      res.json({ 
        prompt: clusterPrompt,
        length: clusterPrompt.length
      });
    } catch (error) {
      console.error('Error fetching cluster prompt:', error);
      res.status(500).json({ error: 'Failed to fetch cluster prompt' });
    }
  });

  /**
   * Assign or reassign a user to a cluster
   */
  app.post('/api/clusters/assign', async (req, res) => {
    try {
      const { userId, preferences } = req.body;
      
      if (!userId || !preferences) {
        return res.status(400).json({ 
          error: 'User ID and preferences are required' 
        });
      }
      
      const clusterId = await clusterManager.assignUserToCluster(userId, preferences);
      
      // Get cluster info
      const clusterPrompt = await clusterManager.getClusterPromptForUser(userId);
      
      res.json({
        success: true,
        clusterId,
        prompt: clusterPrompt,
        message: 'User successfully assigned to cluster'
      });
    } catch (error) {
      console.error('Error assigning user to cluster:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to assign user to cluster',
        details: error.message 
      });
    }
  });

  /**
   * Trigger cluster recalculation on demand
   */
  app.post('/api/clusters/recluster-now', async (req, res) => {
    try {
      const { 
        numClusters = 5, 
        includeRecentActivity = true, 
        includeFeedback = true,
        users = null 
      } = req.body;

      console.log(`[Recluster API] Starting cluster recalculation with ${numClusters} clusters`);

      // Validate parameters
      if (numClusters < 2 || numClusters > 20) {
        return res.status(400).json({ 
          error: 'Number of clusters must be between 2 and 20',
          provided: numClusters
        });
      }

      // Trigger reclustering
      const results = await clusterManager.recalculateClusters({
        numClusters,
        includeRecentActivity,
        includeFeedback,
        users
      });

      if (results.success) {
        console.log(`[Recluster API] Reclustering completed successfully`);
        res.json({
          success: true,
          message: 'Cluster recalculation completed successfully',
          results
        });
      } else {
        console.log(`[Recluster API] Reclustering failed: ${results.error}`);
        res.status(500).json({
          success: false,
          error: results.error,
          details: results
        });
      }

    } catch (error) {
      console.error('[Recluster API] Error during cluster recalculation:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to recalculate clusters',
        details: error.message 
      });
    }
  });

  /**
   * Get cluster recalculation status and last run info
   */
  app.get('/api/clusters/recluster-status', async (req, res) => {
    try {
      // Get cluster creation timestamps to determine last clustering
      const { data: clusters, error } = await clusterManager.supabase
        .from('user_clusters')
        .select('created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const lastClustering = clusters?.[0];
      const clusterCount = await clusterManager.supabase
        .from('user_clusters')
        .select('id', { count: 'exact' });

      const userCount = await clusterManager.supabase
        .from('user_cluster_assignments')
        .select('user_id', { count: 'exact' });

      res.json({
        success: true,
        status: {
          lastClusteringTime: lastClustering?.created_at || null,
          clusteringMethod: lastClustering?.metadata?.creation_method || 'unknown',
          currentClusterCount: clusterCount.count || 0,
          assignedUserCount: userCount.count || 0,
          canRecluster: (userCount.count || 0) >= 10 // Minimum users for reclustering
        }
      });

    } catch (error) {
      console.error('[Recluster Status] Error fetching reclustering status:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch reclustering status',
        details: error.message 
      });
    }
  });
} 