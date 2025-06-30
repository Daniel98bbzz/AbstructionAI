import { supabase } from '../server/lib/supabaseClient.js';

/**
 * Enhancement Monitoring and Evaluation Script
 * 
 * This script provides comprehensive monitoring and evaluation of prompt enhancements
 * including success rate comparisons, token economics, and trend analysis.
 */

class EnhancementMonitor {
  constructor() {
    this.supabase = supabase;
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData() {
    try {
      const { data, error } = await this.supabase
        .from('enhancement_evaluation_dashboard')
        .select('*');

      if (error) throw error;

      return {
        success: true,
        data,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get time-series data for trend analysis
   */
  async getTimeSeriesData(hoursBack = 24) {
    try {
      const { data, error } = await this.supabase
        .from('enhancement_timeseries_hourly')
        .select('*')
        .gte('time_bucket', new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString())
        .order('time_bucket', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data,
        hoursBack,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching time-series data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a comprehensive report
   */
  async generateReport() {
    console.log('📊 Enhancement Evaluation Report');
    console.log('=====================================');
    console.log(`Generated at: ${new Date().toISOString()}\n`);

    // Dashboard overview
    const dashboard = await this.getDashboardData();
    if (dashboard.success) {
      console.log('🎯 CLUSTER PERFORMANCE OVERVIEW');
      console.log('-------------------------------');
      
      dashboard.data.forEach((cluster, index) => {
        console.log(`\n${index + 1}. ${cluster.cluster_name}`);
        console.log(`   Query: ${cluster.representative_query_preview}`);
        console.log(`   Total Queries: ${cluster.total_queries} (Enhanced: ${cluster.enhanced_queries}, Non-enhanced: ${cluster.non_enhanced_queries})`);
        console.log(`   Enhancement Adoption: ${cluster.enhancement_adoption_pct}%`);
        console.log(`   Status: ${cluster.evaluation_status}`);
        
        if (cluster.enhanced_success_rate_pct !== null) {
          console.log(`   Enhanced Success Rate: ${cluster.enhanced_success_rate_pct}%`);
        }
        
        if (cluster.non_enhanced_success_rate_pct !== null) {
          console.log(`   Non-Enhanced Success Rate: ${cluster.non_enhanced_success_rate_pct}%`);
        }
        
        if (cluster.success_rate_improvement_pct !== null) {
          const improvement = cluster.success_rate_improvement_pct;
          const emoji = improvement > 0 ? '📈' : improvement < 0 ? '📉' : '➡️';
          console.log(`   ${emoji} Success Rate Change: ${improvement > 0 ? '+' : ''}${improvement}%`);
        }
        
        if (cluster.total_enhancement_tokens > 0) {
          console.log(`   Token Usage: ${cluster.total_enhancement_tokens} total (avg: ${cluster.avg_tokens_per_enhancement} per enhancement)`);
        }
        
        console.log(`   Feedback Coverage: ${cluster.feedback_coverage_pct}%`);
      });
    }

    // Time-series trends
    const timeSeries = await this.getTimeSeriesData(24);
    if (timeSeries.success && timeSeries.data.length > 0) {
      console.log('\n\n📈 24-HOUR TRENDS');
      console.log('------------------');
      
      const latest = timeSeries.data[0];
      const earliest = timeSeries.data[timeSeries.data.length - 1];
      
      console.log(`📊 Current Hour (${new Date(latest.time_bucket).toLocaleString()}):`);
      console.log(`   • Queries: ${latest.total_queries} (${latest.enhanced_queries} enhanced, ${latest.non_enhanced_queries} non-enhanced)`);
      console.log(`   • Enhancement Rate: ${latest.enhancement_adoption_rate_pct}%`);
      console.log(`   • Tokens Added: ${latest.total_tokens_added}`);
      console.log(`   • Avg Similarity: ${latest.avg_similarity}`);
      
      if (latest.enhanced_success_rate_pct !== null) {
        console.log(`   • Enhanced Success Rate: ${latest.enhanced_success_rate_pct}%`);
      }
      
      if (latest.non_enhanced_success_rate_pct !== null) {
        console.log(`   • Non-Enhanced Success Rate: ${latest.non_enhanced_success_rate_pct}%`);
      }
      
      console.log(`\n📈 Cumulative (24h):`);
      console.log(`   • Total Queries: ${latest.cumulative_queries}`);
      console.log(`   • Total Enhanced: ${latest.cumulative_enhanced}`);
      console.log(`   • Total Tokens: ${latest.cumulative_tokens}`);
      console.log(`   • Overall Enhancement Rate: ${((latest.cumulative_enhanced / latest.cumulative_queries) * 100).toFixed(1)}%`);
    }

    return {
      dashboard: dashboard.success ? dashboard.data : null,
      timeSeries: timeSeries.success ? timeSeries.data : null,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Check for clusters ready for evaluation
   */
  async getClustersReadyForEvaluation() {
    try {
      const { data, error } = await this.supabase
        .from('enhancement_evaluation_dashboard')
        .select('*')
        .eq('evaluation_status', 'Can compare success rates');

      if (error) throw error;

      return {
        success: true,
        data,
        count: data.length
      };
    } catch (error) {
      console.error('Error checking clusters ready for evaluation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get enhancement economics summary
   */
  async getEnhancementEconomics() {
    try {
      const { data, error } = await this.supabase
        .rpc('get_enhancement_economics', {});

      if (error) {
        // If RPC doesn't exist, calculate manually
        const { data: rawData, error: queryError } = await this.supabase
          .from('enhancement_evaluation_dashboard')
          .select('*');

        if (queryError) throw queryError;

        const totalTokens = rawData.reduce((sum, cluster) => sum + (cluster.total_enhancement_tokens || 0), 0);
        const totalEnhancedQueries = rawData.reduce((sum, cluster) => sum + cluster.enhanced_queries, 0);
        const avgTokensPerEnhancement = totalEnhancedQueries > 0 ? (totalTokens / totalEnhancedQueries).toFixed(1) : 0;

        return {
          success: true,
          data: {
            total_enhancement_tokens: totalTokens,
            total_enhanced_queries: totalEnhancedQueries,
            avg_tokens_per_enhancement: parseFloat(avgTokensPerEnhancement),
            estimated_cost_usd: (totalTokens * 0.00001).toFixed(4) // Rough estimate
          }
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error('Error calculating enhancement economics:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Export data for external visualization tools
   */
  async exportForVisualization(format = 'json') {
    const report = await this.generateReport();
    const economics = await this.getEnhancementEconomics();

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        format,
        version: '1.0'
      },
      dashboard: report.dashboard,
      timeSeries: report.timeSeries,
      economics: economics.success ? economics.data : null
    };

    if (format === 'csv') {
      // Convert to CSV format for easy import into external tools
      return this.convertToCSV(exportData);
    }

    return exportData;
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    const csvData = [];
    
    // Dashboard data
    if (data.dashboard) {
      csvData.push('# Dashboard Data');
      csvData.push('cluster_name,total_queries,enhanced_queries,enhancement_adoption_pct,enhanced_success_rate_pct,non_enhanced_success_rate_pct,success_rate_improvement_pct,total_enhancement_tokens,feedback_coverage_pct');
      
      data.dashboard.forEach(cluster => {
        csvData.push([
          cluster.cluster_name,
          cluster.total_queries,
          cluster.enhanced_queries,
          cluster.enhancement_adoption_pct,
          cluster.enhanced_success_rate_pct || '',
          cluster.non_enhanced_success_rate_pct || '',
          cluster.success_rate_improvement_pct || '',
          cluster.total_enhancement_tokens,
          cluster.feedback_coverage_pct
        ].join(','));
      });
    }

    // Time series data
    if (data.timeSeries) {
      csvData.push('\n# Time Series Data');
      csvData.push('time_bucket,total_queries,enhanced_queries,enhancement_adoption_rate_pct,enhanced_success_rate_pct,non_enhanced_success_rate_pct,total_tokens_added,cumulative_queries,cumulative_enhanced,cumulative_tokens');
      
      data.timeSeries.forEach(point => {
        csvData.push([
          point.time_bucket,
          point.total_queries,
          point.enhanced_queries,
          point.enhancement_adoption_rate_pct,
          point.enhanced_success_rate_pct || '',
          point.non_enhanced_success_rate_pct || '',
          point.total_tokens_added,
          point.cumulative_queries,
          point.cumulative_enhanced,
          point.cumulative_tokens
        ].join(','));
      });
    }

    return csvData.join('\n');
  }
}

// Main execution
async function main() {
  const monitor = new EnhancementMonitor();
  
  if (process.argv.includes('--report')) {
    await monitor.generateReport();
  } else if (process.argv.includes('--export-csv')) {
    const csvData = await monitor.exportForVisualization('csv');
    console.log(csvData);
  } else if (process.argv.includes('--export-json')) {
    const jsonData = await monitor.exportForVisualization('json');
    console.log(JSON.stringify(jsonData, null, 2));
  } else if (process.argv.includes('--economics')) {
    const economics = await monitor.getEnhancementEconomics();
    console.log('💰 Enhancement Economics:');
    console.log(JSON.stringify(economics.data, null, 2));
  } else {
    console.log('Enhancement Monitor Commands:');
    console.log('  --report         Generate comprehensive report');
    console.log('  --export-csv     Export data in CSV format');
    console.log('  --export-json    Export data in JSON format');
    console.log('  --economics      Show token economics summary');
  }
}

// Export for use as module
export default EnhancementMonitor;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
} 