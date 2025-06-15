import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables (same as server)
dotenv.config();

// Initialize Supabase client (same as server)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please check your .env file.');
  console.error('Expected: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  console.error('Or: SUPABASE_URL and SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCrowdWisdomIssues() {
  console.log('🔧 Starting Crowd Wisdom fixes...\n');
  console.log('🔗 Using Supabase URL:', supabaseUrl.substring(0, 30) + '...');

  try {
    // Step 1: Create the missing cluster_best_template view
    console.log('📊 Step 1: Creating cluster_best_template view...');
    
    const createViewSQL = `
      -- Create cluster_best_template view for crowd wisdom template selection
      CREATE OR REPLACE VIEW cluster_best_template AS
      WITH cluster_template_stats AS (
        SELECT 
          ptu.cluster_id,
          ptu.template_id,
          COUNT(*) as usage_count,
          AVG(COALESCE(ptu.feedback_score, 3)) as avg_feedback,
          -- Weight by usage count and feedback score
          (COUNT(*) * 0.3 + AVG(COALESCE(ptu.feedback_score, 3)) * 0.7) as weighted_score
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
          avg_feedback,
          weighted_score,
          ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY weighted_score DESC, usage_count DESC) as rank
        FROM cluster_template_stats
      )
      SELECT 
        cluster_id,
        template_id,
        usage_count,
        avg_feedback,
        weighted_score
      FROM cluster_best 
      WHERE rank = 1;
    `;

    // Try to execute the view creation using RPC
    try {
      const { error: viewError } = await supabase.rpc('exec_sql', { sql: createViewSQL });
      
      if (viewError) {
        console.error('❌ RPC exec_sql failed:', viewError);
        console.log('💡 You may need to create the view manually in your Supabase dashboard');
        console.log('📋 SQL to run manually:');
        console.log(createViewSQL);
      } else {
        console.log('✅ cluster_best_template view created successfully via RPC');
      }
    } catch (rpcError) {
      console.error('❌ RPC not available:', rpcError.message);
      console.log('💡 You need to create the view manually in your Supabase dashboard');
      console.log('📋 SQL to run manually:');
      console.log(createViewSQL);
    }

    // Step 2: Test the view
    console.log('\n🧪 Step 2: Testing cluster_best_template view...');
    
    const { data: viewData, error: testError } = await supabase
      .from('cluster_best_template')
      .select('*')
      .limit(5);
    
    if (testError) {
      console.error('❌ Error testing view:', testError);
      console.log('💡 The view doesn\'t exist yet. Create it manually using the SQL above.');
    } else {
      console.log('✅ View test successful');
      console.log('📊 Current cluster template data:', viewData);
      
      if (viewData.length === 0) {
        console.log('⚠️  No data in view yet - this is expected if you have limited usage data');
      }
    }

    // Step 3: Check current template usage data
    console.log('\n📈 Step 3: Analyzing current template usage...');
    
    const { data: usageData, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('cluster_id, template_id, feedback_score, created_at')
      .not('cluster_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (usageError) {
      console.error('❌ Error fetching usage data:', usageError);
    } else {
      console.log('✅ Recent template usage:');
      if (usageData.length === 0) {
        console.log('⚠️  No template usage data found');
        console.log('💡 This explains why template selection falls back to default');
      } else {
        usageData.forEach((usage, index) => {
          console.log(`  ${index + 1}. Cluster ${usage.cluster_id} -> Template ${usage.template_id} (Score: ${usage.feedback_score || 'N/A'})`);
        });
      }
    }

    // Step 4: Check auto-created templates
    console.log('\n🤖 Step 4: Checking auto-created templates...');
    
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('id, topic, source, cluster_id, created_at')
      .eq('source', 'auto_generated')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (templatesError) {
      console.error('❌ Error fetching templates:', templatesError);
    } else {
      console.log('✅ Auto-created templates:');
      if (templates.length === 0) {
        console.log('⚠️  No auto-created templates found');
        console.log('💡 The system should create these automatically on fallback');
      } else {
        templates.forEach((template, index) => {
          console.log(`  ${index + 1}. Template ${template.id} (Cluster: ${template.cluster_id}, Topic: ${template.topic})`);
        });
      }
    }

    // Step 5: Check semantic clusters
    console.log('\n🎯 Step 5: Checking semantic clusters...');
    
    const { data: clusters, error: clustersError } = await supabase
      .from('semantic_clusters')
      .select('id, size, representative_query, clustering_version')
      .order('id');
    
    if (clustersError) {
      console.error('❌ Error fetching clusters:', clustersError);
    } else {
      console.log('✅ Current semantic clusters:');
      if (clusters.length === 0) {
        console.log('⚠️  No semantic clusters found');
        console.log('💡 Run the clustering script to create clusters');
      } else {
        clusters.forEach((cluster) => {
          console.log(`  Cluster ${cluster.id}: ${cluster.size} points - "${cluster.representative_query?.substring(0, 50)}..."`);
        });
      }
    }

    // Step 6: Check interactions with embeddings
    console.log('\n🔍 Step 6: Checking interactions with embeddings...');
    
    const { data: interactions, error: interactionsError } = await supabase
      .from('interactions')
      .select('id, query, cluster_id, is_noise, clustering_version')
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (interactionsError) {
      console.error('❌ Error fetching interactions:', interactionsError);
    } else {
      console.log('✅ Recent interactions with embeddings:');
      if (interactions.length === 0) {
        console.log('⚠️  No interactions with embeddings found');
        console.log('💡 This explains why clustering returns no results');
      } else {
        interactions.forEach((interaction, index) => {
          console.log(`  ${index + 1}. "${interaction.query.substring(0, 40)}..." -> Cluster ${interaction.cluster_id} (Noise: ${interaction.is_noise})`);
        });
      }
    }

    // Step 7: Provide comprehensive recommendations
    console.log('\n💡 Recommendations:');
    
    if (clusters.length === 0) {
      console.log('1. 🔄 Run clustering script: py cluster_questions_realtime.py --full-recluster');
    }
    
    if (templates.length === 0) {
      console.log('2. 🎯 Generate more interactions to trigger auto-template creation');
    }
    
    if (viewData && viewData.length === 0) {
      console.log('3. 📊 The cluster_best_template view needs usage data to work');
      console.log('   - Templates need to be used and rated');
      console.log('   - This happens automatically as users interact with the system');
    }
    
    if (interactions.length < 10) {
      console.log('4. 📈 Add more diverse queries to improve clustering');
      console.log('   - Current dataset is too small for meaningful clusters');
      console.log('   - Try asking questions about different topics');
    }
    
    console.log('5. 🔄 Restart your server after applying these fixes');
    
    console.log('\n✅ Crowd Wisdom diagnostic complete!');
    console.log('\n🎯 Next Steps:');
    console.log('   1. Create the cluster_best_template view manually if RPC failed');
    console.log('   2. Run the clustering script to process your embeddings');
    console.log('   3. Test with more diverse queries to build better clusters');
    console.log('   4. Monitor the logs to see template selection improve');

  } catch (error) {
    console.error('❌ Error during fix process:', error);
  }
}

// Run the fix
fixCrowdWisdomIssues(); 