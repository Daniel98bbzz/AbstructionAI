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
      
      console.log('Submitting feedback with simplified approach...');
      
      // If we have a sessionId, use that, otherwise attempt to get the most recent one
      let actualSessionId = sessionId;
      
      if (!actualSessionId) {
        try {
          // Try to get the most recent session
          const { data: sessionData } = await supabase
            .from('sessions')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (sessionData) {
            actualSessionId = sessionData.id;
          }
        } catch (err) {
          console.warn('Could not get session, will create one directly in the function');
        }
      }
      
      // Super simplified approach - direct table insertion
      const { data, error: insertError } = await supabase
        .from('interactions')
        .insert([
          {
            session_id: actualSessionId, // This might be null, but SQL function will handle that
            type: 'feedback',
            rating: rating,
            comments: 'Simple feedback',
            related_to: null // Don't use responseId which could cause foreign key issues
          }
        ])
        .select();
      
      if (insertError) {
        console.error('Direct insert failed:', insertError);
        throw insertError;
      }
      
      console.log('Feedback submitted successfully:', data);
      setSubmitted(true);
      
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback: ' + (err.message || 'Unknown error'));
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