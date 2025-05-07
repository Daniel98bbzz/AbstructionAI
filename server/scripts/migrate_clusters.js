#!/usr/bin/env node

// Script to run the user_clusters table migration
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import colors from 'colors';

// Configure environment
dotenv.config();

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Main migration function
async function migrateUserClusters() {
  console.log(colors.cyan('\n=== USER CLUSTERS MIGRATION ===\n'));
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  // Read migration SQL file
  console.log(colors.yellow('📄 Reading migration SQL file...'));
  const sqlPath = join(rootDir, 'db', 'migrate_user_clusters.sql');
  const sqlContent = await fs.readFile(sqlPath, 'utf8');
  
  // Check if we have Supabase credentials
  if (!supabaseUrl || !supabaseKey) {
    console.warn(colors.yellow('⚠️  Missing Supabase configuration. Will output SQL to file instead.'));
    
    // Create an output SQL file
    const outputPath = join(rootDir, 'db', 'migrate_user_clusters_output.sql');
    await fs.writeFile(outputPath, sqlContent, 'utf8');
    
    console.log(colors.green(`✅ SQL file written to: ${outputPath}`));
    console.log(colors.cyan('\nTo run this migration:'));
    console.log(colors.cyan('1. Login to your Supabase dashboard'));
    console.log(colors.cyan('2. Go to the SQL Editor'));
    console.log(colors.cyan('3. Copy and paste the SQL from the output file'));
    console.log(colors.cyan('4. Run the query'));
    
    return;
  }
  
  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Execute SQL migration
    console.log(colors.yellow('🔄 Executing migration...'));
    const { error } = await supabase.rpc('execute_sql', { sql: sqlContent });
    
    if (error) {
      throw new Error(`Migration error: ${error.message}`);
    }
    
    console.log(colors.green('✅ Migration completed successfully!'));
    
    // Verify the new table
    console.log(colors.yellow('🔍 Verifying new table structure...'));
    const { data, error: verifyError } = await supabase
      .from('user_clusters')
      .select('*')
      .limit(5);
      
    if (verifyError) {
      console.error(colors.red(`❌ Verification error: ${verifyError.message}`));
    } else {
      console.log(colors.green(`✅ Table verified. Found ${data.length} existing records.`));
    }
    
  } catch (error) {
    console.error(colors.red(`\n❌ Migration failed: ${error.message}`));
    
    // Output the SQL to a file so it can be run manually
    const outputPath = join(rootDir, 'db', 'migrate_user_clusters_output.sql');
    await fs.writeFile(outputPath, sqlContent, 'utf8');
    
    console.log(colors.yellow(`\nSQL file written to: ${outputPath}`));
    console.log(colors.yellow('You can run this SQL manually in the Supabase SQL Editor.'));
    
    process.exit(1);
  }
}

// Execute migration
migrateUserClusters().then(() => {
  console.log(colors.cyan('\n=== MIGRATION COMPLETE ===\n'));
}).catch(err => {
  console.error(colors.red(`\nUnexpected error: ${err.message}`));
  process.exit(1);
}); 