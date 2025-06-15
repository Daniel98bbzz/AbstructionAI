import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (same as server)
dotenv.config();

// Initialize Supabase client (same as server)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTemplateUsageClusterIds() {
  console.log('🔧 Fixing Template Usage Cluster IDs...\n');

  try {
    // Step 1: Get recent interactions with their cluster assignments
    console.log('📊 Step 1: Getting recent interactions with clusters...');
    
    const { data: interactions, error: interactionsError } = await supabase
      .from('interactions')
      .select('id, query, cluster_id, user_id, session_id, created_at')
      .not('cluster_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (interactionsError) {
      console.error('❌ Error fetching interactions:', interactionsError);
      return;
    }
    
    console.log(`✅ Found ${interactions.length} clustered interactions`);
    
    // Step 2: Get template usage records that need cluster_id assignment
    console.log('\n🎯 Step 2: Finding template usage records without cluster_id...');
    
    const { data: templateUsage, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('id, template_id, cluster_id, user_id, session_id, created_at')
      .is('cluster_id', null)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (usageError) {
      console.error('❌ Error fetching template usage:', usageError);
      return;
    }
    
    console.log(`✅ Found ${templateUsage.length} template usage records without cluster_id`);
    
    // Step 3: Match template usage with interactions to assign cluster_id
    console.log('\n🔗 Step 3: Matching template usage with interaction clusters...');
    
    let updatedCount = 0;
    
    for (const usage of templateUsage) {
      // Try to find matching interaction by session_id and user_id within time window
      const matchingInteraction = interactions.find(interaction => {
        const timeDiff = Math.abs(new Date(usage.created_at) - new Date(interaction.created_at));
        const withinTimeWindow = timeDiff < 60000; // Within 1 minute
        
        return (
          interaction.user_id === usage.user_id &&
          interaction.session_id === usage.session_id &&
          withinTimeWindow
        );
      });
      
      if (matchingInteraction) {
        // Update the template usage record with cluster_id
        const { error: updateError } = await supabase
          .from('prompt_template_usage')
          .update({ 
            cluster_id: matchingInteraction.cluster_id
          })
          .eq('id', usage.id);
        
        if (updateError) {
          console.error(`❌ Error updating usage ${usage.id}:`, updateError);
        } else {
          console.log(`✅ Updated usage ${usage.id} → Cluster ${matchingInteraction.cluster_id}`);
          updatedCount++;
        }
      }
    }
    
    console.log(`\n🎉 Updated ${updatedCount} template usage records with cluster_id`);
    
    // Step 4: Test the cluster_best_template view
    console.log('\n📈 Step 4: Testing cluster_best_template view...');
    
    const { data: bestTemplates, error: viewError } = await supabase
      .from('cluster_best_template')
      .select('*');
    
    if (viewError) {
      console.error('❌ Error querying view:', viewError);
    } else {
      console.log(`✅ cluster_best_template view now has ${bestTemplates.length} entries:`);
      bestTemplates.forEach((template, i) => {
        console.log(`  ${i+1}. Cluster ${template.cluster_id} → Template ${template.template_id} (Score: ${template.weighted_score?.toFixed(2)})`);
      });
    }
    
    // Step 5: Test template selection for each active cluster
    console.log('\n🧪 Step 5: Testing template selection for clusters...');
    
    const activeClusters = [...new Set(interactions.map(i => i.cluster_id))];
    
    for (const clusterId of activeClusters) {
      console.log(`\n  🎯 Testing Cluster ${clusterId}:`);
      
      const { data: bestTemplate, error: bestError } = await supabase
        .from('cluster_best_template')
        .select('template_id, usage_count, success_rate')
        .eq('cluster_id', clusterId)
        .limit(1)
        .single();
      
      if (bestError || !bestTemplate) {
        console.log(`    ❌ No best template found for cluster ${clusterId}`);
        
        // Check what templates are available for this cluster
        const { data: clusterTemplates, error: ctError } = await supabase
          .from('prompt_templates')
          .select('id, topic, source')
          .eq('cluster_id', clusterId)
          .limit(5);
        
        if (!ctError && clusterTemplates.length > 0) {
          console.log(`    📝 Available templates for cluster ${clusterId}:`);
          clusterTemplates.forEach(t => {
            console.log(`      - ${t.id} (${t.source}) | ${t.topic || 'No topic'}`);
          });
        } else {
          console.log(`    📝 No templates assigned to cluster ${clusterId}`);
        }
      } else {
        console.log(`    ✅ Best template: ${bestTemplate.template_id}`);
        console.log(`    📊 Usage: ${bestTemplate.usage_count}, Success: ${(bestTemplate.success_rate * 100).toFixed(1)}%`);
      }
    }
    
    // Step 6: Final status
    console.log('\n🎯 FINAL STATUS:');
    console.log(`✅ Updated ${updatedCount} template usage records`);
    console.log(`✅ cluster_best_template view has ${bestTemplates.length} entries`);
    
    if (bestTemplates.length > 0) {
      console.log('🎉 Crowd Wisdom system should now work properly!');
      console.log('🚀 Restart your server and test with new queries');
    } else {
      console.log('⚠️  View is still empty. You may need to:');
      console.log('   1. Make more queries to generate template usage');
      console.log('   2. Ensure templates are being created for each cluster');
    }

  } catch (error) {
    console.error('❌ Error during fix process:', error);
  }
}

// Run the fix
fixTemplateUsageClusterIds(); 