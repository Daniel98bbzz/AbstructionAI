import fetch from 'node-fetch';

async function testCrowdWisdom() {
  try {
    console.log('Testing Crowd Wisdom System...');
    
    // Test 1: Submit a query
    console.log('\n1. Submitting query about memory hierarchy...');
    const queryResponse = await fetch('http://localhost:3001/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "Hey can you please explain what is memory hierarchy?",
        sessionId: "test-session-123",
        userId: "test-user"
      })
    });
    
    const queryResult = await queryResponse.json();
    console.log('Query response received:', {
      hasResponse: !!queryResult.explanation,
      assignmentId: queryResult.crowdWisdomAssignmentId,
      sessionId: queryResult.sessionId
    });
    
    // Test 2: Submit feedback
    if (queryResult.crowdWisdomAssignmentId) {
      console.log('\n2. Submitting positive feedback...');
      const feedbackResponse = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: "I understand, thank you!",
          sessionId: queryResult.sessionId,
          userId: "test-user"
        })
      });
      
      const feedbackResult = await feedbackResponse.json();
      console.log('Feedback response received:', {
        hasResponse: !!feedbackResult.explanation
      });
    }
    
    console.log('\nTest completed! Check server logs for crowd wisdom activity.');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCrowdWisdom(); 