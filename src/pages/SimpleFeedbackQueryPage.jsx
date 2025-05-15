import React from 'react';
import { useParams } from 'react-router-dom';
import SimpleFeedback from '../components/SimpleFeedback';
import { useAuth } from '../contexts/AuthContext';

// This is a very simple page to demonstrate the simplified feedback approach
function SimpleFeedbackQueryPage() {
  const { responseId } = useParams();
  const { user } = useAuth();
  const sessionId = user ? localStorage.getItem(`sessionId_${user.id}`) : localStorage.getItem('sessionId');
  
  const handleFeedbackSubmitted = () => {
    console.log('Feedback was submitted successfully');
  };
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Simple Feedback Test</h1>
      <p className="mb-6">This is a simplified feedback component that submits directly to the database.</p>
      
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Test Response</h2>
        <p className="mb-6">
          This is a test response. After reading this, please provide your feedback below.
        </p>
        
        <SimpleFeedback 
          responseId={responseId || 'test-response-id'} 
          onFeedbackSubmitted={handleFeedbackSubmitted}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}

export default SimpleFeedbackQueryPage; 