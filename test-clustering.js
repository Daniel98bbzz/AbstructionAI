import dotenv from 'dotenv';
dotenv.config();

// Test script for user preference clustering functionality
import { supabase } from './server/lib/supabaseClient.js';
import ModernClusterManager from './server/managers/ModernClusterManager.js';
import crypto from 'crypto';

// Sample user preferences for testing
const testUsers = [
  {
    id: 'test_user_1',
    preferences: {
      technicalDepth: 80,
      visualLearning: 30,
      practicalExamples: 70,
      learning_style: 'Reading/Writing',
      interests: ['Mathematics', 'Physics', 'Programming'],
      preferred_analogy_domains: ['Technology', 'Science']
    }
  },
  {
    id: 'test_user_2',
    preferences: {
      technicalDepth: 75,
      visualLearning: 40,
      practicalExamples: 65,
      learning_style: 'Reading/Writing',
      interests: ['Computer Science', 'Mathematics', 'Data Science'],
      preferred_analogy_domains: ['Technology', 'Business']
    }
  },
  {
    id: 'test_user_3',
    preferences: {
      technicalDepth: 40,
      visualLearning: 80,
      practicalExamples: 90,
      learning_style: 'Visual',
      interests: ['Art', 'Design', 'Creative Writing'],
      preferred_analogy_domains: ['Art', 'Nature', 'Food']
    }
  },
  {
    id: 'test_user_4',
    preferences: {
      technicalDepth: 30,
      visualLearning: 85,
      practicalExamples: 75,
      learning_style: 'Visual',
      interests: ['Photography', 'Music', 'Design'],
      preferred_analogy_domains: ['Art', 'Music', 'Gaming']
    }
  }
];

// Test topics
const testTopics = ['mathematics', 'computer_science', 'art', 'physics'];

// Main testing function
async function runClusteringTest() {
  console.log('========= STARTING USER CLUSTERING TEST =========');
  
  try {
    // Step 1: Create test tables if they don't exist
    await createTestTablesIfNeeded();
    
    // Step 2: Assign users to clusters
    console.log('\n=== ASSIGNING USERS TO CLUSTERS ===');
    const clusterAssignments = await assignUsersToCluster();
    
    // Step 3: Create some dummy templates for testing
    console.log('\n=== CREATING TEST TEMPLATES ===');
    const templateIds = await createTestTemplates();
    
    // Step 4: Simulate template usage and feedback
    console.log('\n=== SIMULATING TEMPLATE USAGE AND FEEDBACK ===');
    await simulateUsageAndFeedback(clusterAssignments, templateIds);
    
    // Step 5: Test k-means clustering
    console.log('\n=== TESTING K-MEANS CLUSTERING ===');
    await testKMeansClustering();
    
    console.log('\n========= USER CLUSTERING TEST COMPLETED SUCCESSFULLY =========');
    return true;
  } catch (error) {
    console.error('Error during clustering test:', error);
    throw error;
  }
}

