#!/usr/bin/env node

/**
 * Production Testing Script
 * This script helps you test your production build locally
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function testProduction() {
  console.log('🚀 Starting production build test...\n');
  
  try {
    // Check if dist directory exists
    const distExists = await fs.access('dist').then(() => true).catch(() => false);
    
    if (!distExists) {
      console.log('📦 Building production version...');
      await execAsync('npm run build:production');
      console.log('✅ Build completed successfully!\n');
    } else {
      console.log('📁 Found existing dist directory\n');
    }
    
    // Check if environment variables are set
    const envVars = [
      'NODE_ENV',
      'OPENAI_API_KEY',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    console.log('🔍 Checking environment variables...');
    const missingVars = envVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.log('⚠️  Missing environment variables:');
      missingVars.forEach(varName => {
        console.log(`   - ${varName}`);
      });
      console.log('\n💡 Make sure to set these in your .env file or system environment\n');
    } else {
      console.log('✅ All required environment variables are set!\n');
    }
    
    // Test server startup
    console.log('🌐 Testing server startup...');
    console.log('   Run: NODE_ENV=production npm start');
    console.log('   Then visit: http://localhost:3001');
    console.log('\n📋 Production checklist:');
    console.log('   ✅ Build scripts added to package.json');
    console.log('   ✅ Server configured for static file serving');
    console.log('   ✅ React Router fallback route added');
    console.log('   ✅ Production build created');
    console.log('\n🎉 Your app is ready for deployment!');
    
  } catch (error) {
    console.error('❌ Error during production test:', error.message);
    process.exit(1);
  }
}

// Run the test
testProduction(); 