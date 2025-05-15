// Script to fix RLS policies for interactions table directly from the server
import { supabase } from './lib/supabaseClient.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Starting RLS policy fix script...');

async function fixRlsPolicies() {
  try {
    console.log('Fixing RLS policies for the interactions table...');
    
    // Drop existing restrictive policies
    console.log('Dropping existing policies...');
    
    const dropPolicies = [
      'DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions',
      'DROP POLICY IF EXISTS "Users can insert own interactions" ON public.interactions',
      'DROP POLICY IF EXISTS "Restrictive interactions policy" ON public.interactions'
    ];
    
    for (const sql of dropPolicies) {
      const { error } = await supabase.rpc('exec_sql', { sql });
      if (error) {
        console.log(`Error dropping policy: ${error.message}`);
      } else {
        console.log(`Successfully dropped policy`);
      }
    }
    
    // Create new permissive policy
    console.log('Creating new permissive policy...');
    
    const createInteractionsPolicy = `
      CREATE POLICY "Allow all interactions" 
      ON public.interactions
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true)
    `;
    
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createInteractionsPolicy });
    if (createError) {
      console.log(`Error creating interactions policy: ${createError.message}`);
    } else {
      console.log('Successfully created interactions policy');
    }
    
    // Make sure RLS is enabled
    const enableRls = 'ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY';
    const { error: enableError } = await supabase.rpc('exec_sql', { sql: enableRls });
    if (enableError) {
      console.log(`Error enabling RLS: ${enableError.message}`);
    } else {
      console.log('Successfully enabled RLS');
    }
    
    // Also fix the prompt_template_usage table
    console.log('Fixing RLS policies for prompt_template_usage table...');
    
    const { error: dropTemplateError } = await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Restrictive template usage policy" ON public.prompt_template_usage'
    });
    
    if (dropTemplateError) {
      console.log(`Error dropping template policy: ${dropTemplateError.message}`);
    } else {
      console.log('Successfully dropped template policy');
    }
    
    const createTemplatePolicy = `
      CREATE POLICY "Allow template usage tracking" 
      ON public.prompt_template_usage
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true)
    `;
    
    const { error: createTemplateError } = await supabase.rpc('exec_sql', { sql: createTemplatePolicy });
    if (createTemplateError) {
      console.log(`Error creating template policy: ${createTemplateError.message}`);
    } else {
      console.log('Successfully created template policy');
    }
    
    const enableTemplateRls = 'ALTER TABLE public.prompt_template_usage ENABLE ROW LEVEL SECURITY';
    const { error: enableTemplateError } = await supabase.rpc('exec_sql', { sql: enableTemplateRls });
    if (enableTemplateError) {
      console.log(`Error enabling template RLS: ${enableTemplateError.message}`);
    } else {
      console.log('Successfully enabled template RLS');
    }
    
    // Verify the changes
    console.log('Verifying RLS policies...');
    
    const { data: policies, error: verifyError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE tablename IN ('interactions', 'prompt_template_usage')
      `
    });
    
    if (verifyError) {
      console.log(`Error verifying policies: ${verifyError.message}`);
    } else {
      console.log('Current RLS policies:');
      console.log(policies);
    }
    
    console.log('RLS policy fixes completed!');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the fix
fixRlsPolicies()
  .catch(console.error)
  .finally(() => {
    console.log('Script execution completed.');
    process.exit(0);
  }); 