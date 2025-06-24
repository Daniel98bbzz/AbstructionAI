/**
 * Test script for Real-time Clustering functionality
 * Tests the new cluster creation when queries don't match existing semantic clusters
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const SERVER_URL = 'http://localhost:3001';

async function testRealtimeClustering() {
  console.log('🚀 Testing Real-time Clustering Functionality\n');
  
  // Test queries from different domains that should create new clusters
  const testQueries = [
    {
      domain: 'Quantum Physics',
      query: 'How do quantum entangled particles maintain their connection across vast distances?',
      expected: 'Should create new cluster for quantum physics domain'
    },
    {
      domain: 'Ancient History', 
      query: 'What were the main factors that led to the fall of the Roman Empire?',
      expected: 'Should create new cluster for ancient history domain'
    },
    {
      domain: 'Marine Biology',
      query: 'How do deep-sea creatures survive in environments with extreme pressure and no sunlight?',
      expected: 'Should create new cluster for marine biology domain'
    },
    {
      domain: 'Cryptocurrency',
      query: 'What is the Byzantine Generals Problem and how does blockchain technology solve it?',
      expected: 'Should create new cluster for cryptocurrency/blockchain domain'
    }
  ];

  console.log('📊 Current semantic clusters before testing:');
  const { data: clustersBefore } = await supabase
    .from('semantic_clusters')
    .select('id, size, representative_query, clustering_version')
    .order('id');
  
  console.table(clustersBefore);
  console.log(`Total clusters before: ${clustersBefore?.length || 0}\n`);

  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    console.log(`🧪 Test ${i + 1}: ${test.domain}`);
    console.log(`Query: "${test.query}"`);
    console.log(`Expected: ${test.expected}\n`);

    try {
      // Send query to server
      const response = await fetch(`${SERVER_URL}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: test.query,
          userId: `test_user_${Date.now()}`,
          preferences: {}
        }),
      });

      if (!response.ok) {
        console.error(`❌ Server error: ${response.status} ${response.statusText}`);
        continue;
      }

      const result = await response.json();
      
      // Log crowd wisdom metadata
      if (result.crowd_wisdom) {
        console.log('🧠 Crowd Wisdom Result:');
        console.log(`  - Applied: ${result.crowd_wisdom.applied}`);
        console.log(`  - Selection Method: ${result.crowd_wisdom.selection_method}`);
        console.log(`  - Template Applied: ${result.crowd_wisdom.template_applied}`);
        
        // Check if this was a new cluster
        if (result.crowd_wisdom.selection_method === 'new_cluster_global') {
          console.log('✅ NEW CLUSTER CREATED! System detected novel domain');
        } else {
          console.log('🔄 Used existing cluster or global template');
        }
      }

      console.log(`📝 Response length: ${result.explanation?.length || 0} characters`);
      console.log(`🎯 Topic classified as: ${result.secret_topic || 'unknown'}\n`);

      // Wait a bit between requests to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Error testing ${test.domain}:`, error.message);
    }
  }

  // Check clusters after testing
  console.log('📊 Semantic clusters after testing:');
  const { data: clustersAfter } = await supabase
    .from('semantic_clusters')
    .select('id, size, representative_query, clustering_version')
    .order('id');
  
  console.table(clustersAfter);
  console.log(`Total clusters after: ${clustersAfter?.length || 0}`);
  
  const newClusters = clustersAfter?.filter(c => c.clustering_version === 'realtime') || [];
  console.log(`\n🎯 NEW REALTIME CLUSTERS CREATED: ${newClusters.length}`);
  
  if (newClusters.length > 0) {
    console.log('\n✅ Real-time clustering is working! New domains were detected and clusters created:');
    newClusters.forEach(cluster => {
      console.log(`  - Cluster ${cluster.id}: "${cluster.representative_query.substring(0, 60)}..."`);
    });
  } else {
    console.log('\n⚠️  No new realtime clusters were created. This could mean:');
    console.log('   1. The queries matched existing clusters with sufficient similarity');
    console.log('   2. There was an error in the cluster creation process');
    console.log('   3. The similarity threshold needs adjustment');
  }

  // Check for new templates created
  console.log('\n📝 Checking for auto-generated templates...');
  const { data: newTemplates } = await supabase
    .from('prompt_templates')
    .select('id, topic, source, cluster_id, created_at')
    .eq('source', 'realtime_cluster')
    .order('created_at', { ascending: false })
    .limit(10);

  if (newTemplates?.length > 0) {
    console.log(`✅ Found ${newTemplates.length} templates created for new clusters:`);
    newTemplates.forEach(template => {
      console.log(`  - Template ${template.id.substring(0, 8)}: ${template.topic} (Cluster ${template.cluster_id})`);
    });
  } else {
    console.log('⚠️  No realtime cluster templates found');
  }

  console.log('\n🎉 Real-time clustering test completed!');
}

// Run the test
testRealtimeClustering().catch(console.error); 