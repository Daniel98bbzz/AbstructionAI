import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function SimpleFeedback({ responseId, onFeedbackSubmitted, sessionId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(3);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      console.log('Submitting simple feedback...');
      
      // Store feedback in local storage since we're having server issues
      const feedbackData = {
        id: Date.now().toString(),
        responseId: responseId || 'unknown',
        sessionId: sessionId || 'unknown',
        rating: rating,
        simple: true,
        timestamp: new Date().toISOString()
      };
      
      // Store in localStorage until we can submit to server later
      let storedFeedback = [];
      try {
        const existingFeedback = localStorage.getItem('user_feedback');
        if (existingFeedback) {
          storedFeedback = JSON.parse(existingFeedback);
        }
      } catch (e) {
        console.warn('Error parsing stored feedback:', e);
        storedFeedback = [];
      }
      
      // Add new feedback and save
      storedFeedback.push(feedbackData);
      localStorage.setItem('user_feedback', JSON.stringify(storedFeedback));
      
      console.log('Simple feedback saved to local storage:', feedbackData);
      
      // Consider feedback as submitted successfully
      setSubmitted(true);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(responseId);
      }
    } catch (err) {
      setError('Failed to save feedback: ' + (err.message || 'Unknown error'));
      console.error('Error saving feedback:', err);
    } finally {
      setLoading(false);
    }
  };
  
  if (submitted) {
    return (
      <div className="mt-4 p-4 bg-green-50 rounded-md">
        <p className="text-green-700 text-sm">Thank you for your feedback!</p>
      </div>
    );
  }
  
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-md">
      <h3 className="text-sm font-medium text-gray-900">How was this response?</h3>
      
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="mt-3">
        <div>
          <div className="mt-1 flex items-center space-x-2">
            <span className="text-xs text-gray-500">Poor</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center">
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
                />
                <span className="ml-1 text-sm text-gray-700">{value}</span>
              </label>
            ))}
            <span className="text-xs text-gray-500">Excellent</span>
          </div>
        </div>
        
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SimpleFeedback; 