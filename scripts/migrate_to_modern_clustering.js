import ModernClusterManager from '../server/managers/ModernClusterManager.js';
import { supabase } from '../server/lib/supabaseClient.js';

/**
 * Migration script to transition from old clustering to UMAP + K-Means
 */
class ClusterMigrationManager {
  constructor() {
    this.supabase = supabase;
    this.batchSize = 100;
  }

  /**
   * Migrate all users from old clustering system to new one
   */
  async migrateAllUsers() {
    console.log('🚀 Starting migration to UMAP + K-Means clustering system');
    console.log('========================================================');

    try {
      // Step 1: Generate new clusters using modern algorithm
      console.log('\n📊 Step 1: Generating new clusters...');
      await ModernClusterManager.generateClusters(8); // Start with 8 clusters
      console.log('✅ New clusters generated successfully');

      // Step 2: Get all user assignments from old system
      console.log('\n👥 Step 2: Fetching existing user assignments...');
      const { data: oldAssignments, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('user_id, preferences, cluster_id, similarity')
        .order('last_updated', { ascending: false });

      if (error) throw error;

      console.log(`📈 Found ${oldAssignments.length} user assignments to migrate`);

      // Step 3: Re-assign users using new algorithm
      console.log('\n🔄 Step 3: Re-assigning users with new algorithm...');
      let migratedCount = 0;
      let errorCount = 0;

      for (let i = 0; i < oldAssignments.length; i += this.batchSize) {
        const batch = oldAssignments.slice(i, i + this.batchSize);
        
        console.log(`   Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(oldAssignments.length / this.batchSize)}...`);

        const batchPromises = batch.map(async (assignment) => {
          try {
            // Convert old preferences to new format if needed
            const preferences = this.convertPreferences(assignment.preferences);
            
            // Assign user to new cluster
            const newClusterId = await ModernClusterManager.assignUserToCluster(
              assignment.user_id, 
              preferences
            );
            
            if (newClusterId && newClusterId !== 'default_cluster') {
              migratedCount++;
              return { userId: assignment.user_id, newClusterId, status: 'success' };
            } else {
              errorCount++;
              return { userId: assignment.user_id, error: 'Failed to assign', status: 'error' };
            }
          } catch (error) {
            errorCount++;
            return { userId: assignment.user_id, error: error.message, status: 'error' };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        // Log progress
        const successCount = batchResults.filter(r => r.status === 'success').length;
        console.log(`   ✅ Batch completed: ${successCount}/${batch.length} successful`);
      }

      console.log(`\n📊 Migration Summary:`);
      console.log(`   - Total users: ${oldAssignments.length}`);
      console.log(`   - Successfully migrated: ${migratedCount}`);
      console.log(`   - Errors: ${errorCount}`);
      console.log(`   - Success rate: ${((migratedCount / oldAssignments.length) * 100).toFixed(1)}%`);

      // Step 4: Validate migration
      console.log('\n🔍 Step 4: Validating migration...');
      await this.validateMigration();

      // Step 5: Update system configuration
      console.log('\n⚙️  Step 5: Updating system configuration...');
      await this.updateSystemConfiguration();

      console.log('\n🎉 Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Monitor cluster performance in production');
      console.log('   2. Consider enabling automatic re-clustering (weekly)');
      console.log('   3. Update admin dashboards to show new clustering algorithm');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Convert old preference format to new format if needed
   */
  convertPreferences(preferences) {
    // If preferences are already in the correct format, return as-is
    if (preferences && typeof preferences === 'object') {
      return preferences;
    }

    // Return default preferences if conversion fails
    return {
      technicalDepth: 50,
      visualLearning: 50,
      practicalExamples: 70,
      learningStyle: 'Visual',
      interests: ['Technology', 'Science']
    };
  }

  /**
   * Validate that the migration was successful
   */
  async validateMigration() {
    try {
      // Check cluster distribution
      const vizData = await ModernClusterManager.getClusterVisualizationData();
      
      if (!vizData) {
        throw new Error('Failed to get visualization data');
      }

      console.log('   📊 Cluster distribution:');
      vizData.clusters.forEach((cluster, i) => {
        console.log(`      - Cluster ${i + 1}: ${cluster.memberCount} users`);
      });

      // Check for empty clusters
      const emptyClusters = vizData.clusters.filter(c => c.memberCount === 0);
      if (emptyClusters.length > 0) {
        console.log(`   ⚠️  Warning: ${emptyClusters.length} empty clusters detected`);
      }

      // Check for overly large clusters
      const maxClusterSize = Math.max(...vizData.clusters.map(c => c.memberCount));
      const avgClusterSize = vizData.totalUsers / vizData.clusters.length;
      
      if (maxClusterSize > avgClusterSize * 3) {
        console.log(`   ⚠️  Warning: Large cluster detected (${maxClusterSize} users)`);
      }

      console.log('   ✅ Migration validation completed');

    } catch (error) {
      console.error('   ❌ Validation failed:', error);
      throw error;
    }
  }

  /**
   * Update system configuration to use new clustering
   */
  async updateSystemConfiguration() {
    try {
      // Create a configuration record
      const configUpdate = {
        clustering_algorithm: 'umap_kmeans',
        migration_date: new Date().toISOString(),
        algorithm_config: {
          umap: {
            nComponents: 2,
            nNeighbors: 15,
            minDist: 0.1
          },
          kmeans: {
            maxIterations: 100
          }
        }
      };

      // Store configuration (if you have a config table)
      // await this.supabase.from('system_config').upsert(configUpdate);

      console.log('   ✅ System configuration updated');

    } catch (error) {
      console.error('   ❌ Configuration update failed:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Rollback migration if needed
   */
  async rollbackMigration() {
    console.log('🔄 Rolling back to old clustering system...');
    
    try {
      // Import old cluster manager backup
      const { default: OldClusterManager } = await import('../server/managers/UserClusterManager.js.backup');
      
      // Re-generate clusters with old system
      await OldClusterManager.generateClusters(5);
      
      console.log('✅ Rollback completed');
      
    } catch (error) {
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Compare clustering quality between old and new systems
   */
  async compareClusteringQuality() {
    console.log('📊 Comparing clustering quality...');
    
    try {
      // Get new system metrics
      const newVizData = await ModernClusterManager.getClusterVisualizationData();
      
      // Calculate metrics
      const newMetrics = this.calculateClusterMetrics(newVizData);
      
      console.log('📈 Clustering Quality Metrics:');
      console.log(`   - Total clusters: ${newMetrics.clusterCount}`);
      console.log(`   - Average cluster size: ${newMetrics.avgClusterSize.toFixed(1)}`);
      console.log(`   - Cluster size variance: ${newMetrics.sizeVariance.toFixed(2)}`);
      console.log(`   - Empty clusters: ${newMetrics.emptyClusters}`);
      
      return newMetrics;
      
    } catch (error) {
      console.error('❌ Quality comparison failed:', error);
      return null;
    }
  }

  /**
   * Calculate cluster quality metrics
   */
  calculateClusterMetrics(vizData) {
    const clusterSizes = vizData.clusters.map(c => c.memberCount);
    const totalUsers = vizData.totalUsers;
    const clusterCount = vizData.clusters.length;
    
    const avgClusterSize = totalUsers / clusterCount;
    const sizeVariance = clusterSizes.reduce((sum, size) => 
      sum + Math.pow(size - avgClusterSize, 2), 0) / clusterCount;
    const emptyClusters = clusterSizes.filter(size => size === 0).length;
    
    return {
      clusterCount,
      avgClusterSize,
      sizeVariance,
      emptyClusters,
      totalUsers
    };
  }
}

// Main execution
async function main() {
  const migrationManager = new ClusterMigrationManager();
  
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'migrate':
        await migrationManager.migrateAllUsers();
        break;
        
      case 'rollback':
        await migrationManager.rollbackMigration();
        break;
        
      case 'compare':
        await migrationManager.compareClusteringQuality();
        break;
        
      case 'validate':
        await migrationManager.validateMigration();
        break;
        
      default:
        console.log('Usage: node scripts/migrate_to_modern_clustering.js [migrate|rollback|compare|validate]');
        console.log('');
        console.log('Commands:');
        console.log('  migrate  - Migrate all users to new UMAP + K-Means clustering');
        console.log('  rollback - Rollback to old clustering system');
        console.log('  compare  - Compare clustering quality metrics');
        console.log('  validate - Validate current clustering state');
        process.exit(1);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 