import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (same as server)
dotenv.config();

// Initialize Supabase client (same as server)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableSchema() {
  console.log('🔍 Checking prompt_template_usage table schema...\n');

  try {
    // Get a sample row to see the actual columns
    const { data: sampleData, error: sampleError } = await supabase
      .from('prompt_template_usage')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('❌ Error fetching sample data:', sampleError);
      return;
    }
    
    if (sampleData && sampleData.length > 0) {
      console.log('✅ Sample row from prompt_template_usage:');
      console.log(JSON.stringify(sampleData[0], null, 2));
      
      console.log('\n📋 Available columns:');
      Object.keys(sampleData[0]).forEach(column => {
        console.log(`  - ${column}: ${typeof sampleData[0][column]}`);
      });
    } else {
      console.log('⚠️  No data in prompt_template_usage table');
      
      // Try to get all data to see if there's anything
      const { data: allData, error: allError } = await supabase
        .from('prompt_template_usage')
        .select('*');
      
      if (allError) {
        console.error('❌ Error fetching all data:', allError);
      } else {
        console.log(`📊 Total rows in table: ${allData.length}`);
        if (allData.length > 0) {
          console.log('✅ Sample row:');
          console.log(JSON.stringify(allData[0], null, 2));
        }
      }
    }
    
    // Also check if there are any rows with cluster_id
    console.log('\n🎯 Checking for rows with cluster_id...');
    const { data: clusterData, error: clusterError } = await supabase
      .from('prompt_template_usage')
      .select('*')
      .not('cluster_id', 'is', null)
      .limit(5);
    
    if (clusterError) {
      console.error('❌ Error fetching cluster data:', clusterError);
    } else {
      console.log(`📊 Found ${clusterData.length} rows with cluster_id`);
      if (clusterData.length > 0) {
        console.log('✅ Sample row with cluster_id:');
        console.log(JSON.stringify(clusterData[0], null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error checking schema:', error);
  }
}

checkTableSchema(); 