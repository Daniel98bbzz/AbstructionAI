import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  try {
    const sql = fs.readFileSync('supabase/migrations/20250131000000_create_gamification_tables.sql', 'utf8');
    console.log('Running gamification tables migration...');
    
    // Split the SQL into individual statements and execute them
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement.trim() + ';' });
        
        if (error) {
          console.error('Statement error:', error);
          console.error('Statement:', statement);
        }
      }
    }
    
    console.log('Migration completed!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

runMigration(); 