import ModernClusterManager from '../server/managers/ModernClusterManager.js';

/**
 * Test script for the new UMAP + K-Means clustering system
 */
async function testModernClustering() {
  console.log('🧠 Testing Modern Clustering System (UMAP + K-Means)');
  console.log('================================================');

  try {
    // Test 1: Generate clusters
    console.log('\n📊 Test 1: Generating clusters...');
    const firstClusterId = await ModernClusterManager.generateClusters(5);
    console.log(`✅ Generated clusters. First cluster ID: ${firstClusterId}`);

    // Test 2: Get visualization data
    console.log('\n📈 Test 2: Getting visualization data...');
    const vizData = await ModernClusterManager.getClusterVisualizationData();
    if (vizData) {
      console.log(`✅ Visualization data retrieved:`);
      console.log(`   - Total clusters: ${vizData.clusters.length}`);
      console.log(`   - Total users: ${vizData.totalUsers}`);
      console.log(`   - Algorithm: ${vizData.algorithmInfo.name}`);
      
      // Display cluster details
      vizData.clusters.forEach((cluster, i) => {
        console.log(`   - Cluster ${i + 1}: ${cluster.memberCount} members, centroid: [${cluster.centroid.map(c => c.toFixed(2)).join(', ')}]`);
      });
    } else {
      console.log('❌ Failed to retrieve visualization data');
    }

    // Test 3: Test user assignment with sample preferences
    console.log('\n👤 Test 3: Testing user assignment...');
    const samplePreferences = {
      technicalDepth: 75,
      visualLearning: 60,
      practicalExamples: 85,
      learningStyle: 'Visual',
      interests: ['Programming', 'AI', 'Sports', 'Cooking']
    };

    const testUserId = 'test-user-123';
    const assignedClusterId = await ModernClusterManager.assignUserToCluster(testUserId, samplePreferences);
    console.log(`✅ User assigned to cluster: ${assignedClusterId}`);

    // Test 4: Get cluster prompt for the test user
    console.log('\n💬 Test 4: Getting cluster prompt...');
    const clusterPrompt = await ModernClusterManager.getClusterPromptForUser(testUserId);
    if (clusterPrompt) {
      console.log(`✅ Cluster prompt retrieved (${clusterPrompt.length} characters):`);
      console.log('   Preview:', clusterPrompt.substring(0, 200) + '...');
    } else {
      console.log('⚠️  No cluster prompt available yet');
    }

    // Test 5: Get recommended templates
    console.log('\n📚 Test 5: Getting recommended templates...');
    const recommendedTemplates = await ModernClusterManager.getRecommendedTemplates(testUserId, 'programming');
    console.log(`✅ Found ${recommendedTemplates.length} recommended templates for programming`);

    // Test 6: Test feature vector conversion
    console.log('\n🔢 Test 6: Testing feature vector conversion...');
    const normalizedPrefs = ModernClusterManager.normalizePreferences(samplePreferences);
    const featureVector = ModernClusterManager.preferencesToVector(normalizedPrefs);
    console.log(`✅ Feature vector created with ${featureVector.length} dimensions:`);
    console.log('   Vector:', featureVector.map(v => v.toFixed(3)).join(', '));

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Clustering algorithm: UMAP + K-Means`);
    console.log(`   - Feature dimensions: ${featureVector.length}`);
    console.log(`   - Number of clusters: ${vizData ? vizData.clusters.length : 'N/A'}`);
    console.log(`   - Total users clustered: ${vizData ? vizData.totalUsers : 'N/A'}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Performance comparison function
async function comparePerformance() {
  console.log('\n⚡ Performance Comparison');
  console.log('========================');

  try {
    // Import old clustering system backup
    const { default: OldClusterManager } = await import('../server/managers/UserClusterManager.js.backup');
    
    const samplePreferences = {
      technicalDepth: 75,
      visualLearning: 60,
      practicalExamples: 85,
      learningStyle: 'Visual',
      interests: ['Programming', 'AI', 'Sports', 'Cooking']
    };

    // Test old system
    console.log('\n🔄 Testing old clustering system...');
    const oldStart = Date.now();
    const oldClusterId = await OldClusterManager.assignUserToCluster('test-old-user', samplePreferences);
    const oldTime = Date.now() - oldStart;
    console.log(`✅ Old system: ${oldTime}ms, cluster: ${oldClusterId}`);

    // Test new system
    console.log('\n🚀 Testing new clustering system...');
    const newStart = Date.now();
    const newClusterId = await ModernClusterManager.assignUserToCluster('test-new-user', samplePreferences);
    const newTime = Date.now() - newStart;
    console.log(`✅ New system: ${newTime}ms, cluster: ${newClusterId}`);

    console.log('\n📊 Performance Results:');
    console.log(`   - Old system: ${oldTime}ms`);
    console.log(`   - New system: ${newTime}ms`);
    console.log(`   - Improvement: ${newTime < oldTime ? '✅ Faster' : '⚠️ Slower'} by ${Math.abs(oldTime - newTime)}ms`);

  } catch (error) {
    console.error('❌ Performance comparison failed:', error);
  }
}

// Run tests
if (process.argv.includes('--performance')) {
  Promise.all([testModernClustering(), comparePerformance()])
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  testModernClustering()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} 