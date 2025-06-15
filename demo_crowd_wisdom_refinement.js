import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function demonstrateCrowdWisdomRefinement() {
  console.log('🎭 CROWD WISDOM REFINEMENT DEMONSTRATION');
  console.log('=' .repeat(60));
  console.log('This demo shows how the system learns and refines answers from user feedback.\n');
  
  // Step 1: Show initial state
  console.log('📊 STEP 1: Current System State');
  console.log('-'.repeat(30));
  
  try {
    // Show current templates and their performance
    const { data: templates } = await supabase
      .from('prompt_templates')
      .select('id, topic, efficacy_score, usage_count, source')
      .order('efficacy_score', { ascending: false })
      .limit(5);
    
    console.log('🏆 Top performing templates:');
    templates.forEach((template, i) => {
      console.log(`   ${i + 1}. ${template.topic} - Efficacy: ${template.efficacy_score.toFixed(2)}/5.0 (${template.usage_count} uses)`);
    });
    
    // Show cluster usage statistics
    const { data: clusterStats } = await supabase
      .from('prompt_template_usage')
      .select('cluster_id')
      .not('cluster_id', 'is', null);
    
    const clusterCounts = {};
    clusterStats.forEach(usage => {
      clusterCounts[usage.cluster_id] = (clusterCounts[usage.cluster_id] || 0) + 1;
    });
    
    console.log(`\n🎯 Active clusters: ${Object.keys(clusterCounts).length}`);
    Object.entries(clusterCounts).forEach(([clusterId, count]) => {
      console.log(`   Cluster ${clusterId}: ${count} template uses`);
    });
    
  } catch (error) {
    console.error('Error getting system state:', error.message);
  }
  
  // Step 2: Simulate learning scenario
  console.log('\n🧪 STEP 2: Simulating Learning Scenario');
  console.log('-'.repeat(40));
  console.log('Scenario: Multiple users ask about "recursion" with different outcomes\n');
  
  const learningScenario = [
    {
      user: 'Alice',
      query: 'What is recursion in programming?',
      expectedOutcome: 'Gets basic response (no previous crowd wisdom)',
      feedbackRating: 2,
      feedbackComment: 'Too technical, need simpler explanation'
    },
    {
      user: 'Bob', 
      query: 'Can you explain recursion simply?',
      expectedOutcome: 'Should get enhanced response based on Alice\'s feedback',
      feedbackRating: 5,
      feedbackComment: 'Perfect! Much clearer explanation'
    },
    {
      user: 'Carol',
      query: 'How does recursion work in programming?', 
      expectedOutcome: 'Should get the improved approach that worked for Bob',
      feedbackRating: 4,
      feedbackComment: 'Good explanation, helpful examples'
    }
  ];
  
  for (let i = 0; i < learningScenario.length; i++) {
    const scenario = learningScenario[i];
    console.log(`👤 ${scenario.user} asks: "${scenario.query}"`);
    console.log(`   Expected: ${scenario.expectedOutcome}`);
    
    try {
      // Simulate the query
      const response = await fetch('http://localhost:3000/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: scenario.query,
          userId: `demo_user_${scenario.user.toLowerCase()}_${Date.now()}`
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const crowdWisdom = data.crowd_wisdom || {};
        
        console.log(`   ✅ Response generated`);
        console.log(`   🎯 Crowd Wisdom Applied: ${crowdWisdom.applied ? 'YES' : 'NO'}`);
        console.log(`   📋 Template Enhanced: ${crowdWisdom.template_applied ? 'YES' : 'NO'}`);
        
        if (crowdWisdom.template_applied) {
          console.log(`   ⭐ Using template with efficacy: ${crowdWisdom.efficacy_score?.toFixed(2) || 'N/A'}/5.0`);
          console.log(`   🔧 Selection method: ${crowdWisdom.selection_method}`);
          console.log('   🎉 Response was refined by crowd wisdom!');
        }
        
        // Simulate providing feedback
        console.log(`   💬 ${scenario.user} provides feedback: ${scenario.feedbackRating}/5 - "${scenario.feedbackComment}"`);
        
        // Note: In a real scenario, you would submit feedback here
        // This would update the template efficacy scores
        
      } else {
        console.log(`   ❌ Query failed: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log(''); // Empty line for readability
    await delay(2000); // Wait between scenarios
  }
  
  // Step 3: Show system improvement
  console.log('📈 STEP 3: System Learning Results');
  console.log('-'.repeat(35));
  
  try {
    // Check recent feedback for recursion-related queries
    const { data: recentFeedback } = await supabase
      .from('prompt_template_usage')
      .select('query, feedback_score, template_id, cluster_id')
      .ilike('query', '%recursion%')
      .not('feedback_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentFeedback && recentFeedback.length > 0) {
      console.log('📊 Recent recursion-related feedback:');
      recentFeedback.forEach((feedback, i) => {
        console.log(`   ${i + 1}. "${feedback.query.substring(0, 40)}..." - Rating: ${feedback.feedback_score}/5`);
        console.log(`      Template: ${feedback.template_id?.substring(0, 8)}... | Cluster: ${feedback.cluster_id || 'None'}`);
      });
      
      const avgRating = recentFeedback.reduce((sum, f) => sum + f.feedback_score, 0) / recentFeedback.length;
      console.log(`\n📈 Average rating for recursion queries: ${avgRating.toFixed(2)}/5.0`);
    } else {
      console.log('⚠️  No recent feedback found for recursion queries');
    }
    
  } catch (error) {
    console.error('Error checking learning results:', error.message);
  }
  
  // Step 4: Show what users should expect
  console.log('\n✨ STEP 4: Expected Benefits for Users');
  console.log('-'.repeat(40));
  console.log('🎯 As more users interact with the system:');
  console.log('   1. ✅ Similar questions get better answers over time');
  console.log('   2. ✅ High-rated response patterns are reused'); 
  console.log('   3. ✅ Poor-performing approaches are avoided');
  console.log('   4. ✅ Domain-specific templates emerge naturally');
  console.log('   5. ✅ New users benefit from previous users\' feedback');
  
  console.log('\n🔄 The Feedback Loop:');
  console.log('   User asks question → System finds similar past questions →');
  console.log('   → Applies best-working approach → User rates response →');
  console.log('   → System learns and improves for future similar questions');
  
  console.log('\n💡 Key Insights:');
  console.log('   • Templates are NOT pre-written answers');
  console.log('   • They are learned patterns for structuring responses');
  console.log('   • The system gets smarter with each interaction');
  console.log('   • Users automatically benefit from crowd wisdom');
  
  console.log('\n🎉 Demonstration completed!');
  console.log('The crowd wisdom mechanism is designed to continuously improve');
  console.log('the educational experience by learning from user interactions.');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the demonstration
demonstrateCrowdWisdomRefinement().catch(console.error); 