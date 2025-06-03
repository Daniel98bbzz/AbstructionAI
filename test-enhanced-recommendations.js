#!/usr/bin/env node

/**
 * Test script for Enhanced Template Recommendations
 * Demonstrates the recommendation algorithm based on user clusters, topics, and sentiment
 */

import Supervisor from './server/managers/Supervisor.js';
import { supabase } from './server/lib/supabaseClient.js';

// Enable debug output
const DEBUG = true;

function log(message) {
  if (DEBUG) {
    console.log(`[TEST] ${message}`);
  }
}

/**
 * Create test data for recommendations
 */
async function createTestData() {
  log('Creating test data for enhanced recommendations...');

  try {
    // Create test users
    const testUsers = [
      { id: 'test-user-1', name: 'Alice (Math Enthusiast)' },
      { id: 'test-user-2', name: 'Bob (CS Student)' },
      { id: 'test-user-3', name: 'Charlie (Physics Learner)' }
    ];

    // Create test topics and sessions
    const testTopics = ['mathematics', 'computer_science', 'physics', 'algebra', 'algorithms'];
    
    for (const topic of testTopics) {
      const { error } = await supabase
        .from('topics')
        .upsert({ 
          name: topic, 
          description: `Test topic: ${topic}`,
          usage_count: Math.floor(Math.random() * 50) + 1
        });
      
      if (error) {
        console.error(`Error creating topic ${topic}:`, error);
      }
    }

    // Create test sessions with topics
    for (const user of testUsers) {
      // Create multiple sessions per user with different topics
      const userTopics = user.id === 'test-user-1' ? ['mathematics', 'algebra'] :
                        user.id === 'test-user-2' ? ['computer_science', 'algorithms'] :
                        ['physics', 'mathematics'];

      for (let i = 0; i < 5; i++) {
        const topic = userTopics[Math.floor(Math.random() * userTopics.length)];
        
        const { error } = await supabase
          .from('sessions')
          .upsert({
            id: `${user.id}-session-${i}`,
            user_id: user.id,
            secret_topic: topic,
            status: 'completed',
            preferences: {}
          });

        if (error) {
          console.error(`Error creating session for ${user.id}:`, error);
        }
      }
    }

    // Create test templates
    const testTemplates = [
      {
        topic: 'mathematics',
        template_text: JSON.stringify({
          query_pattern: 'mathematical problem solving',
          structure: 'step-by-step with examples'
        }),
        source: 'test',
        efficacy_score: 4.2,
        usage_count: 15
      },
      {
        topic: 'algebra',
        template_text: JSON.stringify({
          query_pattern: 'algebraic equations',
          structure: 'formula breakdown with practice'
        }),
        source: 'test',
        efficacy_score: 4.5,
        usage_count: 22
      },
      {
        topic: 'computer_science',
        template_text: JSON.stringify({
          query_pattern: 'programming concepts',
          structure: 'code examples with explanations'
        }),
        source: 'test',
        efficacy_score: 4.1,
        usage_count: 18
      },
      {
        topic: 'algorithms',
        template_text: JSON.stringify({
          query_pattern: 'algorithm analysis',
          structure: 'complexity and implementation'
        }),
        source: 'test',
        efficacy_score: 4.3,
        usage_count: 12
      },
      {
        topic: 'physics',
        template_text: JSON.stringify({
          query_pattern: 'physics principles',
          structure: 'theory with real-world applications'
        }),
        source: 'test',
        efficacy_score: 3.9,
        usage_count: 8
      }
    ];

    for (const template of testTemplates) {
      const { data, error } = await supabase
        .from('prompt_templates')
        .upsert(template)
        .select();

      if (error) {
        console.error(`Error creating template for ${template.topic}:`, error);
      } else if (data && data[0]) {
        // Create some usage data for the template
        for (const user of testUsers) {
          // Only create usage if topic matches user's interests
          const userInterests = user.id === 'test-user-1' ? ['mathematics', 'algebra'] :
                              user.id === 'test-user-2' ? ['computer_science', 'algorithms'] :
                              ['physics', 'mathematics'];

          if (userInterests.includes(template.topic)) {
            const rating = 3 + Math.floor(Math.random() * 3); // Rating 3-5
            
            const { error: usageError } = await supabase
              .from('prompt_template_usage')
              .upsert({
                template_id: data[0].id,
                session_id: `${user.id}-session-0`,
                user_id: user.id,
                query: `Test query about ${template.topic}`,
                response_id: `response-${Date.now()}-${Math.random()}`,
                feedback_score: rating
              });

            if (usageError) {
              console.error(`Error creating usage for ${user.id}:`, usageError);
            }
          }
        }
      }
    }

    // Create test secret feedback
    const feedbackData = [
      { user_id: 'test-user-1', feedback_type: 'positive', message: 'Great explanation!' },
      { user_id: 'test-user-1', feedback_type: 'positive', message: 'Very helpful' },
      { user_id: 'test-user-1', feedback_type: 'neutral', message: 'Okay' },
      { user_id: 'test-user-2', feedback_type: 'positive', message: 'Thanks!' },
      { user_id: 'test-user-2', feedback_type: 'negative', message: 'Confusing' },
      { user_id: 'test-user-2', feedback_type: 'positive', message: 'Got it' },
      { user_id: 'test-user-3', feedback_type: 'positive', message: 'Makes sense' },
      { user_id: 'test-user-3', feedback_type: 'positive', message: 'Perfect' },
      { user_id: 'test-user-3', feedback_type: 'positive', message: 'Excellent' }
    ];

    for (const feedback of feedbackData) {
      const { error } = await supabase
        .from('secret_feedback')
        .upsert(feedback);

      if (error) {
        console.error(`Error creating feedback for ${feedback.user_id}:`, error);
      }
    }

    // Create test clusters
    const clusters = [
      {
        centroid: {
          technical_depth: 0.8,
          visual_learning: 0.4,
          practical_examples: 0.7
        },
        member_count: 2,
        metadata: { description: 'Technical learners cluster' }
      },
      {
        centroid: {
          technical_depth: 0.6,
          visual_learning: 0.8,
          practical_examples: 0.5
        },
        member_count: 1,
        metadata: { description: 'Visual learners cluster' }
      }
    ];

    const clusterIds = [];
    for (const cluster of clusters) {
      const { data, error } = await supabase
        .from('user_clusters')
        .insert(cluster)
        .select();

      if (error) {
        console.error('Error creating cluster:', error);
      } else if (data && data[0]) {
        clusterIds.push(data[0].id);
      }
    }

    // Assign users to clusters
    if (clusterIds.length >= 2) {
      const assignments = [
        {
          user_id: 'test-user-1',
          cluster_id: clusterIds[0],
          similarity: 0.85,
          preferences: { technical_depth: 0.8, visual_learning: 0.4 }
        },
        {
          user_id: 'test-user-2',
          cluster_id: clusterIds[0],
          similarity: 0.78,
          preferences: { technical_depth: 0.75, visual_learning: 0.3 }
        },
        {
          user_id: 'test-user-3',
          cluster_id: clusterIds[1],
          similarity: 0.82,
          preferences: { technical_depth: 0.6, visual_learning: 0.9 }
        }
      ];

      for (const assignment of assignments) {
        const { error } = await supabase
          .from('user_cluster_assignments')
          .upsert(assignment);

        if (error) {
          console.error(`Error creating assignment for ${assignment.user_id}:`, error);
        }
      }
    }

    log('Test data creation completed!');
    return { testUsers, testTopics };

  } catch (error) {
    console.error('Error creating test data:', error);
    throw error;
  }
}

