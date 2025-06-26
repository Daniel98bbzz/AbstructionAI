#!/usr/bin/env node

/**
 * Scheduled Cluster Recalculation Job
 * 
 * This script performs periodic recalculation of user clusters based on updated
 * activity and feedback data. It can be run manually or scheduled via cron.
 * 
 * Usage:
 *   node scripts/reclusterJob.js [options]
 * 
 * Options:
 *   --clusters N         Number of clusters to generate (default: 5)
 *   --no-activity        Exclude recent activity data
 *   --no-feedback        Exclude feedback data
 *   --dry-run           Simulate without making changes
 *   --verbose           Enable verbose logging
 * 
 * Example cron job (daily at 2 AM):
 *   0 2 * * * cd /path/to/project && node scripts/reclusterJob.js --verbose
 */

import ModernClusterManager from '../server/managers/ModernClusterManager.js';
import { supabase } from '../server/lib/supabaseClient.js';

class ReclusterJob {
  constructor(options = {}) {
    this.options = {
      numClusters: 5,
      includeRecentActivity: true,
      includeFeedback: true,
      dryRun: false,
      verbose: false,
      ...options
    };
    
    this.clusterManager = ModernClusterManager;
    this.clusterManager.supabase = supabase;
  }

  /**
   * Parse command line arguments
   */
  static parseArgs() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--clusters':
          options.numClusters = parseInt(args[++i]) || 5;
          break;
        case '--no-activity':
          options.includeRecentActivity = false;
          break;
        case '--no-feedback':
          options.includeFeedback = false;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--help':
          console.log(`
Scheduled Cluster Recalculation Job

Usage: node scripts/reclusterJob.js [options]

Options:
  --clusters N         Number of clusters to generate (default: 5)
  --no-activity        Exclude recent activity data
  --no-feedback        Exclude feedback data
  --dry-run           Simulate without making changes
  --verbose           Enable verbose logging
  --help              Show this help message

Example:
  node scripts/reclusterJob.js --clusters 8 --verbose
          `);
          process.exit(0);
        default:
          console.warn(`Unknown argument: ${arg}`);
      }
    }

    return options;
  }

  /**
   * Log message based on verbosity setting
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [RECLUSTER-JOB]`;
    
    if (level === 'error' || this.options.verbose) {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Check if reclustering should be performed
   */
  async shouldRecluster() {
    try {
      this.log('Checking if reclustering is needed...');

      // Get current cluster status
      const { data: clusters, error: clusterError } = await supabase
        .from('user_clusters')
        .select('created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(1);

      if (clusterError) {
        this.log(`Error fetching cluster data: ${clusterError.message}`, 'error');
        return false;
      }

      // Check if clusters exist and when they were last updated
      const lastClustering = clusters?.[0];
      if (!lastClustering) {
        this.log('No existing clusters found, reclustering needed');
        return true;
      }

      // Check if clusters are older than 7 days
      const lastUpdate = new Date(lastClustering.created_at);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 7) {
        this.log(`Clusters are ${daysSinceUpdate.toFixed(1)} days old, reclustering needed`);
        return true;
      }

      // Check user activity levels
      const { data: recentSessions, error: sessionError } = await supabase
        .from('sessions')
        .select('user_id', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (!sessionError && recentSessions.count > 10) {
        this.log(`High recent activity (${recentSessions.count} sessions), reclustering beneficial`);
        return true;
      }

      this.log(`Clusters are recent (${daysSinceUpdate.toFixed(1)} days old), skipping reclustering`);
      return false;

    } catch (error) {
      this.log(`Error checking recluster conditions: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Validate system readiness for reclustering
   */
  async validateSystem() {
    try {
      this.log('Validating system readiness...');

      // Check user count
      const { data: users, error: userError } = await supabase
        .from('user_cluster_assignments')
        .select('user_id', { count: 'exact' });

      if (userError) {
        throw new Error(`Cannot access user assignments: ${userError.message}`);
      }

      const userCount = users.count || 0;
      const minUsers = this.options.numClusters * 2;

      if (userCount < minUsers) {
        throw new Error(`Insufficient users: ${userCount} (need at least ${minUsers})`);
      }

      this.log(`System validation passed: ${userCount} users available`);
      return true;

    } catch (error) {
      this.log(`System validation failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Perform the reclustering operation
   */
  async performReclustering() {
    try {
      this.log('Starting cluster recalculation...');
      
      if (this.options.dryRun) {
        this.log('DRY RUN MODE: Simulating reclustering operation');
        return {
          success: true,
          dryRun: true,
          message: 'Dry run completed - no changes made'
        };
      }

      const startTime = Date.now();
      
      const results = await this.clusterManager.recalculateClusters({
        numClusters: this.options.numClusters,
        includeRecentActivity: this.options.includeRecentActivity,
        includeFeedback: this.options.includeFeedback
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (results.success) {
        this.log(`Reclustering completed successfully in ${duration}s`);
        this.log(`Generated ${results.clustersGenerated} clusters for ${results.usersProcessed} users`);
        
        return {
          success: true,
          duration: `${duration}s`,
          ...results
        };
      } else {
        this.log(`Reclustering failed: ${results.error}`, 'error');
        return results;
      }

    } catch (error) {
      this.log(`Error during reclustering: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send notification about job completion (placeholder for future implementation)
   */
  async sendNotification(results) {
    // Placeholder for notifications (email, Slack, etc.)
    // This could be implemented to notify administrators about job status
    
    if (this.options.verbose) {
      this.log('Notification placeholder - implement as needed');
      this.log(`Job completed with status: ${results.success ? 'SUCCESS' : 'FAILURE'}`);
    }
  }

  /**
   * Run the complete reclustering job
   */
  async run() {
    const startTime = Date.now();
    
    this.log('='.repeat(60));
    this.log('Starting Scheduled Cluster Recalculation Job');
    this.log(`Options: ${JSON.stringify(this.options)}`);
    this.log('='.repeat(60));

    try {
      // Step 1: Check if reclustering is needed
      const shouldRecluster = await this.shouldRecluster();
      if (!shouldRecluster) {
        this.log('Reclustering not needed at this time');
        return { success: true, skipped: true, reason: 'Not needed' };
      }

      // Step 2: Validate system readiness
      const systemReady = await this.validateSystem();
      if (!systemReady) {
        return { success: false, error: 'System validation failed' };
      }

      // Step 3: Perform reclustering
      const results = await this.performReclustering();

      // Step 4: Send notifications
      await this.sendNotification(results);

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.log(`Job completed in ${totalDuration}s`);
      this.log('='.repeat(60));

      return results;

    } catch (error) {
      this.log(`Job failed with error: ${error.message}`, 'error');
      await this.sendNotification({ success: false, error: error.message });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Main execution when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = ReclusterJob.parseArgs();
  const job = new ReclusterJob(options);
  
  job.run()
    .then(results => {
      if (results.success) {
        console.log('✅ Reclustering job completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Reclustering job failed:', results.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

export default ReclusterJob; 