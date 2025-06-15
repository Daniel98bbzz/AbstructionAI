import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runComprehensiveDiagnostics() {
  console.log('🔍 COMPREHENSIVE CLUSTER DIAGNOSTICS\n');
  console.log('=' .repeat(60));

  try {
    // ===== QUERY 1: Usage count per cluster =====
    console.log('\n📊 1. USAGE COUNT PER CLUSTER:');
    const { data: usageByCluster, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('cluster_id')
      .not('cluster_id', 'is', null);
    
    if (usageError) {
      console.error('❌ Error fetching usage data:', usageError);
    } else {
      const clusterCounts = {};
      usageByCluster.forEach(u => {
        clusterCounts[u.cluster_id] = (clusterCounts[u.cluster_id] || 0) + 1;
      });
      
      if (Object.keys(clusterCounts).length === 0) {
        console.log('⚠️  NO CLUSTER USAGE FOUND - This explains the fallback!');
      } else {
        Object.entries(clusterCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([cluster, count]) => {
            console.log(`   Cluster ${cluster}: ${count} uses`);
          });
      }
    }

    // ===== QUERY 2: Unique users per cluster =====
    console.log('\n👥 2. UNIQUE USERS PER CLUSTER:');
    const { data: usersByCluster, error: userError } = await supabase
      .from('prompt_template_usage')
      .select('cluster_id, user_id')
      .not('cluster_id', 'is', null);
    
    if (userError) {
      console.error('❌ Error fetching user data:', userError);
    } else {
      const userCounts = {};
      usersByCluster.forEach(u => {
        if (!userCounts[u.cluster_id]) userCounts[u.cluster_id] = new Set();
        userCounts[u.cluster_id].add(u.user_id);
      });
      
      if (Object.keys(userCounts).length === 0) {
        console.log('⚠️  NO USERS FOUND IN CLUSTERS');
      } else {
        Object.entries(userCounts)
          .sort((a, b) => b[1].size - a[1].size)
          .forEach(([cluster, userSet]) => {
            console.log(`   Cluster ${cluster}: ${userSet.size} unique users`);
          });
      }
    }

    // ===== QUERY 3: Templates per cluster =====
    console.log('\n🎯 3. TEMPLATES PER CLUSTER:');
    const { data: templatesByCluster, error: templateError } = await supabase
      .from('prompt_template_usage')
      .select('cluster_id, template_id')
      .not('cluster_id', 'is', null);
    
    if (templateError) {
      console.error('❌ Error fetching template data:', templateError);
    } else {
      const templateCounts = {};
      templatesByCluster.forEach(t => {
        const key = `${t.cluster_id}-${t.template_id}`;
        templateCounts[key] = (templateCounts[key] || 0) + 1;
      });
      
      const byCluster = {};
      Object.entries(templateCounts).forEach(([key, count]) => {
        const [cluster, template] = key.split('-', 2);
        if (!byCluster[cluster]) byCluster[cluster] = [];
        byCluster[cluster].push({ template, count });
      });
      
      if (Object.keys(byCluster).length === 0) {
        console.log('⚠️  NO TEMPLATE USAGE WITH CLUSTERS FOUND');
      } else {
        Object.entries(byCluster)
          .sort((a, b) => a[0] - b[0])
          .forEach(([cluster, temps]) => {
            console.log(`   Cluster ${cluster}:`);
            temps.sort((a, b) => b.count - a.count).forEach(t => {
              console.log(`     Template ${t.template}: ${t.count} uses`);
            });
          });
      }
    }

    // ===== QUERY 4: Check cluster_best_template view =====
    console.log('\n🏆 4. CLUSTER BEST TEMPLATE VIEW STATUS:');
    const { data: bestTemplates, error: bestError } = await supabase
      .from('cluster_best_template')
      .select('*');
    
    if (bestError) {
      console.error('❌ Error querying cluster_best_template view:', bestError);
    } else {
      console.log(`   Found ${bestTemplates.length} best template entries:`);
      bestTemplates.forEach(t => {
        console.log(`     Cluster ${t.cluster_id} → Template ${t.template_id} (Score: ${t.weighted_score || 'N/A'})`);
      });
      
      if (bestTemplates.length === 0) {
        console.log('⚠️  CLUSTER_BEST_TEMPLATE VIEW IS EMPTY - This causes fallback!');
      }
    }

    // ===== QUERY 5: Recent interactions and their cluster assignments =====
    console.log('\n🕐 5. RECENT INTERACTIONS WITH CLUSTER ASSIGNMENTS:');
    const { data: recentInteractions, error: interactionError } = await supabase
      .from('interactions')
      .select('id, query, cluster_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (interactionError) {
      console.error('❌ Error fetching interactions:', interactionError);
    } else {
      recentInteractions.forEach((interaction, i) => {
        const clusterInfo = interaction.cluster_id !== null 
          ? `Cluster ${interaction.cluster_id}` 
          : 'Unassigned';
        const query = interaction.query.length > 50 
          ? interaction.query.substring(0, 50) + '...' 
          : interaction.query;
        console.log(`   ${i+1}. "${query}" → ${clusterInfo}`);
      });
    }

    // ===== QUERY 6: Template usage without cluster_id =====
    console.log('\n❌ 6. TEMPLATE USAGE WITHOUT CLUSTER_ID (PROBLEMATIC):');
    const { data: usageWithoutCluster, error: noClusterError } = await supabase
      .from('prompt_template_usage')
      .select('id, template_id, created_at')
      .is('cluster_id', null)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (noClusterError) {
      console.error('❌ Error fetching usage without cluster:', noClusterError);
    } else {
      console.log(`   Found ${usageWithoutCluster.length} recent usage records without cluster_id:`);
      usageWithoutCluster.forEach((usage, i) => {
        console.log(`     ${i+1}. Template ${usage.template_id} at ${usage.created_at}`);
      });
    }

    // ===== ANALYSIS SUMMARY =====
    console.log('\n🎯 ANALYSIS SUMMARY:');
    console.log('=' .repeat(60));
    
    const hasClusterUsage = usageByCluster && usageByCluster.length > 0;
    const hasBestTemplates = bestTemplates && bestTemplates.length > 0;
    const hasUnassignedUsage = usageWithoutCluster && usageWithoutCluster.length > 0;
    
    if (!hasClusterUsage) {
      console.log('🔴 CRITICAL: No template usage with cluster_id found');
      console.log('   → This means cluster_best_template view will be empty');
      console.log('   → All queries will fall back to default template');
    }
    
    if (!hasBestTemplates) {
      console.log('🔴 CRITICAL: cluster_best_template view is empty');
      console.log('   → No "best template" can be selected for any cluster');
      console.log('   → All queries will fall back to default template');
    }
    
    if (hasUnassignedUsage) {
      console.log('🟡 WARNING: Template usage records exist without cluster_id');
      console.log('   → These records don\'t contribute to crowd wisdom');
      console.log('   → Need to backfill cluster_id for these records');
    }
    
    if (hasClusterUsage && hasBestTemplates) {
      console.log('✅ GOOD: Cluster usage and best templates exist');
      console.log('   → Crowd wisdom should be working for some clusters');
    }
    
    console.log('\n🚀 RECOMMENDED ACTIONS:');
    if (!hasClusterUsage) {
      console.log('1. 🔧 Run fix script to assign cluster_id to existing template usage');
      console.log('2. 🔄 Ensure new template usage includes cluster_id');
    }
    if (!hasBestTemplates) {
      console.log('3. 📊 Verify cluster_best_template view definition');
      console.log('4. 🎯 Generate more template usage to populate the view');
    }

  } catch (error) {
    console.error('❌ Error during diagnostics:', error);
  }
}

// Run the diagnostics
runComprehensiveDiagnostics(); 