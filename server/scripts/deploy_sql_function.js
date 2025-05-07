#!/usr/bin/env node

// Script to deploy the execute_sql function to Supabase
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import colors from 'colors';
import readline from 'readline';

// Configure environment
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Main deployment function
async function deploySqlFunction() {
  console.log(colors.cyan('\n=== DEPLOYING EXECUTE_SQL FUNCTION ===\n'));
  
  // Read SQL function file
  console.log(colors.yellow('📄 Reading SQL function file...'));
  const sqlPath = join(rootDir, 'db', 'create_execute_sql_function.sql');
  const sqlContent = await fs.readFile(sqlPath, 'utf8');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn(colors.yellow('⚠️  Missing Supabase configuration. Will output SQL to file instead.'));
    
    // Create an output SQL file
    const outputPath = join(rootDir, 'db', 'create_execute_sql_function_output.sql');
    await fs.writeFile(outputPath, sqlContent, 'utf8');
    
    console.log(colors.green(`✅ SQL file written to: ${outputPath}`));
    console.log(colors.cyan('\nTo deploy this function:'));
    console.log(colors.cyan('1. Login to your Supabase dashboard'));
    console.log(colors.cyan('2. Go to the SQL Editor'));
    console.log(colors.cyan('3. Copy and paste the SQL from the output file'));
    console.log(colors.cyan('4. Run the query'));
    rl.close();
    return;
  }
  
  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Confirm deployment
    await new Promise((resolve) => {
      console.log(colors.yellow('\n⚠️  WARNING: This function allows executing arbitrary SQL with admin privileges.'));
      console.log(colors.yellow('⚠️  It has security checks in place but should be used with caution.'));
      rl.question(colors.cyan('\nDo you want to proceed with deployment? (yes/no): '), answer => {
        if (answer.toLowerCase() !== 'yes') {
          console.log(colors.red('Deployment cancelled.'));
          process.exit(0);
        }
        resolve();
      });
    });
    
    // Execute SQL to create the function
    console.log(colors.yellow('\n🔄 Deploying function...'));
    
    // Using Supabase's REST API to execute raw SQL
    const { error } = await supabase.rpc('pg_execute', { sql: sqlContent });
    
    if (error) {
      // If pg_execute doesn't exist, try directly with SQL
      if (error.message.includes('function "pg_execute" does not exist')) {
        console.log(colors.yellow('🔄 pg_execute function not found. Trying alternative method...'));
        
        // Alternative: First create pg_execute function
        const createPgExecute = `
          CREATE OR REPLACE FUNCTION pg_execute(sql text)
          RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
          AS $$
          BEGIN
            EXECUTE sql;
          END;
          $$;
        `;
        
        await supabase.rpc('pg_execute', { sql: createPgExecute }).catch(() => {
          // Function doesn't exist yet, expected error
        });
        
        // Then try again with our function
        const { error: secondError } = await supabase.rpc('pg_execute', { sql: sqlContent });
        if (secondError) {
          throw new Error(`Deployment error: ${secondError.message}`);
        }
      } else {
        throw new Error(`Deployment error: ${error.message}`);
      }
    }
    
    console.log(colors.green('✅ Function deployed successfully!'));
    
  } catch (error) {
    console.error(colors.red(`\n❌ Deployment failed: ${error.message}`));
    
    // Output the SQL to a file so it can be run manually
    const outputPath = join(rootDir, 'db', 'create_execute_sql_function_output.sql');
    await fs.writeFile(outputPath, sqlContent, 'utf8');
    
    console.log(colors.yellow(`\nSQL file written to: ${outputPath}`));
    console.log(colors.yellow('You can run this SQL manually in the Supabase SQL Editor.'));
    
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Execute deployment
deploySqlFunction().then(() => {
  console.log(colors.cyan('\n=== DEPLOYMENT COMPLETE ===\n'));
}).catch(err => {
  console.error(colors.red(`\nUnexpected error: ${err.message}`));
  process.exit(1);
}); 