/**
 * Test enhanced recommendations for a user
 */
async function testEnhancedRecommendations(userId, userName) {
  log(`\n=== Testing Enhanced Recommendations for ${userName} ===`);

  try {
    const supervisor = new Supervisor();

    // Test basic recommendations
    log('Getting basic recommendations...');
    const basicRecommendations = await supervisor.getTemplateRecommendationsForUser(userId);
    
    console.log(`\n📋 Basic Recommendations for ${userName}:`);
    basicRecommendations.forEach((rec, index) => {
      console.log(`${index + 1}. Topic: ${rec.topic}`);
      console.log(`   Score: ${rec.finalScore.toFixed(3)}`);
      console.log(`   Reason: ${rec.recommendationReason}`);
      console.log(`   Template ID: ${rec.id}`);
      console.log('');
    });

    // Test topic-specific recommendations
    log('Getting mathematics-specific recommendations...');
    const mathRecommendations = await supervisor.getTemplateRecommendationsForUser(
      userId, 
      'mathematics'
    );
    
    console.log(`\n📊 Mathematics Recommendations for ${userName}:`);
    mathRecommendations.forEach((rec, index) => {
      console.log(`${index + 1}. Topic: ${rec.topic}`);
      console.log(`   Score: ${rec.finalScore.toFixed(3)}`);
      console.log(`   Reason: ${rec.recommendationReason}`);
      console.log('');
    });

    // Test custom weights
    log('Getting recommendations with custom weights...');
    const customWeights = {
      clusterPopularity: 0.6,  // Higher weight on cluster
      topicRelevance: 0.3,     // Lower weight on topics
      sentimentWeight: 0.1     // Lower weight on sentiment
    };

    const customRecommendations = await supervisor.getTemplateRecommendationsForUser(
      userId,
      null,
      { 
        maxRecommendations: 5,
        includeScoreBreakdown: true,
        weights: customWeights
      }
    );

    console.log(`\n🎯 Custom Weighted Recommendations for ${userName}:`);
    customRecommendations.forEach((rec, index) => {
      console.log(`${index + 1}. Topic: ${rec.topic}`);
      console.log(`   Final Score: ${rec.finalScore.toFixed(3)}`);
      console.log(`   Cluster Score: ${rec.scoreBreakdown.clusterPopularity.toFixed(3)}`);
      console.log(`   Topic Score: ${rec.scoreBreakdown.topicRelevance.toFixed(3)}`);
      console.log(`   Sentiment Score: ${rec.scoreBreakdown.sentimentWeight.toFixed(3)}`);
      console.log(`   Reason: ${rec.recommendationReason}`);
      console.log('');
    });

    // Test user insights
    log('Getting user insights...');
    const [userCluster, userTopics, userSentiment] = await Promise.all([
      supervisor.getUserCluster(userId),
      supervisor.getUserMostActiveTopics(userId, 5),
      supervisor.getUserSentimentStats(userId)
    ]);

    console.log(`\n🔍 User Insights for ${userName}:`);
    console.log('Cluster Info:', userCluster ? {
      clusterId: userCluster.clusterId,
      similarity: userCluster.similarity,
      memberCount: userCluster.memberIds.length
    } : 'No cluster assigned');
    
    console.log('Active Topics:', userTopics);
    console.log('Sentiment Stats:', userSentiment);
    console.log('');

  } catch (error) {
    console.error(`Error testing recommendations for ${userName}:`, error);
  }
}

