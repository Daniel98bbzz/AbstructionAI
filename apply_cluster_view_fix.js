const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Get environment variables from process.env directly
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyClusterViewFix() {
  try {
    console.log('🔧 Applying cluster_best_template view fix...');
    
    // Read the SQL file
    const sql = fs.readFileSync('create_cluster_best_template_view.sql', 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('❌ Error creating view:', error);
      return;
    }
    
    console.log('✅ cluster_best_template view created successfully');
    
    // Test the view by checking if it exists and has the right structure
    const { data: testData, error: testError } = await supabase
      .from('cluster_best_template')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.error('❌ Error testing view:', testError);
      return;
    }
    
    console.log('✅ View test successful');
    console.log('📊 Current cluster template data:', testData);
    
  } catch (error) {
    console.error('❌ Error applying fix:', error);
  }
}

applyClusterViewFix(); 