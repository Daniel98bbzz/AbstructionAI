import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (same as server)
dotenv.config();

// Initialize Supabase client (same as server)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createClusterBestTemplateView() {
  console.log('🚀 Creating cluster_best_template view in database...\n');
  console.log('🔗 Connected to:', supabaseUrl.substring(0, 30) + '...');

  // Corrected SQL that uses the actual table schema
  const createViewSQL = `
-- Create cluster_best_template view for crowd wisdom template selection
-- This view finds the best template for each cluster based on usage and follow-up patterns

CREATE OR REPLACE VIEW cluster_best_template AS
WITH cluster_template_stats AS (
  SELECT 
    ptu.cluster_id,
    ptu.template_id,
    COUNT(*) as usage_count,
    -- Use follow-up rate as a quality indicator (lower follow-up = better initial response)
    AVG(CASE WHEN ptu.had_follow_up THEN 0 ELSE 1 END) as success_rate,
    -- Weight by usage count and success rate
    (COUNT(*) * 0.4 + AVG(CASE WHEN ptu.had_follow_up THEN 0 ELSE 1 END) * 0.6) as weighted_score
  FROM prompt_template_usage ptu
  WHERE ptu.cluster_id IS NOT NULL
    AND ptu.template_id IS NOT NULL
  GROUP BY ptu.cluster_id, ptu.template_id
),
cluster_best AS (
  SELECT 
    cluster_id,
    template_id,
    usage_count,
    success_rate,
    weighted_score,
    ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY weighted_score DESC, usage_count DESC) as rank
  FROM cluster_template_stats
)
SELECT 
  cluster_id,
  template_id,
  usage_count,
  success_rate,
  weighted_score
FROM cluster_best 
WHERE rank = 1;
`;

  try {
    console.log('📊 Step 1: Attempting to create view using direct SQL execution...');
    
    // Try using the apply_migration function if it exists
    const { data: migrationResult, error: migrationError } = await supabase
      .rpc('apply_migration', { 
        name: 'create_cluster_best_template_view',
        query: createViewSQL 
      });
    
    if (migrationError) {
      console.log('⚠️  Migration RPC not available, trying alternative approaches...');
      
      // Try exec_sql with different parameter name
      const { error: execError } = await supabase
        .rpc('exec_sql', { sql_text: createViewSQL });
      
      if (execError) {
        console.log('⚠️  exec_sql also failed, trying direct table insertion...');
        
        // Alternative: Create the view manually by inserting the SQL as a "migration"
        const migrationRecord = {
          name: 'create_cluster_best_template_view',
          query: createViewSQL,
          created_at: new Date().toISOString()
        };
        
        // This won't actually create the view, but will show you what needs to be done
        console.log('❌ Cannot execute SQL directly through API');
        console.log('📋 You need to run this SQL manually in your Supabase dashboard:');
        console.log('');
        console.log('═'.repeat(80));
        console.log(createViewSQL);
        console.log('═'.repeat(80));
        console.log('');
        console.log('📍 Instructions:');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the SQL above');
        console.log('4. Click "Run" to execute');
        console.log('');
      } else {
        console.log('✅ View created successfully using exec_sql!');
      }
    } else {
      console.log('✅ View created successfully using apply_migration!');
    }

    // Test if the view was created successfully
    console.log('🧪 Step 2: Testing the view...');
    
    const { data: viewTest, error: viewError } = await supabase
      .from('cluster_best_template')
      .select('*')
      .limit(1);
    
    if (viewError) {
      console.log('❌ View test failed:', viewError.message);
      if (viewError.code === '42P01') {
        console.log('💡 The view does not exist yet. Please create it manually using the SQL above.');
      }
    } else {
      console.log('✅ View created and tested successfully!');
      console.log('📊 View data:', viewTest);
      
      if (viewTest.length === 0) {
        console.log('ℹ️  View is empty (expected - no template usage data with cluster_id yet)');
      } else {
        console.log('🎉 Found template data in view!');
      }
    }

    // Step 3: Show current template usage that will populate the view
    console.log('\n📈 Step 3: Checking template usage data...');
    
    const { data: usageData, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('id, template_id, cluster_id, had_follow_up, created_at')
      .not('cluster_id', 'is', null)
      .limit(10);
    
    if (usageError) {
      console.log('❌ Error checking usage data:', usageError.message);
    } else {
      console.log(`📊 Found ${usageData.length} template usage records with cluster_id`);
      
      if (usageData.length === 0) {
        console.log('💡 No template usage with cluster_id found yet.');
        console.log('   The view will populate as the system creates more template usage records.');
      } else {
        console.log('✅ Template usage records:');
        usageData.forEach((usage, i) => {
          console.log(`  ${i+1}. Template ${usage.template_id} → Cluster ${usage.cluster_id} (Follow-up: ${usage.had_follow_up})`);
        });
      }
    }

    console.log('\n🎯 Next Steps:');
    console.log('1. ✅ Clustering is working (clusters 0, 1 created)');
    console.log('2. 🔄 Create the view using the SQL above if not created automatically');
    console.log('3. 🚀 Restart your server to pick up the changes');
    console.log('4. 🧪 Test with queries to see improved template selection');
    console.log('');
    console.log('Expected behavior after restart:');
    console.log('• "What is recursion?" → Should use cluster 1 templates');
    console.log('• "What is machine learning?" → Should use cluster 0 templates'); 
    console.log('• Template selection should stop falling back to default');

  } catch (error) {
    console.error('❌ Error creating view:', error);
    console.log('\n📋 Manual SQL to execute in Supabase dashboard:');
    console.log('═'.repeat(80));
    console.log(createViewSQL);
    console.log('═'.repeat(80));
  }
}

// Run the function
createClusterBestTemplateView(); 