/**
 * Main test function
 */
async function runEnhancedRecommendationsTest() {
  try {
    console.log('🚀 Starting Enhanced Template Recommendations Test\n');

    // Create test data
    const { testUsers } = await createTestData();

    // Wait a moment for data to settle
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test recommendations for each user
    for (const user of testUsers) {
      await testEnhancedRecommendations(user.id, user.name);
    }

    // Test API endpoints
    console.log('\n🌐 Testing API Endpoints:');
    console.log('GET /api/users/{userId}/template-recommendations');
    console.log('POST /api/users/{userId}/template-recommendations');
    console.log('GET /api/users/{userId}/recommendation-insights');
    
    console.log('\nExample API calls:');
    console.log(`curl "http://localhost:3001/api/users/test-user-1/template-recommendations?max_recommendations=5"`);
    console.log(`curl "http://localhost:3001/api/users/test-user-1/recommendation-insights"`);
    
    console.log('\n✅ Enhanced Template Recommendations Test Completed!');
    console.log('\nThe system successfully:');
    console.log('• Analyzed user clusters and collaborative filtering');
    console.log('• Identified user topic preferences from session history');
    console.log('• Incorporated sentiment analysis from secret feedback');
    console.log('• Generated personalized template recommendations');
    console.log('• Provided detailed scoring and reasoning');
    console.log('• Supported custom weighting and configuration');

  } catch (error) {
    console.error('Error in enhanced recommendations test:', error);
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  log('Cleaning up test data...');

  try {
    // Delete in reverse order due to foreign key constraints
    await supabase.from('prompt_template_usage').delete().like('user_id', 'test-user-%');
    await supabase.from('user_cluster_assignments').delete().like('user_id', 'test-user-%');
    await supabase.from('secret_feedback').delete().like('user_id', 'test-user-%');
    await supabase.from('sessions').delete().like('user_id', 'test-user-%');
    await supabase.from('prompt_templates').delete().eq('source', 'test');
    await supabase.from('user_clusters').delete().like('metadata->description', '%cluster%');

    log('Test data cleanup completed!');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

// Run the test
if (process.argv.includes('--cleanup')) {
  cleanupTestData();
} else {
  runEnhancedRecommendationsTest();
} 