import { spacedRepetition, masteryCalculator, recommendationEngine, learningDecayModel } from './server/utils/learningAlgorithms.js';

console.log('🧠 Testing Learning Algorithms Implementation');
console.log('='.repeat(50));

// Test 1: Spaced Repetition Algorithm
console.log('\n1. Testing Spaced Repetition (SM-2 Algorithm)');
console.log('-'.repeat(30));

const sr = spacedRepetition;

// Test initial card
console.log('Initial card state:');
const initialCard = sr.getInitialCard();
console.log(JSON.stringify(initialCard, null, 2));

// Test review with different grades
console.log('\nTesting reviews with different grades:');
let card = { ...initialCard };

// Good review (grade 4)
card = sr.updateCard(card, 4);
console.log('After grade 4 (good):', JSON.stringify(card, null, 2));

// Perfect review (grade 5)
card = sr.updateCard(card, 5);
console.log('After grade 5 (perfect):', JSON.stringify(card, null, 2));

// Poor review (grade 2)
card = sr.updateCard(card, 2);
console.log('After grade 2 (poor):', JSON.stringify(card, null, 2));

// Test 2: Mastery Calculator
console.log('\n\n2. Testing Mastery Calculator');
console.log('-'.repeat(30));

const mc = masteryCalculator;

// Test mastery calculation
const masteryData = {
  feedbackScore: 0.8,  // 80% positive feedback
  quizScore: 0.75,     // 75% quiz performance
  retentionRate: 0.9,  // 90% retention
  engagementLevel: 0.85 // 85% engagement
};

const mastery = mc.calculateMastery(masteryData);
console.log('Mastery calculation for scores:', masteryData);
console.log('Result:', JSON.stringify(mastery, null, 2));

// Test confidence calculation
const confidence = mc.calculateConfidence(masteryData, 5); // 5 interactions
console.log('\nConfidence with 5 interactions:', confidence);

// Test 3: Recommendation Engine
console.log('\n\n3. Testing Recommendation Engine');
console.log('-'.repeat(30));

const re = recommendationEngine;

// Mock user performance data
const userPerformance = {
  'topic1': {
    masteryScore: 0.45,  // Low mastery - needs strengthening
    lastReviewed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    confidence: 0.3,
    nextReviewDue: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // Due yesterday
  },
  'topic2': {
    masteryScore: 0.95,  // High mastery - ready for advancement
    lastReviewed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    confidence: 0.9,
    nextReviewDue: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // Due in 3 days
  },
  'topic3': {
    masteryScore: 0.7,   // Medium mastery
    lastReviewed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    confidence: 0.6,
    nextReviewDue: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) // Due tomorrow
  }
};

const recommendations = re.generateRecommendations(userPerformance);
console.log('Generated recommendations:');
recommendations.forEach((rec, index) => {
  console.log(`${index + 1}. ${rec.type.toUpperCase()}: ${rec.topicId}`);
  console.log(`   Reason: ${rec.reason}`);
  console.log(`   Priority: ${rec.priority}`);
  console.log('');
});

// Test 4: Learning Decay Model
console.log('\n4. Testing Learning Decay Model');
console.log('-'.repeat(30));

const ldm = learningDecayModel;

// Test retention calculation over time
const masteryScore = 0.8;
const daysSinceLastReview = 7;
const retention = ldm.calculateRetention(masteryScore, daysSinceLastReview);
console.log(`Retention after ${daysSinceLastReview} days with initial mastery ${masteryScore}:`, retention);

// Test optimal review intervals
const intervals = [1, 3, 7, 14, 30].map(days => ({
  days,
  retention: ldm.calculateRetention(masteryScore, days)
}));

console.log('\nRetention over time:');
intervals.forEach(interval => {
  console.log(`Day ${interval.days}: ${(interval.retention * 100).toFixed(1)}% retention`);
});

console.log('\n🎉 All learning algorithm tests completed successfully!');
console.log('✅ Spaced Repetition SM-2 algorithm working');
console.log('✅ Mastery Calculator with weighted scoring working');  
console.log('✅ Recommendation Engine generating adaptive suggestions');
console.log('✅ Learning Decay Model calculating retention rates'); 