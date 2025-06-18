// server-integration.js
import express from 'express';
import ModernClusterManager from './server/managers/ModernClusterManager.js';
import { runClusteringTest, cleanupTestData } from './test-clustering.js';
import { supabase } from './server/lib/supabaseClient.js';
import dotenv from 'dotenv';
dotenv.config();

// Create router for cluster visualization endpoints
const router = express.Router();

// Add CORS headers to all responses
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Get all clusters
router.get('/api/clusters', async (req, res) => {
  try {
    // Get all clusters from the database
    const { data: clusters, error } = await supabase
      .from('user_clusters')
      .select('*');
      
    if (error) throw error;
    
    res.json({ clusters: clusters || [] });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch clusters', message: error.message });
  }
});

// Get users in clusters
router.get('/api/cluster-users', async (req, res) => {
  try {
    // Get all user assignments
    const { data: assignments, error } = await supabase
      .from('user_cluster_assignments')
      .select('*');
      
    if (error) throw error;
    
    // Format user data to match what the visualization expects
    const formattedUsers = assignments.map(user => {
      // Make sure preferences has expected structure
      if (user.preferences) {
        if (!user.preferences.interests && user.preferences.interest_weights) {
          // Convert interest_weights to interests array
          user.preferences.interests = Object.entries(user.preferences.interest_weights)
            .filter(([_, weight]) => weight > 0)
            .map(([interest]) => interest.charAt(0).toUpperCase() + interest.slice(1));
        }
        
        // Convert learning style weights to learning_style if missing
        if (!user.preferences.learning_style && user.preferences.learning_style_weights) {
          // Get the dominant learning style
          const styles = Object.entries(user.preferences.learning_style_weights)
            .sort((a, b) => b[1] - a[1]);
          
          if (styles.length > 0) {
            user.preferences.learning_style = styles[0][0].charAt(0).toUpperCase() + styles[0][0].slice(1);
          }
        }
      }
      
      return user;
    });
    
    res.json({ users: formattedUsers || [] });
  } catch (error) {
    console.error('Error fetching cluster users:', error);
    res.status(500).json({ error: 'Failed to fetch cluster users', message: error.message });
  }
});

// Generate new clusters
router.post('/api/generate-clusters', async (req, res) => {
  try {
    const { k = 3, method = 'k_means' } = req.body || {};
    
    console.log(`Generating ${k} clusters using ${method}...`);
    const firstClusterId = await ModernClusterManager.generateClusters(k);
    
    res.json({ 
      success: true, 
      message: `Generated ${k} clusters successfully`,
      firstClusterId
    });
  } catch (error) {
    console.error('Error generating clusters:', error);
    res.status(500).json({ error: 'Failed to generate clusters', message: error.message });
  }
});

// Run clustering test
router.post('/api/run-clustering-test', async (req, res) => {
  try {
    console.log('Running clustering test...');
    await runClusteringTest();
    
    res.json({ 
      success: true, 
      message: 'Clustering test completed successfully'
    });
  } catch (error) {
    console.error('Error running clustering test:', error);
    res.status(500).json({ error: 'Failed to run clustering test', message: error.message });
  }
});

// Clean up test data
router.post('/api/cleanup-test-data', async (req, res) => {
  try {
    console.log('Cleaning up test data...');
    await cleanupTestData();
    
    res.json({ 
      success: true, 
      message: 'Test data cleaned up successfully'
    });
  } catch (error) {
    console.error('Error cleaning up test data:', error);
    res.status(500).json({ error: 'Failed to clean up test data', message: error.message });
  }
});

// Serve the visualization page directly
router.get('/cluster-visualization', (req, res) => {
  res.sendFile('cluster-visualization.html', { root: process.cwd() });
});

export default router; 