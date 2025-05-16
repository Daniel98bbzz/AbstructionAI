// Script to fix Supabase RLS policies for interactions table
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and key are required. Please check your .env file.');
  process.exit(1);
}

console.log('Initializing Supabase client...');
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyRlsFix() {
  try {
    console.log('Reading SQL file...');
    const sqlFilePath = path.join(__dirname, 'fix_interactions_rls_policy.sql');
    const sqlQuery = fs.readFileSync(sqlFilePath, 'utf8');

    console.log('Applying RLS policy fixes...');
    
    // Execute the SQL using a service role function if available
    if (process.env.SUPABASE_SERVICE_KEY) {
      const { error } = await supabase.rpc('exec_sql', { sql: sqlQuery });
      
      if (error) {
        console.error('Error executing SQL with RPC:', error);
        
        // Try direct SQL as fallback
        console.log('Trying direct SQL execution...');
        
        // Split the SQL into individual statements
        const statements = sqlQuery
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        
        // Execute each statement
        for (const stmt of statements) {
          const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
          if (stmtError) {
            console.error(`Error executing statement: ${stmt}`);
            console.error('Error details:', stmtError);
          } else {
            console.log(`Successfully executed statement: ${stmt.substring(0, 50)}...`);
          }
        }
      } else {
        console.log('RLS policies updated successfully with RPC!');
      }
    } else {
      console.log('No service key available, executing with basic SQL capabilities...');
      
      // Drop policies one by one
      const { error: dropError1 } = await supabase.rpc('exec_sql', { 
        sql: 'DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions;' 
      });
      if (dropError1) console.error('Error dropping policy 1:', dropError1);
      
      const { error: dropError2 } = await supabase.rpc('exec_sql', { 
        sql: 'DROP POLICY IF EXISTS "Users can insert own interactions" ON public.interactions;' 
      });
      if (dropError2) console.error('Error dropping policy 2:', dropError2);
      
      const { error: dropError3 } = await supabase.rpc('exec_sql', { 
        sql: 'DROP POLICY IF EXISTS "Restrictive interactions policy" ON public.interactions;' 
      });
      if (dropError3) console.error('Error dropping policy 3:', dropError3);
      
      // Create new policy
      const { error: createError1 } = await supabase.rpc('exec_sql', { 
        sql: `CREATE POLICY "Allow all interactions" 
              ON public.interactions
              FOR ALL
              TO public
              USING (true)
              WITH CHECK (true);` 
      });
      if (createError1) console.error('Error creating interactions policy:', createError1);
      
      // Repeat for prompt_template_usage
      const { error: dropError4 } = await supabase.rpc('exec_sql', { 
        sql: 'DROP POLICY IF EXISTS "Restrictive template usage policy" ON public.prompt_template_usage;' 
      });
      if (dropError4) console.error('Error dropping template policy:', dropError4);
      
      const { error: createError2 } = await supabase.rpc('exec_sql', { 
        sql: `CREATE POLICY "Allow template usage tracking" 
              ON public.prompt_template_usage
              FOR ALL
              TO public
              USING (true)
              WITH CHECK (true);` 
      });
      if (createError2) console.error('Error creating template policy:', createError2);
      
      console.log('RLS policies updated with individual statements!');
    }
    
    // Verify policies
    console.log('Verifying RLS policies...');
    const { data: policies, error: verifyError } = await supabase.rpc('exec_sql', { 
      sql: `SELECT 
              schemaname, 
              tablename, 
              policyname
            FROM pg_policies
            WHERE tablename = 'interactions' OR tablename = 'prompt_template_usage';` 
    });
    
    if (verifyError) {
      console.error('Error verifying policies:', verifyError);
    } else {
      console.log('Current RLS policies:');
      console.log(policies);
    }
    
    console.log('RLS policy fix completed!');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the function
applyRlsFix()
  .catch(console.error)
  .finally(() => {
    console.log('Script execution completed.');
    process.exit(0);
  }); 