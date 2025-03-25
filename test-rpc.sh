#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if Supabase credentials are available
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "Error: Supabase credentials not found"
  echo "Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables"
  exit 1
fi

# Run the test script using Node.js
echo "Running RPC function test..."
node test-rpc.js 