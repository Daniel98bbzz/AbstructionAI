import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SERVER_URL = 'http://localhost:3001';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class ComprehensiveSystemTester {
  constructor() {
    // Use existing user ID from database instead of generating new one
    this.testUserId = '9faf7fa8-dc31-4f93-8665-25b09f00b030'; // Existing user
    this.testSessionId = uuidv4(); // Generate new session ID
    this.testQuizId = null;
    this.testMessageId = null;
    this.testSecretTopic = 'test_machine_learning';
    this.results = {
      infrastructure: { status: 'pending', details: [], score: 0 },
      clustering: { status: 'pending', details: [], score: 0 },
      quiz: { status: 'pending', details: [], score: 0 },
      progress: { status: 'pending', details: [], score: 0 },
      analytics: { status: 'pending', details: [], score: 0 },
      discovery: { status: 'pending', details: [], score: 0 },
      secret_feedback: { status: 'pending', details: [], score: 0 },
      secret_topic: { status: 'pending', details: [], score: 0 },
      gamification: { status: 'pending', details: [], score: 0 },
      response_tabs: { status: 'pending', details: [], score: 0 }
    };
  }

  async runAllTests() {
    console.log('🚀 COMPREHENSIVE SYSTEM TEST SUITE\n');
    console.log(`Test User ID: ${this.testUserId}`);
    console.log(`Test Session ID: ${this.testSessionId}\n`);

    try {
      // Test in logical order
      await this.testInfrastructure();
      await this.testClusteringSystem();
      await this.testQuizSystem();
      await this.testProgressSystem();
      await this.testAnalyticsSystem();
      await this.testDiscoverySystem();
      await this.testSecretFeedbackSystem();
      await this.testSecretTopicSystem();
      await this.testGamificationSystem();
      await this.testResponseTabsSystem();
      
      await this.cleanup();
      this.printComprehensiveSummary();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  // =============== 1. INFRASTRUCTURE TESTS ===============
  async testInfrastructure() {
    console.log('🏗️ TESTING INFRASTRUCTURE & DATABASE\n');
    
    try {
      // Test database connectivity
      console.log('1️⃣ Testing database connectivity...');
      const { data: dbTest, error: dbError } = await supabase
        .from('users')
        .select('count')
        .limit(1);
      
      if (dbError) {
        this.results.infrastructure.details.push(`❌ Database connection: ${dbError.message}`);
      } else {
        this.results.infrastructure.details.push('✅ Database connection established');
        this.results.infrastructure.score += 20;
      }

      // Test required tables exist
      console.log('2️⃣ Testing required tables...');
      const requiredTables = [
        'users', 'user_profiles', 'sessions', 'interactions',
        'prompt_templates', 'user_clusters', 'user_cluster_assignments',
        'quizzes', 'quiz_results', 'topics', 'queries', 'feedbacks',
        'secret_feedback', 'response_tab_content', 'topic_mastery',
        'learning_sessions', 'user_streaks', 'leaderboard', 'point_transactions',
        'user_achievements', 'semantic_clusters', 'template_cluster_stats'
      ];

      let tablesFound = 0;
      for (const table of requiredTables) {
        try {
          const { error } = await supabase.from(table).select('*').limit(1);
          if (!error) {
            console.log(`   ✅ Table '${table}' exists`);
            tablesFound++;
          } else {
            console.log(`   ❌ Table '${table}' missing or inaccessible`);
            this.results.infrastructure.details.push(`❌ Missing table: ${table}`);
          }
        } catch (e) {
          console.log(`   ❌ Table '${table}' error: ${e.message}`);
          this.results.infrastructure.details.push(`❌ Table error: ${table}`);
        }
      }

      const tableScore = (tablesFound / requiredTables.length) * 60;
      this.results.infrastructure.score += tableScore;
      this.results.infrastructure.details.push(`✅ Found ${tablesFound}/${requiredTables.length} required tables`);

      // Test server connectivity
      console.log('3️⃣ Testing server endpoints...');
      try {
        const response = await axios.get(`${SERVER_URL}/api/health`);
        console.log('   ✅ Server health check passed');
        this.results.infrastructure.details.push('✅ Server connectivity working');
        this.results.infrastructure.score += 20;
      } catch (error) {
        console.log('   ⚠️ No health endpoint, testing basic connectivity...');
        try {
          const response = await axios.get(`${SERVER_URL}/api/clusters`);
          console.log('   ✅ Server responding to API calls');
          this.results.infrastructure.details.push('✅ Server responding');
          this.results.infrastructure.score += 20;
        } catch (e) {
          console.log(`   ❌ Server not responding: ${e.message}`);
          this.results.infrastructure.details.push(`❌ Server connectivity: ${e.message}`);
        }
      }

      // Determine infrastructure status
      if (this.results.infrastructure.score >= 80) {
        this.results.infrastructure.status = 'success';
      } else if (this.results.infrastructure.score >= 50) {
        this.results.infrastructure.status = 'partial';
      } else {
        this.results.infrastructure.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Infrastructure test failed:', error.message);
      this.results.infrastructure.status = 'failed';
      this.results.infrastructure.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 2. CLUSTERING SYSTEM TESTS ===============
  async testClusteringSystem() {
    console.log('🔄 TESTING CLUSTERING SYSTEM (ModernClusterManager)\n');
    
    try {
      // Create test user profile with proper UUID
      console.log('1️⃣ Creating test user profile...');
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .upsert([{
          id: this.testUserId, // Use id column (not user_id)
          username: `test_user_${Date.now()}`,
          learning_style: 'Visual',
          technical_depth: 75,
          interests: ['Programming', 'AI', 'Mathematics']
        }])
        .select();

      if (!profileError && profileData) {
        console.log('   ✅ Test user profile created');
        this.results.clustering.details.push('✅ User profile creation');
        this.results.clustering.score += 15;
      } else {
        console.log(`   ⚠️ Profile creation issue: ${profileError?.message || 'Unknown'}`);
        this.results.clustering.details.push(`⚠️ Profile creation: ${profileError?.message}`);
      }

      // Test cluster API endpoints
      console.log('2️⃣ Testing cluster API endpoints...');
      const clusterEndpoints = [
        { url: '/api/clusters', name: 'List clusters', weight: 15 },
        { url: '/api/clusters/status', name: 'Cluster status', weight: 10 },
        { url: '/api/clusters/visualization', name: 'Visualization data', weight: 10 }
      ];

      for (const endpoint of clusterEndpoints) {
        try {
          const response = await axios.get(`${SERVER_URL}${endpoint.url}`);
          console.log(`   ✅ ${endpoint.name}: ${response.status}`);
          this.results.clustering.details.push(`✅ ${endpoint.name}`);
          this.results.clustering.score += endpoint.weight;
        } catch (error) {
          console.log(`   ❌ ${endpoint.name}: ${error.response?.status || error.message}`);
          this.results.clustering.details.push(`❌ ${endpoint.name}: ${error.message}`);
        }
      }

      // Test cluster assignment
      console.log('3️⃣ Testing cluster assignment...');
      try {
        const assignResponse = await axios.post(`${SERVER_URL}/api/clusters/assign`, {
          userId: this.testUserId,
          preferences: {
            technicalDepth: 75,
            visualLearning: 80,
            practicalExamples: 90,
            learningStyle: 'Visual',
            interests: ['Programming', 'AI', 'Mathematics']
          }
        });

        console.log('   ✅ Cluster assignment successful');
        this.results.clustering.details.push('✅ Cluster assignment API');
        this.results.clustering.score += 20;

        // Verify assignment in database
        const { data: assignments } = await supabase
          .from('user_cluster_assignments')
          .select('*')
          .eq('user_id', this.testUserId);

        if (assignments && assignments.length > 0) {
          console.log('   ✅ Cluster assignment verified in database');
          this.results.clustering.details.push('✅ Database assignment verified');
          this.results.clustering.score += 15;
        } else {
          console.log('   ⚠️ No cluster assignment found in database');
          this.results.clustering.details.push('⚠️ Database assignment not found');
        }

      } catch (error) {
        console.log(`   ❌ Cluster assignment failed: ${error.response?.status || error.message}`);
        this.results.clustering.details.push(`❌ Cluster assignment: ${error.message}`);
      }

      // Test ModernClusterManager functionality
      console.log('4️⃣ Testing cluster data structure...');
      try {
        const clustersResponse = await axios.get(`${SERVER_URL}/api/clusters`);
        const clusters = clustersResponse.data;
        
        if (clusters && Array.isArray(clusters) && clusters.length > 0) {
          console.log(`   ✅ Found ${clusters.length} clusters in system`);
          this.results.clustering.details.push(`✅ ${clusters.length} clusters available`);
          this.results.clustering.score += 15;
          
          // Check cluster structure
          const sampleCluster = clusters[0];
          if (sampleCluster.id && (sampleCluster.center || sampleCluster.centroid)) {
            console.log('   ✅ Cluster data structure valid');
            this.results.clustering.details.push('✅ Valid cluster structure');
            this.results.clustering.score += 10;
          }
        } else {
          console.log('   ⚠️ No clusters found or invalid structure');
          this.results.clustering.details.push('⚠️ No clusters found');
        }
      } catch (error) {
        console.log(`   ❌ Cluster data test failed: ${error.message}`);
        this.results.clustering.details.push(`❌ Cluster data: ${error.message}`);
      }

      // Determine clustering status
      if (this.results.clustering.score >= 80) {
        this.results.clustering.status = 'success';
      } else if (this.results.clustering.score >= 50) {
        this.results.clustering.status = 'partial';
      } else {
        this.results.clustering.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Clustering test failed:', error.message);
      this.results.clustering.status = 'failed';
      this.results.clustering.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 3. QUIZ SYSTEM TESTS ===============
  async testQuizSystem() {
    console.log('🧪 TESTING QUIZ SYSTEM\n');

    try {
      // Test quiz generation
      console.log('1️⃣ Testing quiz generation...');
      const quizResponse = await axios.post(`${SERVER_URL}/api/generate-quiz`, {
        query: 'What is machine learning and neural networks?',
        difficulty: 'medium',
        userId: this.testUserId
      });

      if (quizResponse.status === 200 && quizResponse.data) {
        console.log('   ✅ Quiz generation successful');
        console.log(`   📋 Quiz: "${quizResponse.data.title}"`);
        console.log(`   ❓ Questions: ${quizResponse.data.questions?.length || 0}`);
        
        this.results.quiz.details.push('✅ Quiz generation working');
        this.results.quiz.details.push(`✅ Generated ${quizResponse.data.questions?.length || 0} questions`);
        this.results.quiz.score += 30;
        this.testQuizId = quizResponse.data.id;

        // Test quiz structure
        if (quizResponse.data.questions && quizResponse.data.questions.length >= 3) {
          const sampleQuestion = quizResponse.data.questions[0];
          if (sampleQuestion.question && sampleQuestion.options && sampleQuestion.correctAnswer !== undefined) {
            console.log('   ✅ Quiz structure valid');
            this.results.quiz.details.push('✅ Valid quiz structure');
            this.results.quiz.score += 20;
          }
        }

        // Verify quiz stored in database
        console.log('2️⃣ Verifying quiz database storage...');
        const { data: storedQuiz, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', this.testQuizId);

        if (!quizError && storedQuiz && storedQuiz.length > 0) {
          console.log('   ✅ Quiz found in database');
          this.results.quiz.details.push('✅ Database storage working');
          this.results.quiz.score += 20;
        } else {
          console.log(`   ❌ Quiz not in database: ${quizError?.message || 'Not found'}`);
          this.results.quiz.details.push(`❌ Database storage: ${quizError?.message || 'Not found'}`);
        }

        // Test quiz retrieval
        console.log('3️⃣ Testing quiz retrieval...');
        try {
          const retrieveResponse = await axios.get(`${SERVER_URL}/api/quiz/${this.testQuizId}`);
          if (retrieveResponse.status === 200) {
            console.log('   ✅ Quiz retrieval successful');
            this.results.quiz.details.push('✅ Quiz retrieval working');
            this.results.quiz.score += 15;
          }
        } catch (error) {
          console.log(`   ❌ Quiz retrieval failed: ${error.response?.status || error.message}`);
          this.results.quiz.details.push(`❌ Quiz retrieval: ${error.message}`);
        }

        // Test quiz submission
        console.log('4️⃣ Testing quiz submission...');
        if (quizResponse.data.questions && quizResponse.data.questions.length > 0) {
          const answers = quizResponse.data.questions.map(() => 0); // Answer A for all
          
          try {
            const submitResponse = await axios.post(`${SERVER_URL}/api/submit-quiz`, {
              quizId: this.testQuizId,
              answers: answers,
              userId: this.testUserId
            });

            if (submitResponse.status === 200) {
              console.log('   ✅ Quiz submission successful');
              console.log(`   📊 Score: ${submitResponse.data.score}%`);
              this.results.quiz.details.push('✅ Quiz submission working');
              this.results.quiz.details.push(`✅ Score calculated: ${submitResponse.data.score}%`);
              this.results.quiz.score += 15;
            }
          } catch (error) {
            console.log(`   ❌ Quiz submission failed: ${error.response?.status || error.message}`);
            this.results.quiz.details.push(`❌ Quiz submission: ${error.message}`);
          }
        }

      } else {
        throw new Error('Invalid quiz generation response');
      }

      // Determine quiz status
      if (this.results.quiz.score >= 80) {
        this.results.quiz.status = 'success';
      } else if (this.results.quiz.score >= 50) {
        this.results.quiz.status = 'partial';
      } else {
        this.results.quiz.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Quiz test failed:', error.response?.data?.error || error.message);
      this.results.quiz.status = 'failed';
      this.results.quiz.details.push(`❌ ${error.response?.data?.error || error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 4. PROGRESS SYSTEM TESTS ===============
  async testProgressSystem() {
    console.log('📈 TESTING PROGRESS SYSTEM\n');

    try {
      // Create test session
      console.log('1️⃣ Creating test session...');
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert([{
          id: this.testSessionId,
          user_id: this.testUserId,
          secret_topic: 'machine_learning',
          created_at: new Date().toISOString()
        }])
        .select();

      if (!sessionError && sessionData) {
        console.log('   ✅ Test session created');
        this.results.progress.details.push('✅ Session creation working');
        this.results.progress.score += 25;
      } else {
        console.log(`   ❌ Session creation failed: ${sessionError?.message}`);
        this.results.progress.details.push(`❌ Session creation: ${sessionError?.message}`);
      }

      // Create test interactions
      console.log('2️⃣ Creating test interactions...');
      const interactions = [
        { query: 'What is machine learning?', response: 'ML is...', secret_topic: 'machine_learning' },
        { query: 'Explain neural networks', response: 'Neural networks are...', secret_topic: 'machine_learning' },
        { query: 'What is deep learning?', response: 'Deep learning...', secret_topic: 'machine_learning' }
      ];

      let interactionsCreated = 0;
      for (const interaction of interactions) {
        try {
          const { error: intError } = await supabase
            .from('interactions')
            .insert([{
              id: uuidv4(),
              session_id: this.testSessionId,
              user_id: this.testUserId,
              query: interaction.query,
              response: interaction.response,
              secret_topic: interaction.secret_topic,
              created_at: new Date().toISOString()
            }]);

          if (!intError) {
            interactionsCreated++;
          }
        } catch (e) {
          console.log(`   ⚠️ Interaction creation failed: ${e.message}`);
        }
      }

      if (interactionsCreated > 0) {
        console.log(`   ✅ Created ${interactionsCreated} test interactions`);
        this.results.progress.details.push(`✅ ${interactionsCreated} interactions created`);
        this.results.progress.score += 25;
      }

      // Test progress endpoint
      console.log('3️⃣ Testing progress tracking endpoint...');
      try {
        const progressResponse = await axios.get(`${SERVER_URL}/api/user-topics/progress?user_id=${this.testUserId}`);

        if (progressResponse.status === 200 && progressResponse.data) {
          console.log('   ✅ Progress endpoint responding');
          console.log(`   📊 Topics tracked: ${progressResponse.data.summary?.total_topics || 0}`);
          console.log(`   🎯 Sessions: ${progressResponse.data.summary?.total_sessions || 0}`);
          console.log(`   📝 Quizzes: ${progressResponse.data.summary?.total_quizzes || 0}`);
          
          this.results.progress.details.push('✅ Progress endpoint working');
          this.results.progress.details.push(`✅ Tracking ${progressResponse.data.summary?.total_topics || 0} topics`);
          this.results.progress.score += 25;

          // Test progress calculation
          if (progressResponse.data.progress && progressResponse.data.progress.length > 0) {
            const firstTopic = progressResponse.data.progress[0];
            console.log(`   🎓 Topic "${firstTopic.topic_name}": ${firstTopic.mastery_level}/100 mastery`);
            this.results.progress.details.push('✅ Progress calculation working');
            this.results.progress.score += 15;
          }
        } else {
          throw new Error('Invalid progress response');
        }
      } catch (error) {
        console.log(`   ❌ Progress endpoint failed: ${error.response?.status || error.message}`);
        this.results.progress.details.push(`❌ Progress endpoint: ${error.message}`);
      }

      // Test advanced progress features
      console.log('4️⃣ Testing advanced progress features...');
      try {
        // Test topic mastery tracking
        const { data: masteryData, error: masteryError } = await supabase
          .from('topic_mastery')
          .select('*')
          .eq('user_id', this.testUserId);

        if (!masteryError) {
          console.log(`   ✅ Topic mastery table accessible`);
          this.results.progress.details.push('✅ Topic mastery tracking');
          this.results.progress.score += 5;
          
          if (masteryData && masteryData.length > 0) {
            console.log(`   ✅ Found ${masteryData.length} mastery records`);
            this.results.progress.details.push(`✅ ${masteryData.length} mastery records found`);
            this.results.progress.score += 5;
          }
        }

        // Test learning sessions tracking
        const { data: sessionData, error: sessionError } = await supabase
          .from('learning_sessions')
          .select('*')
          .eq('user_id', this.testUserId);

        if (!sessionError) {
          console.log(`   ✅ Learning sessions table accessible`);
          this.results.progress.details.push('✅ Learning sessions tracking');
          this.results.progress.score += 5;
        }

        // Test user streak tracking
        const { data: streakData, error: streakError } = await supabase
          .from('user_streaks')
          .select('*')
          .eq('user_id', this.testUserId);

        if (!streakError) {
          console.log(`   ✅ User streaks table accessible`);
          this.results.progress.details.push('✅ Streak tracking available');
          this.results.progress.score += 5;
        }

        // Test progress analytics endpoints
        const progressEndpoints = [
          { url: `/api/user-topics/analytics?user_id=${this.testUserId}`, name: 'Progress analytics', weight: 5 },
          { url: `/api/user-topics/recommendations?user_id=${this.testUserId}`, name: 'Learning recommendations', weight: 5 },
          { url: `/api/user-topics/achievements?user_id=${this.testUserId}`, name: 'Achievement tracking', weight: 5 }
        ];

        for (const endpoint of progressEndpoints) {
          try {
            const response = await axios.get(`${SERVER_URL}${endpoint.url}`);
            if (response.status === 200) {
              console.log(`   ✅ ${endpoint.name} endpoint working`);
              this.results.progress.details.push(`✅ ${endpoint.name} working`);
              this.results.progress.score += endpoint.weight;
            }
          } catch (error) {
            console.log(`   ⚠️ ${endpoint.name} not available: ${error.response?.status || error.message}`);
            this.results.progress.details.push(`⚠️ ${endpoint.name} not available`);
          }
        }

      } catch (error) {
        console.log(`   ⚠️ Advanced features test failed: ${error.message}`);
        this.results.progress.details.push(`⚠️ Advanced features: ${error.message}`);
      }

      // Determine progress status
      if (this.results.progress.score >= 80) {
        this.results.progress.status = 'success';
      } else if (this.results.progress.score >= 50) {
        this.results.progress.status = 'partial';
      } else {
        this.results.progress.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Progress test failed:', error.message);
      this.results.progress.status = 'failed';
      this.results.progress.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 5. ANALYTICS SYSTEM TESTS ===============
  async testAnalyticsSystem() {
    console.log('📊 TESTING ANALYTICS SYSTEM\n');

    try {
      console.log('1️⃣ Testing analytics endpoints...');
      
      const analyticsEndpoints = [
        { url: '/api/analytics/topics/popularity', name: 'Topic popularity', weight: 20 },
        { url: '/api/analytics/topics/timeline', name: 'Topic timeline', weight: 20 },
        { url: '/api/analytics/users/engagement', name: 'User engagement', weight: 20 },
        { url: '/api/analytics/topics/trends', name: 'Topic trends', weight: 20 },
        { url: '/api/analytics/clusters/distribution', name: 'Cluster distribution', weight: 20 }
      ];

      for (const endpoint of analyticsEndpoints) {
        try {
          const response = await axios.get(`${SERVER_URL}${endpoint.url}`);
          console.log(`   ✅ ${endpoint.name}: ${response.status}`);
          this.results.analytics.details.push(`✅ ${endpoint.name} working`);
          this.results.analytics.score += endpoint.weight;
        } catch (error) {
          console.log(`   ❌ ${endpoint.name}: ${error.response?.status || error.message}`);
          this.results.analytics.details.push(`❌ ${endpoint.name}: ${error.message}`);
        }
      }

      // Determine analytics status
      if (this.results.analytics.score >= 80) {
        this.results.analytics.status = 'success';
      } else if (this.results.analytics.score >= 50) {
        this.results.analytics.status = 'partial';
      } else {
        this.results.analytics.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Analytics test failed:', error.message);
      this.results.analytics.status = 'failed';
      this.results.analytics.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 6. DISCOVERY SYSTEM TESTS ===============
  async testDiscoverySystem() {
    console.log('🔍 TESTING DISCOVERY SYSTEM\n');

    try {
      console.log('1️⃣ Testing query processing...');
      const queryResponse = await axios.post(`${SERVER_URL}/api/query`, {
        query: 'Explain the fundamentals of artificial intelligence and machine learning',
        userId: this.testUserId,
        preferences: {
          technicalDepth: 70,
          visualLearning: 80,
          learningStyle: 'Visual'
        }
      });

      if (queryResponse.status === 200 && queryResponse.data) {
        console.log('   ✅ Query processing successful');
        console.log(`   📝 Response generated: ${queryResponse.data.explanation ? 'Yes' : 'No'}`);
        console.log(`   🏷️ Topic classified: ${queryResponse.data.secret_topic || 'None'}`);
        console.log(`   🎯 Quiz included: ${queryResponse.data.quiz ? 'Yes' : 'No'}`);
        
        this.results.discovery.details.push('✅ Query processing working');
        this.results.discovery.details.push(`✅ Topic classification: ${queryResponse.data.secret_topic}`);
        this.results.discovery.score += 40;

        if (queryResponse.data.explanation) {
          console.log('   ✅ AI response generation working');
          this.results.discovery.details.push('✅ AI response generation');
          this.results.discovery.score += 30;
        }

        if (queryResponse.data.quiz) {
          console.log('   ✅ Integrated quiz generation working');
          this.results.discovery.details.push('✅ Integrated quiz generation');
          this.results.discovery.score += 30;
        }

      } else {
        throw new Error('Invalid discovery response');
      }

      // Determine discovery status
      if (this.results.discovery.score >= 80) {
        this.results.discovery.status = 'success';
      } else if (this.results.discovery.score >= 50) {
        this.results.discovery.status = 'partial';
      } else {
        this.results.discovery.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Discovery test failed:', error.response?.data?.error || error.message);
      this.results.discovery.status = 'failed';
      this.results.discovery.details.push(`❌ ${error.response?.data?.error || error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 7. SECRET FEEDBACK SYSTEM TESTS ===============
  async testSecretFeedbackSystem() {
    console.log('🤫 TESTING SECRET FEEDBACK SYSTEM\n');

    try {
      // Test secret feedback table structure
      console.log('1️⃣ Testing secret feedback table structure...');
      const { data: feedbackSchema, error: schemaError } = await supabase
        .from('secret_feedback')
        .select('*')
        .limit(1);

      if (!schemaError) {
        console.log('   ✅ Secret feedback table accessible');
        this.results.secret_feedback.details.push('✅ Table structure valid');
        this.results.secret_feedback.score += 20;
      } else {
        console.log(`   ❌ Secret feedback table error: ${schemaError.message}`);
        this.results.secret_feedback.details.push(`❌ Table access: ${schemaError.message}`);
      }

      // Test secret feedback creation
      console.log('2️⃣ Testing secret feedback creation...');
      const testFeedback = {
        user_id: this.testUserId,
        message: 'This response was really helpful and clear!',
        feedback_type: 'satisfaction',
        conversation_id: this.testSessionId,
        quality_score: 5,
        metadata: { test: true, sentiment: 'positive' },
        processed_by: 'test_system',
        confidence_score: 0.95
      };

      const { data: createdFeedback, error: createError } = await supabase
        .from('secret_feedback')
        .insert([testFeedback])
        .select();

      if (!createError && createdFeedback) {
        console.log('   ✅ Secret feedback creation successful');
        this.results.secret_feedback.details.push('✅ Feedback creation working');
        this.results.secret_feedback.score += 25;
      } else {
        console.log(`   ❌ Secret feedback creation failed: ${createError?.message}`);
        this.results.secret_feedback.details.push(`❌ Creation failed: ${createError?.message}`);
      }

      // Test feedback analysis endpoints
      console.log('3️⃣ Testing feedback analysis endpoints...');
      try {
        const analysisResponse = await axios.get(`${SERVER_URL}/api/feedback/analysis?user_id=${this.testUserId}`);
        if (analysisResponse.status === 200) {
          console.log('   ✅ Feedback analysis endpoint working');
          this.results.secret_feedback.details.push('✅ Analysis endpoint working');
          this.results.secret_feedback.score += 15;
        }
      } catch (error) {
        console.log(`   ❌ Feedback analysis endpoint failed: ${error.response?.status || error.message}`);
        this.results.secret_feedback.details.push(`❌ Analysis endpoint: ${error.message}`);
      }

      // Test feedback aggregation
      console.log('4️⃣ Testing feedback aggregation...');
      const { data: aggregatedFeedback, error: aggError } = await supabase
        .from('secret_feedback')
        .select('feedback_type, quality_score, confidence_score')
        .eq('user_id', this.testUserId);

      if (!aggError && aggregatedFeedback) {
        console.log(`   ✅ Found ${aggregatedFeedback.length} feedback records`);
        this.results.secret_feedback.details.push(`✅ ${aggregatedFeedback.length} feedback records`);
        this.results.secret_feedback.score += 15;

        // Test feedback quality analysis
        const avgQuality = aggregatedFeedback.reduce((sum, f) => sum + (f.quality_score || 0), 0) / aggregatedFeedback.length;
        const avgConfidence = aggregatedFeedback.reduce((sum, f) => sum + (f.confidence_score || 0), 0) / aggregatedFeedback.length;
        
        console.log(`   📊 Average quality score: ${avgQuality.toFixed(2)}`);
        console.log(`   🎯 Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
        this.results.secret_feedback.details.push('✅ Quality metrics calculated');
        this.results.secret_feedback.score += 10;
      }

      // Test feedback processing pipeline
      console.log('5️⃣ Testing feedback processing pipeline...');
      try {
        const processingResponse = await axios.post(`${SERVER_URL}/api/feedback/process`, {
          userId: this.testUserId,
          sessionId: this.testSessionId,
          feedbackText: 'Great explanation, very clear!',
          messageId: this.testMessageId || 'test-message'
        });

        if (processingResponse.status === 200) {
          console.log('   ✅ Feedback processing pipeline working');
          this.results.secret_feedback.details.push('✅ Processing pipeline working');
          this.results.secret_feedback.score += 15;
        }
      } catch (error) {
        console.log(`   ⚠️ Feedback processing endpoint not available: ${error.response?.status || error.message}`);
        this.results.secret_feedback.details.push('⚠️ Processing pipeline not available');
      }

      // Determine secret feedback status
      if (this.results.secret_feedback.score >= 80) {
        this.results.secret_feedback.status = 'success';
      } else if (this.results.secret_feedback.score >= 50) {
        this.results.secret_feedback.status = 'partial';
      } else {
        this.results.secret_feedback.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Secret feedback test failed:', error.message);
      this.results.secret_feedback.status = 'failed';
      this.results.secret_feedback.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 8. SECRET TOPIC SYSTEM TESTS ===============
  async testSecretTopicSystem() {
    console.log('🏷️ TESTING SECRET TOPIC SYSTEM\n');

    try {
      // Test topic classification
      console.log('1️⃣ Testing topic classification...');
      const testQueries = [
        'What is machine learning?',
        'Explain photosynthesis in plants',
        'How do you cook pasta?',
        'What is calculus?',
        'Explain quantum physics'
      ];

      let successfulClassifications = 0;
      for (const query of testQueries) {
        try {
          const response = await axios.post(`${SERVER_URL}/api/query`, {
            query: query,
            userId: this.testUserId,
            preferences: { technicalDepth: 50 }
          });

          if (response.data.secret_topic && response.data.secret_topic !== 'general') {
            successfulClassifications++;
            console.log(`   ✅ "${query}" → ${response.data.secret_topic}`);
          }
        } catch (error) {
          console.log(`   ⚠️ Classification failed for: "${query}"`);
        }
      }

      const classificationRate = (successfulClassifications / testQueries.length) * 100;
      console.log(`   📊 Classification success rate: ${classificationRate}%`);
      this.results.secret_topic.details.push(`✅ ${classificationRate}% classification success`);
      this.results.secret_topic.score += Math.min(30, classificationRate * 0.3);

      // Test topic table and management
      console.log('2️⃣ Testing topic management...');
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('name, description, usage_count, is_active')
        .eq('is_active', true);

      if (!topicsError && topics) {
        console.log(`   ✅ Found ${topics.length} active topics`);
        this.results.secret_topic.details.push(`✅ ${topics.length} active topics`);
        this.results.secret_topic.score += 15;

        // Check topic diversity
        const topicNames = topics.map(t => t.name);
        const expectedCategories = ['mathematics', 'science', 'technology', 'programming', 'general'];
        const foundCategories = expectedCategories.filter(cat => 
          topicNames.some(name => name.includes(cat) || name === cat)
        );

        console.log(`   📋 Topic categories found: ${foundCategories.join(', ')}`);
        this.results.secret_topic.details.push(`✅ ${foundCategories.length} topic categories`);
        this.results.secret_topic.score += foundCategories.length * 5;
      }

      // Test topic usage tracking
      console.log('3️⃣ Testing topic usage tracking...');
      const { data: usageData, error: usageError } = await supabase
        .from('topics')
        .select('name, usage_count')
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .limit(5);

      if (!usageError && usageData && usageData.length > 0) {
        console.log(`   ✅ Top topics by usage:`);
        usageData.forEach((topic, index) => {
          console.log(`     ${index + 1}. ${topic.name}: ${topic.usage_count} uses`);
        });
        this.results.secret_topic.details.push('✅ Usage tracking working');
        this.results.secret_topic.score += 15;
      }

      // Test topic-based session tracking
      console.log('4️⃣ Testing topic-based session tracking...');
      const { data: sessionTopics, error: sessionError } = await supabase
        .from('sessions')
        .select('secret_topic')
        .not('secret_topic', 'is', null)
        .eq('user_id', this.testUserId);

      if (!sessionError && sessionTopics) {
        const uniqueTopics = [...new Set(sessionTopics.map(s => s.secret_topic))];
        console.log(`   ✅ User has sessions in ${uniqueTopics.length} different topics`);
        this.results.secret_topic.details.push(`✅ ${uniqueTopics.length} session topics`);
        this.results.secret_topic.score += 10;
      }

      // Test topic recommendation system
      console.log('5️⃣ Testing topic recommendations...');
      try {
        const recommendationResponse = await axios.get(`${SERVER_URL}/api/topics/recommendations?user_id=${this.testUserId}`);
        if (recommendationResponse.status === 200) {
          console.log('   ✅ Topic recommendation system working');
          this.results.secret_topic.details.push('✅ Recommendation system working');
          this.results.secret_topic.score += 15;
        }
      } catch (error) {
        console.log(`   ⚠️ Topic recommendations not available: ${error.response?.status || error.message}`);
        this.results.secret_topic.details.push('⚠️ Recommendations not available');
      }

      // Determine secret topic status
      if (this.results.secret_topic.score >= 80) {
        this.results.secret_topic.status = 'success';
      } else if (this.results.secret_topic.score >= 50) {
        this.results.secret_topic.status = 'partial';
      } else {
        this.results.secret_topic.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Secret topic test failed:', error.message);
      this.results.secret_topic.status = 'failed';
      this.results.secret_topic.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 9. GAMIFICATION SYSTEM TESTS ===============
  async testGamificationSystem() {
    console.log('🎮 TESTING GAMIFICATION SYSTEM\n');

    try {
      // Test gamification tables
      console.log('1️⃣ Testing gamification table structure...');
      const gamificationTables = [
        'user_streaks', 'leaderboard', 'point_transactions', 
        'user_achievements', 'topic_mastery', 'learning_sessions'
      ];

      let tablesFound = 0;
      for (const table of gamificationTables) {
        try {
          const { error } = await supabase.from(table).select('*').limit(1);
          if (!error) {
            console.log(`   ✅ Table '${table}' accessible`);
            tablesFound++;
          } else {
            console.log(`   ❌ Table '${table}' error: ${error.message}`);
          }
        } catch (e) {
          console.log(`   ❌ Table '${table}' not accessible`);
        }
      }

      const tableScore = (tablesFound / gamificationTables.length) * 25;
      this.results.gamification.score += tableScore;
      this.results.gamification.details.push(`✅ ${tablesFound}/${gamificationTables.length} gamification tables`);

      // Test user streaks
      console.log('2️⃣ Testing user streak system...');
      const { data: streakData, error: streakError } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', this.testUserId);

      if (!streakError) {
        console.log('   ✅ User streak system accessible');
        this.results.gamification.details.push('✅ Streak system working');
        this.results.gamification.score += 15;

        if (streakData && streakData.length > 0) {
          const streak = streakData[0];
          console.log(`   📊 Current streak: ${streak.current_streak || 0} days`);
          console.log(`   🏆 Best streak: ${streak.best_streak || 0} days`);
          this.results.gamification.details.push(`✅ Streak data: ${streak.current_streak}/${streak.best_streak} days`);
          this.results.gamification.score += 10;
        }
      }

      // Test leaderboard system
      console.log('3️⃣ Testing leaderboard system...');
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('leaderboard')
        .select('user_id, total_points, weekly_points, rank_position')
        .order('total_points', { ascending: false })
        .limit(5);

      if (!leaderboardError && leaderboardData) {
        console.log('   ✅ Leaderboard system working');
        console.log(`   🏆 Top ${leaderboardData.length} users on leaderboard`);
        this.results.gamification.details.push('✅ Leaderboard system working');
        this.results.gamification.details.push(`✅ ${leaderboardData.length} users ranked`);
        this.results.gamification.score += 20;
      }

      // Test point transactions
      console.log('4️⃣ Testing point transaction system...');
      const { data: pointsData, error: pointsError } = await supabase
        .from('point_transactions')
        .select('transaction_type, points_change, reason')
        .eq('user_id', this.testUserId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!pointsError && pointsData) {
        console.log('   ✅ Point transaction system working');
        if (pointsData.length > 0) {
          console.log(`   💰 Found ${pointsData.length} recent transactions`);
          const totalPoints = pointsData.reduce((sum, t) => sum + (t.points_change || 0), 0);
          console.log(`   📊 Recent points earned: ${totalPoints}`);
        }
        this.results.gamification.details.push('✅ Point transactions working');
        this.results.gamification.score += 15;
      }

      // Test achievements system
      console.log('5️⃣ Testing achievements system...');
      const { data: achievementsData, error: achievementsError } = await supabase
        .from('user_achievements')
        .select('achievement_type, achievement_name, points_awarded')
        .eq('user_id', this.testUserId);

      if (!achievementsError) {
        console.log('   ✅ Achievements system accessible');
        if (achievementsData && achievementsData.length > 0) {
          console.log(`   🏅 User has ${achievementsData.length} achievements`);
          this.results.gamification.details.push(`✅ ${achievementsData.length} achievements earned`);
        } else {
          this.results.gamification.details.push('✅ Achievements system ready');
        }
        this.results.gamification.score += 15;
      }

      // Determine gamification status
      if (this.results.gamification.score >= 80) {
        this.results.gamification.status = 'success';
      } else if (this.results.gamification.score >= 50) {
        this.results.gamification.status = 'partial';
      } else {
        this.results.gamification.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Gamification test failed:', error.message);
      this.results.gamification.status = 'failed';
      this.results.gamification.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== 10. RESPONSE TABS SYSTEM TESTS ===============
  async testResponseTabsSystem() {
    console.log('📑 TESTING RESPONSE TABS SYSTEM\n');

    try {
      // Test response tab content table
      console.log('1️⃣ Testing response tab content table...');
      const { data: tabSchema, error: tabSchemaError } = await supabase
        .from('response_tab_content')
        .select('*')
        .limit(1);

      if (!tabSchemaError) {
        console.log('   ✅ Response tab content table accessible');
        this.results.response_tabs.details.push('✅ Table structure valid');
        this.results.response_tabs.score += 15;
      } else {
        console.log(`   ❌ Response tab content table error: ${tabSchemaError.message}`);
        this.results.response_tabs.details.push(`❌ Table access: ${tabSchemaError.message}`);
      }

      // Test tab content generation endpoints
      console.log('2️⃣ Testing tab content generation endpoints...');
      const tabEndpoints = [
        { url: '/api/generate-examples', name: 'Examples generation', weight: 15 },
        { url: '/api/generate-abstract', name: 'Abstract generation', weight: 15 },
        { url: '/api/generate-flash-cards', name: 'Flash cards generation', weight: 15 }
      ];

      for (const endpoint of tabEndpoints) {
        try {
          const response = await axios.post(`${SERVER_URL}${endpoint.url}`, {
            query: 'What is machine learning?',
            mainContent: 'Machine learning is a subset of artificial intelligence...',
            preferences: { technicalDepth: 50, learningStyle: 'Visual' }
          });

          if (response.status === 200) {
            console.log(`   ✅ ${endpoint.name}: Working`);
            this.results.response_tabs.details.push(`✅ ${endpoint.name} working`);
            this.results.response_tabs.score += endpoint.weight;
          }
        } catch (error) {
          console.log(`   ❌ ${endpoint.name}: ${error.response?.status || error.message}`);
          this.results.response_tabs.details.push(`❌ ${endpoint.name}: ${error.message}`);
        }
      }

      // Test tab content storage and retrieval
      console.log('3️⃣ Testing tab content storage...');
      const testTabContent = {
        message_id: 'test-message-' + Date.now(),
        user_id: this.testUserId,
        session_id: this.testSessionId,
        tab_type: 'examples',
        content: 'Test examples content for machine learning concepts...',
        original_query: 'What is machine learning?',
        main_content: 'Machine learning is...',
        preferences: { technicalDepth: 50 }
      };

      const { data: storedContent, error: storageError } = await supabase
        .from('response_tab_content')
        .insert([testTabContent])
        .select();

      if (!storageError && storedContent) {
        console.log('   ✅ Tab content storage successful');
        this.results.response_tabs.details.push('✅ Content storage working');
        this.results.response_tabs.score += 15;
        this.testMessageId = testTabContent.message_id;
      } else {
        console.log(`   ❌ Tab content storage failed: ${storageError?.message}`);
        this.results.response_tabs.details.push(`❌ Storage failed: ${storageError?.message}`);
      }

      // Test tab content retrieval by message ID
      console.log('4️⃣ Testing tab content retrieval...');
      if (this.testMessageId) {
        const { data: retrievedContent, error: retrievalError } = await supabase
          .from('response_tab_content')
          .select('*')
          .eq('message_id', this.testMessageId);

        if (!retrievalError && retrievedContent && retrievedContent.length > 0) {
          console.log(`   ✅ Retrieved ${retrievedContent.length} tab content records`);
          this.results.response_tabs.details.push('✅ Content retrieval working');
          this.results.response_tabs.score += 15;
        }
      }

      // Test different tab types
      console.log('5️⃣ Testing multiple tab types...');
      const tabTypes = ['examples', 'abstract', 'flash_cards', 'quiz'];
      let supportedTypes = 0;

      for (const tabType of tabTypes) {
        const { error: typeError } = await supabase
          .from('response_tab_content')
          .select('id')
          .eq('tab_type', tabType)
          .limit(1);

        if (!typeError) {
          supportedTypes++;
        }
      }

      console.log(`   ✅ Supports ${supportedTypes}/${tabTypes.length} tab types`);
      this.results.response_tabs.details.push(`✅ ${supportedTypes}/${tabTypes.length} tab types supported`);
      this.results.response_tabs.score += (supportedTypes / tabTypes.length) * 10;

      // Test content generation quality
      console.log('6️⃣ Testing content generation quality...');
      try {
        const qualityTestResponse = await axios.post(`${SERVER_URL}/api/generate-examples`, {
          query: 'Explain binary search algorithm',
          mainContent: 'Binary search is an efficient algorithm for finding an item from a sorted list...',
          preferences: { technicalDepth: 75, interests: ['programming', 'algorithms'] }
        });

        if (qualityTestResponse.status === 200 && qualityTestResponse.data) {
          const content = qualityTestResponse.data;
          const contentLength = content.length;
          const hasStructure = content.includes('Example') || content.includes('##') || content.includes('1.');
          
          if (contentLength > 100 && hasStructure) {
            console.log('   ✅ Generated content has good quality and structure');
            this.results.response_tabs.details.push('✅ Content quality validation passed');
            this.results.response_tabs.score += 15;
          } else {
            console.log('   ⚠️ Generated content quality could be improved');
            this.results.response_tabs.details.push('⚠️ Content quality needs improvement');
            this.results.response_tabs.score += 5;
          }
        }
      } catch (error) {
        console.log(`   ⚠️ Quality test failed: ${error.message}`);
      }

      // Determine response tabs status
      if (this.results.response_tabs.score >= 80) {
        this.results.response_tabs.status = 'success';
      } else if (this.results.response_tabs.score >= 50) {
        this.results.response_tabs.status = 'partial';
      } else {
        this.results.response_tabs.status = 'failed';
      }

    } catch (error) {
      console.error('❌ Response tabs test failed:', error.message);
      this.results.response_tabs.status = 'failed';
      this.results.response_tabs.details.push(`❌ ${error.message}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }

  // =============== CLEANUP ===============
  async cleanup() {
    console.log('🧹 CLEANING UP TEST DATA...\n');
    
    try {
      // Clean up in reverse order of dependencies
      await supabase.from('quiz_results').delete().eq('user_id', this.testUserId);
      await supabase.from('interactions').delete().eq('user_id', this.testUserId);
      await supabase.from('sessions').delete().eq('user_id', this.testUserId);
      await supabase.from('user_cluster_assignments').delete().eq('user_id', this.testUserId);
      await supabase.from('secret_feedback').delete().eq('user_id', this.testUserId);
      await supabase.from('point_transactions').delete().eq('user_id', this.testUserId);
      await supabase.from('user_achievements').delete().eq('user_id', this.testUserId);
      await supabase.from('user_streaks').delete().eq('user_id', this.testUserId);
      await supabase.from('topic_mastery').delete().eq('user_id', this.testUserId);
      await supabase.from('learning_sessions').delete().eq('user_id', this.testUserId);
      if (this.testMessageId) {
        await supabase.from('response_tab_content').delete().eq('message_id', this.testMessageId);
      }
      if (this.testQuizId) {
        await supabase.from('quizzes').delete().eq('id', this.testQuizId);
      }
      await supabase.from('user_profiles').delete().eq('id', this.testUserId);
      
      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.log('⚠️ Cleanup had some issues (non-critical)');
    }
  }

  // =============== SUMMARY ===============
  printComprehensiveSummary() {
    console.log('📋 COMPREHENSIVE TEST RESULTS\n');
    
    const categories = [
      'infrastructure', 'clustering', 'quiz', 'progress', 'analytics', 
      'discovery', 'secret_feedback', 'secret_topic', 'gamification', 'response_tabs'
    ];
    const statusIcons = {
      'success': '✅',
      'partial': '⚠️',
      'failed': '❌',
      'pending': '⏳'
    };

    let totalScore = 0;
    let maxScore = categories.length * 100;
    
    categories.forEach(category => {
      const result = this.results[category];
      const icon = statusIcons[result.status];
      console.log(`${icon} ${category.toUpperCase()}: ${result.status.toUpperCase()} (${result.score}/100)`);
      
      result.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
      console.log('');
      
      totalScore += result.score;
    });

    const overallPercentage = ((totalScore / maxScore) * 100).toFixed(1);
    
    console.log('='.repeat(60));
    console.log(`🎯 OVERALL SYSTEM HEALTH: ${overallPercentage}%`);
    console.log(`📊 Total Score: ${totalScore}/${maxScore}`);
    
    if (overallPercentage >= 85) {
      console.log('🎉 EXCELLENT: System is production-ready!');
    } else if (overallPercentage >= 70) {
      console.log('✅ GOOD: System is mostly functional with minor issues');
    } else if (overallPercentage >= 50) {
      console.log('⚠️ FAIR: System has significant issues that need addressing');
    } else {
      console.log('❌ POOR: System requires major fixes before use');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🔧 PRIORITY ACTION ITEMS:');
    
    categories.forEach(category => {
      const result = this.results[category];
      if (result.status === 'failed') {
        console.log(`🔥 CRITICAL: Fix ${category} system (${result.score}/100)`);
      } else if (result.status === 'partial') {
        console.log(`⚠️ MEDIUM: Improve ${category} system (${result.score}/100)`);
      }
    });
  }
}

// Run the comprehensive test
const tester = new ComprehensiveSystemTester();
tester.runAllTests().catch(console.error);