// Create test tables if they don't exist
async function createTestTablesIfNeeded() {
  console.log('Checking if test tables exist...');
  
  try {
    // Use a single command to check if table exists and create if not
    const checkUserClusters = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'user_clusters') THEN
          CREATE TABLE user_clusters (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT now(),
            centroid JSONB NOT NULL,
            member_count INTEGER DEFAULT 0,
            metadata JSONB
          );
        END IF;
      END
      $$;
    `;
    
    try {
      await supabase.rpc('exec_sql', { sql: checkUserClusters });
    } catch (err) {
      console.log('Error checking/creating user_clusters:', err);
    }
    
    console.log('user_clusters table checked/created.');
    
    // Check user_cluster_assignments
    const checkAssignments = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'user_cluster_assignments') THEN
          CREATE TABLE user_cluster_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            cluster_id UUID NOT NULL REFERENCES user_clusters(id),
            similarity NUMERIC NOT NULL,
            preferences JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            last_updated TIMESTAMPTZ DEFAULT now()
          );
        END IF;
      END
      $$;
    `;
    
    try {
      await supabase.rpc('exec_sql', { sql: checkAssignments });
    } catch (err) {
      console.log('Error checking/creating user_cluster_assignments:', err);
    }
    
    console.log('user_cluster_assignments table checked/created.');
    
    // Check prompt_templates
    const checkTemplates = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'prompt_templates') THEN
          CREATE TABLE prompt_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ DEFAULT now(),
            topic VARCHAR NOT NULL,
            template_text TEXT NOT NULL,
            source VARCHAR NOT NULL,
            efficacy_score NUMERIC DEFAULT 0,
            usage_count INTEGER DEFAULT 0,
            quality_score NUMERIC DEFAULT 0,
            confusion_score NUMERIC DEFAULT 0,
            follow_up_rate NUMERIC DEFAULT 0,
            confidence_score NUMERIC DEFAULT 0,
            component_rating JSONB DEFAULT '{}',
            composite_quality_score NUMERIC DEFAULT 0,
            quality_score_metadata JSONB,
            metadata JSONB
          );
        END IF;
      END
      $$;
    `;
    
    try {
      await supabase.rpc('exec_sql', { sql: checkTemplates });
    } catch (err) {
      console.log('Error checking/creating prompt_templates:', err);
    }
    
    console.log('prompt_templates table checked/created.');
    
    // Check prompt_template_usage
    const checkUsage = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'prompt_template_usage') THEN
          CREATE TABLE prompt_template_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID NOT NULL,
            session_id UUID,
            user_id TEXT,
            query TEXT NOT NULL,
            response_id UUID,
            feedback_score INTEGER,
            created_at TIMESTAMPTZ DEFAULT now()
          );
        END IF;
      END
      $$;
    `;
    
    try {
      await supabase.rpc('exec_sql', { sql: checkUsage });
    } catch (err) {
      console.log('Error checking/creating prompt_template_usage:', err);
    }
    
    console.log('prompt_template_usage table checked/created.');
    
    // Check cluster_template_recommendations
    const checkRecommendations = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'cluster_template_recommendations') THEN
          CREATE TABLE cluster_template_recommendations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            cluster_id UUID NOT NULL REFERENCES user_clusters(id),
            template_id UUID NOT NULL,
            topic VARCHAR NOT NULL,
            score NUMERIC NOT NULL,
            usage_count INTEGER DEFAULT 0,
            success_rate NUMERIC DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            last_updated TIMESTAMPTZ DEFAULT now()
          );
        END IF;
      END
      $$;
    `;
    
    try {
      await supabase.rpc('exec_sql', { sql: checkRecommendations });
    } catch (err) {
      console.log('Error checking/creating cluster_template_recommendations:', err);
    }
    
    console.log('cluster_template_recommendations table checked/created.');
    
    // Create a default cluster if none exists 
    const defaultCluster = {
      centroid: {
        technical_depth: 0.5,
        visual_learning: 0.5,
        practical_examples: 0.5,
        learning_style_weights: {
          visual: 0.5,
          auditory: 0.5,
          reading: 0.5,
          kinesthetic: 0.5
        },
        interest_weights: {
          science: 0.5,
          technology: 0.5,
          engineering: 0.5,
          math: 0.5,
          arts: 0.5
        }
      },
      member_count: 0,
      metadata: {
        creation_method: 'test',
        description: 'Default test cluster'
      }
    };
    
    const { data: existingClusters } = await supabase
      .from('user_clusters')
      .select('id')
      .limit(1);
    
    if (!existingClusters || existingClusters.length === 0) {
      console.log('Creating a default cluster for testing');
      await supabase.from('user_clusters').insert([defaultCluster]);
    }
    
  } catch (error) {
    console.error('Error in createTestTablesIfNeeded:', error);
  }
}

// Assign test users to clusters
async function assignUsersToCluster() {
  console.log('Assigning test users to clusters...');
  
  const clusterAssignments = {};
  
  for (const user of testUsers) {
    console.log(`\nAssigning user ${user.id} to a cluster...`);
    console.log('User preferences:', user.preferences);
    
    try {
      const clusterId = await ModernClusterManager.assignUserToCluster(
        user.id, 
        user.preferences
      );
      
      console.log(`User ${user.id} assigned to cluster: ${clusterId}`);
      clusterAssignments[user.id] = clusterId;
      
      // Get cluster details
      const { data: cluster, error } = await supabase
        .from('user_clusters')
        .select('*')
        .eq('id', clusterId)
        .single();
      
      if (error) throw error;
      
      console.log(`Cluster details for ${clusterId}:`);
      console.log('- Member count:', cluster.member_count);
      console.log('- Creation method:', cluster.metadata?.creation_method || 'unknown');
      
      // Print normalized centroid values
      if (cluster.centroid) {
        console.log('- Centroid values:');
        console.log(`  - Technical depth: ${(cluster.centroid.technical_depth * 100).toFixed(0)}/100`);
        console.log(`  - Visual learning: ${(cluster.centroid.visual_learning * 100).toFixed(0)}/100`);
        console.log(`  - Practical examples: ${(cluster.centroid.practical_examples * 100).toFixed(0)}/100`);
      }
    } catch (error) {
      console.error(`Error assigning user ${user.id} to cluster:`, error);
    }
  }
  
  return clusterAssignments;
}

// Create test templates
async function createTestTemplates() {
  console.log('Creating test templates for each topic...');
  
  const templateIds = {};
  
  // Create 3 templates for each test topic
  for (const topic of testTopics) {
    console.log(`\nCreating templates for topic: ${topic}`);
    templateIds[topic] = [];
    
    for (let i = 1; i <= 3; i++) {
      const templateText = JSON.stringify({
        query_pattern: `Learn about ${topic} concept ${i}`,
        structure: {
          has_introduction: true,
          has_explanation: true,
          has_analogy: true,
          has_example: true,
          has_key_takeaways: true,
          is_structured: true
        }
      });
      
      try {
        const { data, error } = await supabase
          .from('prompt_templates')
          .insert([{
            topic,
            template_text: templateText,
            source: i === 1 ? 'system' : 'crowd',
            efficacy_score: 3.0 + Math.random() * 2.0, // 3.0 to 5.0
            usage_count: Math.floor(Math.random() * 10) + 1, // 1 to 10
            quality_score: 0.6 + Math.random() * 0.4, // 0.6 to 1.0
            confusion_score: Math.random() * 0.5, // 0.0 to 0.5
            confidence_score: 0.5 + Math.random() * 0.5, // 0.5 to 1.0
            follow_up_rate: Math.random() * 0.4, // 0.0 to 0.4
            composite_quality_score: 0.7 + Math.random() * 0.3, // 0.7 to 1.0
            metadata: {
              test_template: true,
              test_index: i
            }
          }])
          .select();
        
        if (error) throw error;
        
        console.log(`Created template ${i} for ${topic} with ID: ${data[0].id}`);
        templateIds[topic].push(data[0].id);
      } catch (error) {
        console.error(`Error creating template ${i} for ${topic}:`, error);
      }
    }
  }
  
  return templateIds;
}

// Simulate template usage and feedback
async function simulateUsageAndFeedback(clusterAssignments, templateIds) {
  console.log('Simulating template usage and feedback...');
  
  // For each user, simulate usage and feedback for templates in different topics
  for (const userId in clusterAssignments) {
    console.log(`\nSimulating usage and feedback for user: ${userId}`);
    
    // Create a real UUID for session ID
    const sessionId = crypto.randomUUID();
    
    // Simulate usage and feedback for each topic
    for (const topic of testTopics) {
      // Select a random template for this topic
      const templateId = templateIds[topic]?.[Math.floor(Math.random() * templateIds[topic]?.length)];
      
      console.log(`User ${userId} using template ${templateId} for topic ${topic}`);
      
      try {
        // Generate a UUID for the response ID
        const responseId = crypto.randomUUID();
        
        // Log template usage
        const { data: usage, error: usageError } = await supabase
          .from('prompt_template_usage')
          .insert([{
            template_id: templateId,
            session_id: sessionId,
            user_id: userId,
            query: `Tell me about ${topic}`,
            response_id: responseId
          }])
          .select();
        
        if (usageError) throw usageError;
        
        // Determine feedback score based on user preferences and topic match
        let feedbackScore = 3; // Default neutral score
        
        // Technical users (high technical_depth) prefer technical topics
        const isTechnicalUser = testUsers.find(u => u.id === userId).preferences.technicalDepth > 60;
        const isTechnicalTopic = ['mathematics', 'computer_science', 'physics'].includes(topic);
        
        // Visual learners (high visual_learning) prefer art topics
        const isVisualLearner = testUsers.find(u => u.id === userId).preferences.visualLearning > 60;
        const isVisualTopic = ['art', 'design'].includes(topic);
        
        // Adjust score based on preference match
        if ((isTechnicalUser && isTechnicalTopic) || (isVisualLearner && isVisualTopic)) {
          feedbackScore = 4 + Math.floor(Math.random() * 2); // 4 or 5
        } else if ((isTechnicalUser && isVisualTopic) || (isVisualLearner && isTechnicalTopic)) {
          feedbackScore = 2 + Math.floor(Math.random() * 2); // 2 or 3
        } else {
          feedbackScore = 3 + Math.floor(Math.random() * 2); // 3 or 4
        }
        
        // Update with feedback score
        const { error: feedbackError } = await supabase
          .from('prompt_template_usage')
          .update({ feedback_score: feedbackScore })
          .eq('id', usage[0].id);
        
        if (feedbackError) throw feedbackError;
        
        console.log(`User ${userId} gave feedback score ${feedbackScore} for ${topic} template`);
        
        // Update template efficacy score
        const { data: template, error: templateError } = await supabase
          .from('prompt_templates')
          .select('efficacy_score, usage_count')
          .eq('id', templateId)
          .single();
        
        if (templateError) throw templateError;
        
        // Simple weighted average update for efficacy score
        const currentScore = template.efficacy_score || 0;
        const usageCount = template.usage_count || 1;
        const newEfficacyScore = ((currentScore * (usageCount - 1)) + feedbackScore) / usageCount;
        
        const { error: updateError } = await supabase
          .from('prompt_templates')
          .update({ efficacy_score: newEfficacyScore })
          .eq('id', templateId);
        
        if (updateError) throw updateError;
      } catch (error) {
        console.error(`Error simulating usage for user ${userId} with template ${templateId}:`, error);
      }
    }
  }
}

// Test k-means clustering
async function testKMeansClustering() {
  console.log('Testing k-means clustering...');
  
  try {
    // Generate clusters using k-means (k=2)
    const firstClusterId = await ModernClusterManager.generateClusters(2);
    
    console.log(`Generated clusters with first cluster ID: ${firstClusterId}`);
    
    // Get all clusters
    const { data: clusters, error } = await supabase
      .from('user_clusters')
      .select('*');
    
    if (error) throw error;
    
    console.log(`Found ${clusters.length} clusters:`);
    
    for (const cluster of clusters) {
      console.log(`\nCluster ID: ${cluster.id}`);
      console.log('- Member count:', cluster.member_count);
      console.log('- Creation method:', cluster.metadata?.creation_method || 'unknown');
      
      // Print normalized centroid values
      if (cluster.centroid) {
        console.log('- Centroid values:');
        console.log(`  - Technical depth: ${(cluster.centroid.technical_depth * 100).toFixed(0)}/100`);
        console.log(`  - Visual learning: ${(cluster.centroid.visual_learning * 100).toFixed(0)}/100`);
        console.log(`  - Practical examples: ${(cluster.centroid.practical_examples * 100).toFixed(0)}/100`);
        
        // Show top interests and learning styles
        if (cluster.centroid.interest_weights) {
          const interests = Object.entries(cluster.centroid.interest_weights)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          
          console.log('- Top interest categories:');
          interests.forEach(([category, weight]) => {
            console.log(`  - ${category}: ${(weight * 100).toFixed(0)}%`);
          });
        }
        
        if (cluster.centroid.learning_style_weights) {
          const styles = Object.entries(cluster.centroid.learning_style_weights)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);
          
          console.log('- Top learning styles:');
          styles.forEach(([style, weight]) => {
            console.log(`  - ${style}: ${(weight * 100).toFixed(0)}%`);
          });
        }
      }
      
      // Get users in this cluster
      const { data: members, error: membersError } = await supabase
        .from('user_cluster_assignments')
        .select('user_id, similarity')
        .eq('cluster_id', cluster.id);
      
      if (membersError) throw membersError;
      
      console.log('- Members:');
      for (const member of members) {
        console.log(`  - User ${member.user_id}: similarity ${member.similarity.toFixed(2)}`);
      }
    }
  } catch (error) {
    console.error('Error testing k-means clustering:', error);
  }
}

// Clean up test data
async function cleanupTestData() {
  console.log('\n=== CLEANING UP TEST DATA ===');
  
  try {
    // Delete test template usages
    await supabase
      .from('prompt_template_usage')
      .delete()
      .like('user_id', 'test_user_%');
    
    console.log('Deleted test template usages');
    
    // Delete test templates
    await supabase
      .from('prompt_templates')
      .delete()
      .eq('metadata->test_template', true);
    
    console.log('Deleted test templates');
    
    // Delete test user cluster assignments
    await supabase
      .from('user_cluster_assignments')
      .delete()
      .like('user_id', 'test_user_%');
    
    console.log('Deleted test user cluster assignments');
    
    // Note: We're keeping the user_clusters table entries as they might
    // be shared with other users. In a real cleanup, you would need to
    // identify clusters that only have test users and delete those.
    
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run the test if this script is executed directly
if (import.meta.url === import.meta.main) {
  runClusteringTest()
    .then(() => {
      // Clean up test data
      return cleanupTestData();
    })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

// Export functions for use in API endpoints
export { runClusteringTest, cleanupTestData }; 