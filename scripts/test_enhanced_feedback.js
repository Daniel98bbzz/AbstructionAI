import { processUserMessage } from '../src/utils/secretFeedbackClassifier.js';
import { moderateContent, classifyWithNLP, scoreFeedbackQuality } from '../src/utils/feedbackEnhancements.js';
import { analyzeFeedbackTrends, getQualityDistribution } from '../src/utils/feedbackAnalytics.js';
import dotenv from 'dotenv';

// Load environment variables for the test
dotenv.config();

console.log('🧪 Testing Enhanced Feedback System\n');

// Test cases for different scenarios
const testCases = [
  {
    message: "Thank you so much! This really helped me understand",
    expectedType: "positive",
    description: "Clear positive feedback"
  },
  {
    message: "I'm confused and don't understand this at all",
    expectedType: "negative", 
    description: "Clear negative feedback"
  },
  {
    message: "okay sure",
    expectedType: "neutral",
    description: "Neutral acknowledgment"
  },
  {
    message: "What is the capital of France?",
    expectedType: "unknown",
    description: "Off-topic question"
  },
  {
    message: "CLICK HERE FOR FREE MONEY!!!",
    expectedType: "spam",
    description: "Spam content"
  },
  {
    message: "This interface is really intuitive and helps me complete my tasks efficiently",
    expectedType: "positive",
    description: "High-quality positive feedback"
  }
];

async function runTests() {
  console.log('1️⃣ Testing Content Moderation');
  console.log('─'.repeat(50));
  
  for (const testCase of testCases) {
    const isClean = moderateContent(testCase.message);
    console.log(`${isClean ? '✅' : '❌'} "${testCase.message.substring(0, 40)}..." → ${isClean ? 'Clean' : 'Blocked'}`);
  }

  console.log('\n2️⃣ Testing Quality Scoring');
  console.log('─'.repeat(50));
  
  for (const testCase of testCases) {
    const score = scoreFeedbackQuality(testCase.message);
    console.log(`📊 "${testCase.message.substring(0, 40)}..." → Quality: ${score}/100`);
  }

  console.log('\n3️⃣ Testing NLP Classification');
  console.log('─'.repeat(50));
  
  // Test a few cases with NLP
  const nlpTestCases = [
    "This is amazing work, I'm really impressed!",
    "I'm struggling to figure this out, it's quite difficult",
    "Random text that doesn't relate to feedback at all"
  ];

  for (const message of nlpTestCases) {
    try {
      const classification = await classifyWithNLP(message);
      console.log(`🤖 "${message.substring(0, 40)}..." → NLP: ${classification}`);
    } catch (error) {
      console.log(`❌ NLP Error for "${message.substring(0, 40)}...": ${error.message}`);
    }
  }

  console.log('\n4️⃣ Testing Complete Processing Pipeline');
  console.log('─'.repeat(50));
  
  const testUserId = 'test-user-' + Date.now();
  const testConversationId = 'test-conv-' + Date.now();
  
  for (const testCase of testCases) {
    try {
      const result = await processUserMessage(
        testUserId, 
        testCase.message, 
        testConversationId,
        { page: 'test', feature: 'enhanced_feedback_test' }
      );
      
      const match = result.feedbackType === testCase.expectedType;
      console.log(`${match ? '✅' : '⚠️ '} "${testCase.message.substring(0, 30)}..." → ${result.feedbackType} (expected: ${testCase.expectedType})`);
      console.log(`    Quality: ${result.qualityScore}, Processed by: ${result.processedBy}, Stored: ${result.stored}`);
      
      if (result.suggestion) {
        console.log(`    💡 Suggestion: ${result.suggestion}`);
      }
    } catch (error) {
      console.log(`❌ Error processing "${testCase.message.substring(0, 30)}...": ${error.message}`);
    }
  }

  console.log('\n5️⃣ Testing Analytics Functions');
  console.log('─'.repeat(50));
  
  try {
    console.log('📈 Testing quality distribution...');
    const qualityResult = await getQualityDistribution();
    if (qualityResult.success) {
      console.log('✅ Quality distribution retrieved successfully');
      console.log(`   Total feedback: ${qualityResult.distribution.total}`);
      console.log(`   Avg quality: ${qualityResult.distribution.overall.avgQuality.toFixed(1)}`);
    } else {
      console.log('❌ Quality distribution failed:', qualityResult.error);
    }
  } catch (error) {
    console.log('❌ Analytics error:', error.message);
  }

  try {
    console.log('📊 Testing trends analysis...');
    const trendsResult = await analyzeFeedbackTrends('week', 5);
    if (trendsResult.success) {
      console.log('✅ Trends analysis completed successfully');
      console.log(`   Data points: ${trendsResult.trends.length}`);
    } else {
      console.log('❌ Trends analysis failed:', trendsResult.error);
    }
  } catch (error) {
    console.log('❌ Trends analysis error:', error.message);
  }

  console.log('\n🎉 Enhanced Feedback System Test Complete!');
  console.log('\n📋 Summary:');
  console.log('✨ Content moderation: Spam and inappropriate content filtering');
  console.log('🤖 NLP classification: Fallback for complex feedback');  
  console.log('📊 Quality scoring: Feedback quality assessment');
  console.log('💾 Enhanced storage: Metadata, embeddings, and quality scores');
  console.log('📈 Analytics: Trends, distributions, and insights');
  console.log('🎯 Follow-up suggestions: Contextual prompts for unclear feedback');
}

// Run the tests
runTests().catch(console.error); 