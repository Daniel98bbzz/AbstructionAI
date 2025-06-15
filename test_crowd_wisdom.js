import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class CrowdWisdomTester {
  constructor() {
    this.testResults = [];
  }

  async runComprehensiveTest() {
    console.log('🔬 STARTING COMPREHENSIVE CROWD WISDOM TEST\n');
    
    try {
      // Test 1: Basic functionality
      await this.testBasicCrowdWisdom();
      
      // Test 2: Template application
      await this.testTemplateApplication();
      
      // Test 3: Learning from feedback
      await this.testFeedbackLearning();
      
      // Test 4: Cluster-based improvements
      await this.testClusterBasedImprovements();
      
      // Test 5: Performance comparison
      await this.testPerformanceComparison();
      
      console.log('\n📊 FINAL TEST RESULTS:');
      this.summarizeResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }

  async testBasicCrowdWisdom() {
    console.log('🧪 TEST 1: Basic Crowd Wisdom Functionality');
    console.log('='.repeat(50));
    
    const testQueries = [
      'What is machine learning?',
      'How do neural networks work?',
      'Explain recursion in programming',
      'What is a memory hierarchy in computers?',
      'How does photosynthesis work?'
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Testing query: "${query}"`);
      
      try {
        // Simulate the crowd wisdom process
        const response = await fetch('http://localhost:3000/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            userId: `test_user_${Date.now()}`,
            abTestGroup: 'composite'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const crowdWisdom = data.crowd_wisdom || {};
          
          console.log(`   ✅ Response received`);
          console.log(`   🎯 Crowd Wisdom Applied: ${crowdWisdom.applied}`);
          console.log(`   📋 Template Applied: ${crowdWisdom.template_applied || false}`);
          console.log(`   🏷️  Selection Method: ${crowdWisdom.selection_method || 'none'}`);
          console.log(`   ⭐ Template Efficacy: ${crowdWisdom.efficacy_score || 'N/A'}`);
          
          this.testResults.push({
            test: 'basic_functionality',
            query,
            success: true,
            crowdWisdomApplied: crowdWisdom.applied,
            templateApplied: crowdWisdom.template_applied,
            selectionMethod: crowdWisdom.selection_method
          });
        } else {
          console.log(`   ❌ Request failed: ${response.status}`);
          this.testResults.push({
            test: 'basic_functionality',
            query,
            success: false,
            error: `HTTP ${response.status}`
          });
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        this.testResults.push({
          test: 'basic_functionality',
          query,
          success: false,
          error: error.message
        });
      }
      
      // Wait between requests to avoid rate limiting
      await this.delay(1000);
    }
  }

  async testTemplateApplication() {
    console.log('\n🧪 TEST 2: Template Application Logic');
    console.log('='.repeat(50));
    
    // Check if templates are being created and used correctly
    try {
      const { data: templates, error } = await supabase
        .from('prompt_templates')
        .select('id, topic, template_text, efficacy_score, usage_count')
        .order('efficacy_score', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      console.log(`\n📋 Found ${templates.length} templates in database:`);
      templates.forEach((template, i) => {
        console.log(`   ${i + 1}. Topic: ${template.topic}`);
        console.log(`      Efficacy: ${template.efficacy_score}/5.0`);
        console.log(`      Usage: ${template.usage_count} times`);
        console.log(`      Template Type: ${this.getTemplateType(template.template_text)}`);
      });
      
      this.testResults.push({
        test: 'template_application',
        templatesFound: templates.length,
        avgEfficacy: templates.reduce((sum, t) => sum + t.efficacy_score, 0) / templates.length,
        totalUsage: templates.reduce((sum, t) => sum + t.usage_count, 0)
      });
      
    } catch (error) {
      console.log(`   ❌ Error checking templates: ${error.message}`);
    }
  }

  async testFeedbackLearning() {
    console.log('\n🧪 TEST 3: Feedback Learning System');
    console.log('='.repeat(50));
    
    // Simulate giving feedback to improve templates
    const testQuery = 'What is artificial intelligence?';
    let responseId = null;
    
    try {
      console.log(`📝 Asking: "${testQuery}"`);
      
      // First, ask a question
      const response = await fetch('http://localhost:3000/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: testQuery,
          userId: `feedback_test_user_${Date.now()}`
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        responseId = data.id;
        console.log(`   ✅ Got response ID: ${responseId}`);
        
        // Now simulate providing feedback
        console.log('\n🔄 Providing positive feedback (rating: 5)...');
        
        const feedbackResponse = await fetch('http://localhost:3000/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            responseId,
            rating: 5,
            analogyHelpful: 'yes',
            explanationClear: 'yes',
            comments: 'Great explanation! Very clear and helpful.',
            userId: `feedback_test_user_${Date.now()}`
          })
        });
        
        if (feedbackResponse.ok) {
          console.log('   ✅ Feedback submitted successfully');
          
          // Check if template efficacy improved
          console.log('\n📈 Checking template efficacy updates...');
          const { data: usage } = await supabase
            .from('prompt_template_usage')
            .select('template_id, feedback_score')
            .eq('response_id', responseId)
            .limit(1)
            .single();
            
          if (usage) {
            console.log(`   📋 Template ${usage.template_id.substring(0, 8)}... received feedback score: ${usage.feedback_score}`);
          }
          
          this.testResults.push({
            test: 'feedback_learning',
            success: true,
            feedbackProcessed: true
          });
        } else {
          console.log(`   ❌ Feedback failed: ${feedbackResponse.status}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error in feedback test: ${error.message}`);
    }
  }

  async testClusterBasedImprovements() {
    console.log('\n🧪 TEST 4: Cluster-Based Improvements');
    console.log('='.repeat(50));
    
    // Test similar questions to see if they get enhanced responses
    const similarQueries = [
      'What is machine learning and how does it work?',
      'Explain machine learning algorithms',
      'How do computers learn from data?'
    ];
    
    console.log('🔍 Testing cluster matching for similar queries...');
    
    for (let i = 0; i < similarQueries.length; i++) {
      const query = similarQueries[i];
      console.log(`\n📝 Query ${i + 1}: "${query}"`);
      
      try {
        const response = await fetch('http://localhost:3000/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            userId: `cluster_test_user_${i}_${Date.now()}`
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const crowdWisdom = data.crowd_wisdom || {};
          
          console.log(`   🎯 Crowd Wisdom: ${crowdWisdom.applied ? '✅ Applied' : '❌ Not Applied'}`);
          console.log(`   📋 Template Enhancement: ${crowdWisdom.template_applied ? '✅ Applied' : '❌ Not Applied'}`);
          console.log(`   🏷️  Selection Method: ${crowdWisdom.selection_method || 'none'}`);
          
          if (crowdWisdom.template_applied) {
            console.log(`   ⭐ Template Efficacy: ${crowdWisdom.efficacy_score}`);
            console.log(`   🎯 This response was enhanced by crowd wisdom!`);
          }
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      await this.delay(1000);
    }
  }

  async testPerformanceComparison() {
    console.log('\n🧪 TEST 5: Performance Comparison');
    console.log('='.repeat(50));
    
    try {
      // Get statistics about template performance
      const { data: templateStats } = await supabase
        .from('prompt_template_usage')
        .select('template_id, feedback_score, had_follow_up, cluster_id')
        .not('feedback_score', 'is', null);
      
      if (templateStats && templateStats.length > 0) {
        console.log(`\n📊 Analyzing ${templateStats.length} feedback records...`);
        
        const avgRating = templateStats.reduce((sum, t) => sum + t.feedback_score, 0) / templateStats.length;
        const followUpRate = templateStats.filter(t => t.had_follow_up).length / templateStats.length;
        const clusteredResponses = templateStats.filter(t => t.cluster_id !== null).length;
        
        console.log(`   📈 Average User Rating: ${avgRating.toFixed(2)}/5.0`);
        console.log(`   🔄 Follow-up Rate: ${(followUpRate * 100).toFixed(1)}%`);
        console.log(`   🎯 Cluster-Enhanced Responses: ${clusteredResponses}/${templateStats.length}`);
        
        // Check best performing templates
        const { data: bestTemplates } = await supabase
          .from('prompt_templates')
          .select('topic, efficacy_score, usage_count')
          .gte('efficacy_score', 4.0)
          .order('efficacy_score', { ascending: false })
          .limit(3);
        
        if (bestTemplates && bestTemplates.length > 0) {
          console.log('\n🏆 Top Performing Templates:');
          bestTemplates.forEach((template, i) => {
            console.log(`   ${i + 1}. ${template.topic} - ${template.efficacy_score.toFixed(2)}/5.0 (${template.usage_count} uses)`);
          });
        }
        
        this.testResults.push({
          test: 'performance_comparison',
          avgRating,
          followUpRate,
          clusteredResponses,
          totalFeedback: templateStats.length
        });
      }
    } catch (error) {
      console.log(`   ❌ Error in performance analysis: ${error.message}`);
    }
  }

  getTemplateType(templateText) {
    if (!templateText) return 'Unknown';
    
    try {
      JSON.parse(templateText);
      return 'Structured JSON';
    } catch {
      return 'Raw Content';
    }
  }

  summarizeResults() {
    const successful = this.testResults.filter(r => r.success !== false).length;
    const total = this.testResults.length;
    
    console.log(`\n✅ Success Rate: ${successful}/${total} tests passed`);
    
    const crowdWisdomTests = this.testResults.filter(r => r.test === 'basic_functionality');
    const appliedCount = crowdWisdomTests.filter(r => r.crowdWisdomApplied).length;
    const templateCount = crowdWisdomTests.filter(r => r.templateApplied).length;
    
    if (crowdWisdomTests.length > 0) {
      console.log(`\n🎯 Crowd Wisdom Application Rate: ${appliedCount}/${crowdWisdomTests.length}`);
      console.log(`📋 Template Enhancement Rate: ${templateCount}/${crowdWisdomTests.length}`);
    }
    
    const performanceTest = this.testResults.find(r => r.test === 'performance_comparison');
    if (performanceTest) {
      console.log(`\n📊 System Performance:`);
      console.log(`   Average Rating: ${performanceTest.avgRating?.toFixed(2) || 'N/A'}/5.0`);
      console.log(`   Follow-up Rate: ${((performanceTest.followUpRate || 0) * 100).toFixed(1)}%`);
      console.log(`   Total Feedback Records: ${performanceTest.totalFeedback || 0}`);
    }
    
    console.log('\n🎉 Crowd Wisdom mechanism test completed!');
    
    if (templateCount > 0) {
      console.log('\n✨ SUCCESS: Templates are being applied to enhance responses!');
      console.log('   The crowd wisdom mechanism is working correctly.');
    } else {
      console.log('\n⚠️  WARNING: No template enhancements detected.');
      console.log('   Check server logs and template database content.');
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the test
const tester = new CrowdWisdomTester();
tester.runComprehensiveTest().catch(console.error); 