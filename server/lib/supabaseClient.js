import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// For server-side operations, prefer service role key to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

// Log which key type we're using (without exposing the actual key)
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('🔐 Using Supabase service role key (server-side operations)');
} else {
  console.log('⚠️  Using Supabase anon key (client-side operations) - some server operations may fail');
}

export const supabase = createClient(supabaseUrl, supabaseKey); 