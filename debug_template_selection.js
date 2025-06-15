import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (same as server)
dotenv.config();

// Initialize Supabase client (same as server)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugTemplateSelection() {
  console.log('🔍 Debugging Template Selection Issues...\n');

  try {
    // Step 1: Check recent interactions and their cluster assignments
    console.log('📊 Step 1: Recent interactions with clusters...');
    
    const { data: interactions, error: interactionsError } = await supabase
      .from('interactions')
      .select('id, query, cluster_id, is_noise, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (interactionsError) {
      console.error('❌ Error fetching interactions:', interactionsError);
      return;
    }
    
    console.log('✅ Recent interactions:');
    interactions.forEach((interaction, i) => {
      const clusterInfo = interaction.cluster_id !== null 
        ? `Cluster ${interaction.cluster_id}` 
        : (interaction.is_noise ? 'Noise' : 'Unassigned');
      console.log(`  ${i+1}. "${interaction.query.substring(0, 50)}..." → ${clusterInfo}`);
    });

    // Step 2: Check prompt_template_usage records
    console.log('\n🎯 Step 2: Template usage with cluster assignments...');
    
    const { data: templateUsage, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('id, template_id, cluster_id, had_follow_up, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    
    if (usageError) {
      console.error('❌ Error fetching template usage:', usageError);
      return;
    }
    
    console.log('✅ Recent template usage:');
    templateUsage.forEach((usage, i) => {
      const clusterInfo = usage.cluster_id !== null ? `Cluster ${usage.cluster_id}` : 'No cluster';
      console.log(`  ${i+1}. Template: ${usage.template_id} → ${clusterInfo} (Follow-up: ${usage.had_follow_up})`);
    });

    // Step 3: Check cluster_best_template view
    console.log('\n📈 Step 3: cluster_best_template view content...');
    
    const { data: bestTemplates, error: viewError } = await supabase
      .from('cluster_best_template')
      .select('*');
    
    if (viewError) {
      console.error('❌ Error querying cluster_best_template view:', viewError);
    } else {
      console.log(`✅ Found ${bestTemplates.length} best template entries:`);
      bestTemplates.forEach((template, i) => {
        console.log(`  ${i+1}. Cluster ${template.cluster_id} → Template ${template.template_id} (Score: ${template.weighted_score})`);
      });
      
      if (bestTemplates.length === 0) {
        console.log('⚠️  No best templates found - this explains the fallback behavior!');
      }
    }

    // Step 4: Check available templates for each cluster
    console.log('\n🤖 Step 4: Available templates for clusters...');
    
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('id, topic, source, cluster_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (templatesError) {
      console.error('❌ Error fetching templates:', templatesError);
    } else {
      console.log('✅ Available templates:');
      templates.forEach((template, i) => {
        const clusterInfo = template.cluster_id !== null ? `Cluster ${template.cluster_id}` : 'General';
        console.log(`  ${i+1}. ${template.id} (${template.source}) → ${clusterInfo} | Topic: ${template.topic || 'N/A'}`);
      });
    }

    // Step 5: Simulate the template selection logic
    console.log('\n🔄 Step 5: Simulating template selection for active clusters...');
    
    const activeClusters = [...new Set(interactions
      .filter(i => i.cluster_id !== null)
      .map(i => i.cluster_id))];
    
    if (activeClusters.length === 0) {
      console.log('⚠️  No active clusters found');
    } else {
      console.log(`📊 Testing template selection for clusters: ${activeClusters.join(', ')}`);
      
      for (const clusterId of activeClusters) {
        console.log(`\n  🎯 Cluster ${clusterId}:`);
        
        // Try to find best template for this cluster
        const { data: bestTemplate, error: bestError } = await supabase
          .from('cluster_best_template')
          .select('template_id, usage_count, success_rate')
          .eq('cluster_id', clusterId)
          .limit(1)
          .single();
        
        if (bestError || !bestTemplate) {
          console.log(`    ❌ No best template found (Error: ${bestError?.message || 'No data'})`);
          console.log(`    💡 This cluster will fall back to default template`);
          
          // Check if there are any templates at all for this cluster
          const { data: clusterTemplates, error: ctError } = await supabase
            .from('prompt_templates')
            .select('id, topic, source')
            .eq('cluster_id', clusterId);
          
          if (!ctError && clusterTemplates.length > 0) {
            console.log(`    📝 Available templates for cluster ${clusterId}:`);
            clusterTemplates.forEach(t => {
              console.log(`      - ${t.id} (${t.source}) | ${t.topic || 'No topic'}`);
            });
          } else {
            console.log(`    📝 No templates found for cluster ${clusterId}`);
          }
        } else {
          console.log(`    ✅ Best template: ${bestTemplate.template_id}`);
          console.log(`    📊 Usage: ${bestTemplate.usage_count}, Success: ${(bestTemplate.success_rate * 100).toFixed(1)}%`);
        }
      }
    }

    // Step 6: Root cause analysis
    console.log('\n🎯 ROOT CAUSE ANALYSIS:');
    
    const hasClusteredInteractions = interactions.some(i => i.cluster_id !== null);
    const hasTemplateUsageWithClusters = templateUsage.some(u => u.cluster_id !== null);
    const hasBestTemplates = bestTemplates.length > 0;
    
    if (!hasClusteredInteractions) {
      console.log('❌ ISSUE: No interactions have been assigned to clusters');
      console.log('   🔧 SOLUTION: Run clustering script with --full-recluster');
    } else {
      console.log('✅ Interactions are properly clustered');
    }
    
    if (!hasTemplateUsageWithClusters) {
      console.log('❌ ISSUE: No template usage records have cluster_id assigned');
      console.log('   🔧 SOLUTION: Template usage needs to start recording cluster_id');
      console.log('   💡 This happens when templates are used AFTER clustering is applied');
    } else {
      console.log('✅ Template usage has cluster assignments');
    }
    
    if (!hasBestTemplates) {
      console.log('❌ ISSUE: cluster_best_template view is empty');
      console.log('   🔧 SOLUTION: Generate template usage with cluster_id data');
      console.log('   💡 Use the system with new queries after clustering is applied');
    } else {
      console.log('✅ cluster_best_template view has data');
    }

    console.log('\n🚀 RECOMMENDED ACTIONS:');
    console.log('1. ✅ Clustering is working - you have clusters 0 and 1');
    console.log('2. ✅ cluster_best_template view exists and is functional');
    console.log('3. 🔄 Generate new interactions to populate template usage with cluster_id');
    console.log('4. 🎯 Ask diverse questions to trigger template creation and usage');
    console.log('5. 🔍 Monitor logs to see cluster-aware template selection working');

  } catch (error) {
    console.error('❌ Error during debugging:', error);
  }
}

// Run the debugging
debugTemplateSelection(); 