import { supabase } from '../server/lib/supabaseClient.js';
import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OfflineEvaluator {
  constructor() {
    this.evaluationBatchSize = 100;
    this.qualityThreshold = 0.7; // If quality drops below this, trigger rollback
  }

  /**
   * Compare two responses using OpenAI's comparison capabilities
   * @param {string} query - Original query
   * @param {string} responseV1 - Response with previous enhancement
   * @param {string} responseV2 - Response with current enhancement
   * @returns {Promise<Object>} - Comparison result
   */
  async compareResponses(query, responseV1, responseV2) {
    try {
      const prompt = `Compare these two AI responses to the query: "${query}"

Response A: ${responseV1}

Response B: ${responseV2}

Rate which response is better on a scale where:
- 1.0 = Response A is much better
- 0.8 = Response A is better
- 0.6 = Response A is slightly better
- 0.5 = Both responses are equally good
- 0.4 = Response B is slightly better
- 0.2 = Response B is better
- 0.0 = Response B is much better

Consider factors like accuracy, clarity, usefulness, and appropriateness.

Respond with JSON:
{
  "score": 0.0-1.0,
  "reasoning": "brief explanation of which is better and why",
  "qualityAssessment": {
    "responseA": 0.0-1.0,
    "responseB": 0.0-1.0
  }
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert at evaluating AI response quality.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      return JSON.parse(response.choices[0].message.content);

    } catch (error) {
      console.error('Error comparing responses:', error);
      return {
        score: 0.5, // Default to neutral if comparison fails
        reasoning: 'Comparison failed',
        qualityAssessment: { responseA: 0.5, responseB: 0.5 }
      };
    }
  }

  /**
   * Simulate response with a specific prompt enhancement version
   * @param {string} query - Query text
   * @param {string} enhancement - Prompt enhancement
   * @returns {Promise<string>} - Simulated response
   */
  async simulateResponse(query, enhancement) {
    try {
      const systemPrompt = enhancement 
        ? `You are a helpful AI assistant. ${enhancement}`
        : 'You are a helpful AI assistant.';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      return response.choices[0].message.content;

    } catch (error) {
      console.error('Error simulating response:', error);
      return 'Error generating response';
    }
  }

  /**
   * Get clusters that need evaluation (version > 1)
   * @returns {Promise<Array>} - Clusters to evaluate
   */
  async getClustersForEvaluation() {
    const { data: clusters, error } = await supabase
      .from('crowd_wisdom_clusters')
      .select(`
        id,
        cluster_name,
        representative_query,
        prompt_enhancement,
        prompt_enhancement_version,
        total_queries,
        success_rate
      `)
      .gt('prompt_enhancement_version', 1)
      .gt('total_queries', 5) // Only evaluate clusters with enough data
      .order('updated_at', { ascending: false })
      .limit(10); // Limit for nightly batch

    if (error) {
      console.error('Error fetching clusters for evaluation:', error);
      return [];
    }

    return clusters || [];
  }

  /**
   * Get previous version of enhancement for a cluster
   * @param {string} clusterId - Cluster ID
   * @returns {Promise<string>} - Previous enhancement version
   */
  async getPreviousEnhancement(clusterId) {
    // Look for previous enhancement in learning logs
    const { data: logs, error } = await supabase
      .from('crowd_wisdom_learning_logs')
      .select('prompt_update')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(2); // Get last 2 updates

    if (error || !logs || logs.length < 2) {
      return ''; // Return empty if no previous version
    }

    // Return the second-to-last enhancement
    const previousLog = logs[1];
    return previousLog.prompt_update?.prompt_text || '';
  }

  /**
   * Get sample queries for a cluster
   * @param {string} clusterId - Cluster ID
   * @param {number} limit - Number of queries to fetch
   * @returns {Promise<Array>} - Sample queries
   */
  async getSampleQueries(clusterId, limit = 10) {
    const { data: assignments, error } = await supabase
      .from('crowd_wisdom_query_assignments')
      .select('query_text')
      .eq('cluster_id', clusterId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching sample queries:', error);
      return [];
    }

    return (assignments || []).map(a => a.query_text);
  }

  /**
   * Evaluate a cluster and determine if rollback is needed
   * @param {Object} cluster - Cluster data
   * @returns {Promise<Object>} - Evaluation result
   */
  async evaluateCluster(cluster) {
    console.log(`\n🔍 Evaluating cluster: ${cluster.cluster_name}`);
    console.log(`Current version: ${cluster.prompt_enhancement_version}`);

    // Get previous enhancement version
    const previousEnhancement = await this.getPreviousEnhancement(cluster.id);
    const currentEnhancement = cluster.prompt_enhancement;

    console.log(`Previous enhancement: ${previousEnhancement.length} chars`);
    console.log(`Current enhancement: ${currentEnhancement.length} chars`);

    // Get sample queries for evaluation
    const sampleQueries = await this.getSampleQueries(cluster.id, 10);
    
    if (sampleQueries.length === 0) {
      console.log('⚠️  No sample queries found for evaluation');
      return {
        clusterId: cluster.id,
        needsRollback: false,
        reason: 'No sample queries',
        averageScore: 0.5
      };
    }

    console.log(`Testing with ${sampleQueries.length} sample queries...`);

    // Compare responses for each sample query
    const comparisons = [];
    
    for (let i = 0; i < Math.min(sampleQueries.length, 5); i++) { // Limit to 5 for cost control
      const query = sampleQueries[i];
      console.log(`Comparing query ${i + 1}: "${query.substring(0, 50)}..."`);

      // Generate responses with both enhancement versions
      const [responseV1, responseV2] = await Promise.all([
        this.simulateResponse(query, previousEnhancement),
        this.simulateResponse(query, currentEnhancement)
      ]);

      // Compare the responses
      const comparison = await this.compareResponses(query, responseV1, responseV2);
      comparisons.push({
        query,
        comparison,
        responseV1Length: responseV1.length,
        responseV2Length: responseV2.length
      });

      console.log(`Score: ${comparison.score} (${comparison.reasoning})`);
    }

    // Calculate average quality
    const averageScore = comparisons.reduce((sum, c) => sum + c.comparison.score, 0) / comparisons.length;
    const needsRollback = averageScore > (1 - this.qualityThreshold); // If V1 is significantly better

    console.log(`📊 Average score: ${averageScore.toFixed(3)} (${needsRollback ? 'ROLLBACK NEEDED' : 'CURRENT VERSION OK'})`);

    return {
      clusterId: cluster.id,
      clusterName: cluster.cluster_name,
      currentVersion: cluster.prompt_enhancement_version,
      needsRollback,
      averageScore,
      reason: needsRollback ? 'Quality degradation detected' : 'Quality maintained',
      comparisons: comparisons.length,
      threshold: this.qualityThreshold
    };
  }

  /**
   * Rollback cluster to previous enhancement version
   * @param {string} clusterId - Cluster ID
   * @param {string} previousEnhancement - Previous enhancement text
   * @returns {Promise<boolean>} - Success status
   */
  async rollbackCluster(clusterId, previousEnhancement) {
    try {
      const { error } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          prompt_enhancement: previousEnhancement,
          prompt_enhancement_version: 1, // Reset to version 1
          updated_at: new Date().toISOString()
        })
        .eq('id', clusterId);

      if (error) {
        console.error('Error rolling back cluster:', error);
        return false;
      }

      // Log the rollback event
      await supabase
        .from('crowd_wisdom_learning_logs')
        .insert([
          {
            cluster_id: clusterId,
            extracted_patterns: { rollback: true, reason: 'Quality degradation' },
            prompt_update: {
              prompt_text: previousEnhancement,
              rollback: true,
              generated_at: new Date().toISOString()
            },
            confidence_score: 0.8,
            learning_trigger: 'offline_evaluation_rollback'
          }
        ]);

      return true;

    } catch (error) {
      console.error('Error during rollback:', error);
      return false;
    }
  }

  /**
   * Run full offline evaluation process
   * @returns {Promise<Object>} - Evaluation summary
   */
  async runEvaluation() {
    console.log('🌙 Starting Offline Evaluation Process\n');

    const clusters = await this.getClustersForEvaluation();
    console.log(`Found ${clusters.length} clusters to evaluate\n`);

    if (clusters.length === 0) {
      console.log('✅ No clusters need evaluation at this time');
      return { clustersEvaluated: 0, rollbacksPerformed: 0 };
    }

    const results = [];
    let rollbacksPerformed = 0;

    for (const cluster of clusters) {
      try {
        const evaluation = await this.evaluateCluster(cluster);
        results.push(evaluation);

        if (evaluation.needsRollback) {
          console.log(`🔄 Rolling back cluster: ${cluster.cluster_name}`);
          
          const previousEnhancement = await this.getPreviousEnhancement(cluster.id);
          const rollbackSuccess = await this.rollbackCluster(cluster.id, previousEnhancement);
          
          if (rollbackSuccess) {
            console.log(`✅ Rollback completed for ${cluster.cluster_name}`);
            rollbacksPerformed++;
          } else {
            console.log(`❌ Rollback failed for ${cluster.cluster_name}`);
          }
        }

      } catch (error) {
        console.error(`Error evaluating cluster ${cluster.cluster_name}:`, error);
      }
    }

    // Summary
    console.log('\n📋 Evaluation Summary:');
    console.log(`Clusters evaluated: ${results.length}`);
    console.log(`Rollbacks performed: ${rollbacksPerformed}`);
    console.log(`Average quality scores:`);
    
    results.forEach(result => {
      console.log(`  ${result.clusterName}: ${result.averageScore.toFixed(3)} ${result.needsRollback ? '(ROLLED BACK)' : ''}`);
    });

    return {
      clustersEvaluated: results.length,
      rollbacksPerformed,
      results
    };
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const evaluator = new OfflineEvaluator();
  evaluator.runEvaluation().catch(console.error);
}

export default OfflineEvaluator; 