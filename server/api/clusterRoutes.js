import express from 'express';
import UserClusterManager from '../managers/UserClusterManager.js';

export default function setupClusterRoutes(app, supabase) {
  // UserClusterManager is already instantiated as a singleton
  const clusterManager = UserClusterManager;
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
   * Get users with their cluster assignments for visualization
   */
  app.get('/api/clusters/cluster-users', async (req, res) => {
    try {
      const { data: userClusters, error } = await clusterManager.supabase
        .from('user_cluster_assignments')
        .select(`
          user_id,
          cluster_id,
          similarity,
          preferences
        `);
      
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
      
      // Combine the data
      const clusterUsers = userClusters
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
        console.log('DEBUG: No quiz results found, showing mock data for demonstration');
        console.log('DEBUG: Cluster users found:', clusterUsers.map(u => ({ id: u.id, username: u.username })));
        
        // For demonstration purposes, return mock quiz data if no real data exists
        // In production, as users take more quizzes, this will show real quiz results from cluster users
        const mockQuizzes = [];
        
        // Use real cluster users for mock data if available
        if (clusterUsers.length > 0) {
          const topics = [
            { title: 'Python Fundamentals Quiz', query: 'Python programming fundamentals', difficulty: 'medium', score: 92 },
            { title: 'JavaScript ES6 Features', query: 'JavaScript ES6 arrow functions and promises', difficulty: 'hard', score: 87 },
            { title: 'Machine Learning Basics', query: 'Machine learning supervised learning', difficulty: 'medium', score: 78 },
            { title: 'Data Structures & Algorithms', query: 'Binary trees and graph traversal algorithms', difficulty: 'hard', score: 95 },
            { title: 'React Hooks Deep Dive', query: 'React hooks useState useEffect custom hooks', difficulty: 'medium', score: 83 }
          ];
          
          for (let i = 0; i < Math.min(5, clusterUsers.length); i++) {
            const user = clusterUsers[i];
            const topic = topics[i];
            mockQuizzes.push({
              id: `mock-${i + 1}`,
              quiz_id: `mock-quiz-${i + 1}`,
              user_id: user.id,
              username: user.username,
              score: topic.score,
              title: topic.title,
              description: `Test your knowledge of ${topic.title.toLowerCase()}`,
              query: topic.query,
              difficulty: topic.difficulty,
              timestamp: new Date(Date.now() - 1000 * 60 * 60 * (24 * (i + 1))).toISOString()
            });
          }
        }
        
        return res.json({ 
          quizzes: mockQuizzes,
          message: `Showing demo quiz data from real users in your learning cluster (${clusterUsers.length} users)`,
          debug: {
            note: 'This uses real cluster usernames with mock quiz data for demonstration. As more users take quizzes, real quiz results will appear here.',
            clusterId: userCluster.cluster_id,
            clusterUserCount: clusterUsers.length,
            realClusterUsers: clusterUsers.map(u => ({ id: u.id, username: u.username }))
          }
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
} 