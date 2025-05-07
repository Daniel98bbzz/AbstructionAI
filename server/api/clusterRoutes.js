// server/api/clusterRoutes.js
// Routes for managing user clusters and viewing prompt refinement data

export default function setupClusterRoutes(app, supabase) {
  // Get all user clusters (admin only)
  app.get('/api/admin/clusters', async (req, res) => {
    try {
      // Check if user is admin
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check admin status
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
        
      if (userError || !userData || !userData.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      // Get all clusters
      const { data, error } = await supabase
        .from('user_clusters')
        .select(`
          id,
          user_id,
          cluster_type,
          cluster_score,
          last_calculated,
          created_at,
          updated_at,
          user_profiles(username)
        `)
        .order('last_calculated', { ascending: false });
        
      if (error) throw error;
      
      res.json(data || []);
    } catch (error) {
      console.error('Error getting clusters:', error);
      res.status(500).json({ error: 'Failed to get clusters' });
    }
  });
  
  // Get user's own cluster data
  app.get('/api/user/cluster', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Get user's latest cluster
      const { data, error } = await supabase
        .from('user_clusters')
        .select('*')
        .eq('user_id', userId)
        .order('last_calculated', { ascending: false })
        .limit(1)
        .single();
        
      if (error && error.code !== 'PGRST116') throw error;
      
      if (!data) {
        return res.json({ 
          message: 'No cluster data available yet',
          cluster_type: 'balanced',
          last_calculated: null
        });
      }
      
      res.json(data);
    } catch (error) {
      console.error('Error getting user cluster:', error);
      res.status(500).json({ error: 'Failed to get user cluster' });
    }
  });
  
  // Get user's prompt refinement history
  app.get('/api/user/refinements', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { limit = 10, offset = 0 } = req.query;
      
      // Get refinement history
      const { data, error } = await supabase
        .from('prompt_refinements')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) throw error;
      
      // Get total count for pagination
      const { count, error: countError } = await supabase
        .from('prompt_refinements')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
        
      if (countError) throw countError;
      
      res.json({
        refinements: data || [],
        total: count || 0
      });
    } catch (error) {
      console.error('Error getting refinement history:', error);
      res.status(500).json({ error: 'Failed to get refinement history' });
    }
  });
  
  // Manually trigger cluster recalculation
  app.post('/api/user/cluster/recalculate', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Import the Supervisor module
      const { default: Supervisor } = await import('../managers/Supervisor.js');
      const supervisor = new Supervisor();
      
      // Force recalculation by triggering getUserClusterData
      const clusterData = await supervisor.getUserClusterData(userId, true);
      
      res.json({
        message: 'Cluster recalculated successfully',
        cluster_type: clusterData.clusterType,
        last_updated: clusterData.lastUpdated
      });
    } catch (error) {
      console.error('Error recalculating cluster:', error);
      res.status(500).json({ error: 'Failed to recalculate cluster' });
    }
  });
} 