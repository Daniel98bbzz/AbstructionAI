import fetch from 'node-fetch';

async function testCrowdWisdomDetailed() {
  try {
    console.log('=== DETAILED CROWD WISDOM TEST ===');
    
    // Test 1: Submit a query and examine the full response
    console.log('\n1. Submitting query about memory hierarchy...');
    const queryResponse = await fetch('http://localhost:3001/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "Hey can you please explain what is memory hierarchy?",
        sessionId: "test-session-" + Date.now(),
        userId: "test-user-" + Date.now()
      })
    });
    
    const queryResult = await queryResponse.json();
    console.log('\n=== QUERY RESPONSE ANALYSIS ===');
    console.log('Status:', queryResponse.status);
    console.log('Response keys:', Object.keys(queryResult));
    console.log('Has explanation:', !!queryResult.explanation);
    console.log('Session ID:', queryResult.sessionId);
    console.log('Crowd Wisdom Assignment ID:', queryResult.crowdWisdomAssignmentId);
    console.log('Response includes crowd wisdom metadata:', !!queryResult.crowdWisdomAssignmentId);
    
    if (queryResult.explanation) {
      console.log('Explanation preview:', queryResult.explanation.substring(0, 100) + '...');
    }
    
    // Test 2: Submit feedback if we have an assignment ID
    if (queryResult.crowdWisdomAssignmentId) {
      console.log('\n2. Testing feedback with assignment ID:', queryResult.crowdWisdomAssignmentId);
      
      const feedbackResponse = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: "I understand, thank you so much! This explanation is perfect!",
          sessionId: queryResult.sessionId,
          userId: "test-user-" + Date.now()
        })
      });
      
      const feedbackResult = await feedbackResponse.json();
      console.log('\n=== FEEDBACK RESPONSE ANALYSIS ===');
      console.log('Feedback status:', feedbackResponse.status);
      console.log('Feedback response keys:', Object.keys(feedbackResult));
      console.log('Has feedback explanation:', !!feedbackResult.explanation);
      
    } else {
      console.log('\n❌ No crowd wisdom assignment ID found!');
      console.log('This means the crowd wisdom system may not be properly integrated.');
      console.log('Expected to see crowdWisdomAssignmentId in the response.');
    }
    
    // Test 3: Check crowd wisdom API endpoint directly
    console.log('\n3. Testing crowd wisdom API endpoint directly...');
    try {
      const directResponse = await fetch('http://localhost:3001/api/crowd-wisdom/stats');
      const statsResult = await directResponse.json();
      console.log('Crowd wisdom stats endpoint status:', directResponse.status);
      console.log('Stats available:', statsResult.success);
      if (statsResult.success) {
        console.log('✅ Crowd wisdom API is responding');
      }
    } catch (error) {
      console.log('❌ Crowd wisdom API endpoint error:', error.message);
    }
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ Main API is working');
    console.log(queryResult.crowdWisdomAssignmentId ? '✅ Crowd wisdom assignment ID present' : '❌ Crowd wisdom assignment ID missing');
    console.log('Check server console for detailed crowd wisdom logs!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCrowdWisdomDetailed(); 