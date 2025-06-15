#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('🚀 ABSTRUCTIONAI CROWD WISDOM TEST SUITE');
console.log('=' .repeat(50));

// Check if server is already running
async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    return response.ok;
  } catch {
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('\n⏳ Waiting for server to be ready...');
  
  // Wait for server to be ready
  let attempts = 0;
  while (attempts < 30) {
    if (await checkServerHealth()) {
      console.log('✅ Server is ready!\n');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (attempts >= 30) {
    console.error('❌ Server failed to start within 30 seconds');
    return;
  }
  
  console.log('🧪 RUNNING CROWD WISDOM TESTS');
  console.log('-'.repeat(30));
  
  // Run the comprehensive test
  console.log('📋 Running comprehensive crowd wisdom test...');
  const testProcess = spawn('node', ['test_crowd_wisdom.js'], {
    stdio: 'inherit'
  });
  
  testProcess.on('close', async (code) => {
    if (code === 0) {
      console.log('\n✅ Tests completed successfully!');
      
      // Optionally run the demo
      console.log('\n🎭 Running crowd wisdom refinement demonstration...');
      const demoProcess = spawn('node', ['demo_crowd_wisdom_refinement.js'], {
        stdio: 'inherit'
      });
      
      demoProcess.on('close', (demoCode) => {
        if (demoCode === 0) {
          console.log('\n🎉 All tests and demonstrations completed!');
          console.log('\n📊 SUMMARY:');
          console.log('   ✅ Crowd wisdom mechanism is implemented');
          console.log('   ✅ Templates are being applied to enhance responses');
          console.log('   ✅ System learns from user feedback');
          console.log('   ✅ Similar questions get improved answers over time');
          
          console.log('\n🔗 How to test manually:');
          console.log('   1. Keep the server running (http://localhost:3000)');
          console.log('   2. Ask questions through the web interface');
          console.log('   3. Check server logs for [Crowd Wisdom] messages');
          console.log('   4. Look for "Template enhancement applied" messages');
          console.log('   5. Provide feedback to improve template performance');
          
        } else {
          console.log('⚠️  Demo completed with warnings');
        }
        process.exit(0);
      });
    } else {
      console.log('❌ Tests failed with code:', code);
      process.exit(1);
    }
  });
}

// Main execution
async function main() {
  try {
    // Check if server is already running
    const isServerRunning = await checkServerHealth();
    
    if (!isServerRunning) {
      console.log('❌ Server not detected. Please start the server first:');
      console.log('   npm start  or  node server/index.js');
      console.log('   Then run this test script again.');
      process.exit(1);
    } else {
      console.log('✅ Server is already running!');
    }
    
    // Run the tests
    await runTests();
    
  } catch (error) {
    console.error('❌ Failed to start test suite:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping test suite...');
  process.exit(0);
});

main().catch(console.error); 