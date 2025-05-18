import express from 'express';
import UserClusterManager from '../managers/UserClusterManager.js';

const router = express.Router();
const clusterManager = UserClusterManager;

/**
 * Get all clusters with their centroids for visualization
 */
router.get('/clusters', async (req, res) => {
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
router.get('/cluster-users', async (req, res) => {
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
router.get('/user-feedback/:userId', async (req, res) => {
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

export default router; 