// Test script to check if the submit_feedback RPC function exists
import { createClient } from '@supabase/supabase-js'

// IMPORTANT: Replace these with your actual Supabase URL and anon key
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testRPCFunction() {
  console.log('Testing submit_feedback RPC function...')
  
  // First, check if we're authenticated
  const { data: authData, error: authError } = await supabase.auth.getSession()
  if (authError) {
    console.error('Authentication error:', authError)
    return
  }
  
  if (!authData.session) {
    console.error('No active session. Please log in first.')
    return
  }
  
  console.log('Authenticated as:', authData.session.user.email)
  
  // Try to get available functions - note: this is just a check and might not work
  // as Supabase doesn't explicitly provide a way to list available RPC functions
  
  // Generate a test UUID
  const testUUID = '00000000-0000-0000-0000-000000000000'
  
  // Attempt to call the RPC function
  try {
    const { data, error } = await supabase.rpc('submit_feedback', {
      response_id: testUUID,
      rating: 5,
      comments: 'Test feedback from RPC test script'
    })
    
    if (error) {
      console.error('Error calling submit_feedback RPC function:', error)
      if (error.message.includes('function') && error.message.includes('not exist')) {
        console.error('The RPC function does not exist or is not accessible!')
      }
    } else {
      console.log('RPC function exists and returned:', data)
    }
  } catch (err) {
    console.error('Exception when calling RPC function:', err)
  }
}

testRPCFunction()
  .then(() => console.log('Test completed'))
  .catch(err => console.error('Test failed:', err)) 