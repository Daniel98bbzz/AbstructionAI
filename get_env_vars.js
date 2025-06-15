// Simple script to get environment variables from the current process
console.log('Environment Variables:');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL || 'Not set');
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY || 'Not set');

// If they're not set, check for alternative names
if (!process.env.VITE_SUPABASE_URL) {
  console.log('\nChecking alternative environment variable names:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL || 'Not set');
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY || 'Not set');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set');
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'Not set');
}

// Show all environment variables that contain 'supabase' (case insensitive)
console.log('\nAll Supabase-related environment variables:');
Object.keys(process.env).forEach(key => {
  if (key.toLowerCase().includes('supabase')) {
    console.log(`${key}:`, process.env[key]);
  }
}); 