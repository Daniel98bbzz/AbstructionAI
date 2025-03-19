import React, { useState } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { supabase } from '../lib/supabaseClient';

function FeedbackForm({ responseId, onFeedbackSubmitted, originalQuery, preferences, onRegenerateAnswer, sessionId }) {
  const { submitFeedback } = useQuery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState({
    rating: 3,
    explanationClear: 'partially',
    explanationDetail: 'exactly_right',
    analogyHelpful: 'partially',
    comments: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFeedback(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      
      // Format feedback as JSON to include in comments
      const feedbackDetails = JSON.stringify({
        explanationClear: feedback.explanationClear,
        explanationDetail: feedback.explanationDetail,
        analogyHelpful: feedback.analogyHelpful,
        comments: feedback.comments
      });
      
      console.log('Submitting comprehensive feedback...');
      
      // Try multiple submission methods in sequence:
      let isSubmitted = false;
      
      // Method 1: Try direct insertion with session ID as priority
      if (sessionId) {
        try {
          console.log('Attempting direct insertion with sessionId:', sessionId);
          const { data, error: insertError } = await supabase
            .from('interactions')
            .insert([
              {
                session_id: sessionId,
                type: 'feedback',
                rating: feedback.rating,
                comments: feedbackDetails,
                // Don't use related_to to avoid foreign key issues
                related_to: null
              }
            ])
            .select();
          
          if (insertError) {
            console.error('Direct insertion failed:', insertError);
            throw insertError;
          }
          
          console.log('Feedback submitted successfully via direct insertion');
          isSubmitted = true;
        } catch (insertError) {
          console.error('Direct insertion failed:', insertError);
        }
      }
      
      // Method 2: Try the fallback approach without session ID
      if (!isSubmitted) {
        try {
          console.log('Attempting fallback insertion');
          // Get most recent session
          let actualSessionId = null;
          
          try {
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
            console.warn('Could not get session, will use null session ID');
          }
          
          const { data, error: fallbackInsertError } = await supabase
            .from('interactions')
            .insert([
              {
                session_id: actualSessionId,
                type: 'feedback',
                rating: feedback.rating,
                comments: feedbackDetails,
                related_to: null
              }
            ])
            .select();
          
          if (fallbackInsertError) {
            console.error('Fallback insertion failed:', fallbackInsertError);
            throw fallbackInsertError;
          }
          
          console.log('Feedback submitted successfully via fallback insertion');
          isSubmitted = true;
        } catch (fallbackInsertError) {
          console.error('Fallback insertion failed:', fallbackInsertError);
        }
      }
      
      if (!isSubmitted) {
        throw new Error('All feedback submission methods failed');
      }
      
      setSubmitted(true);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (err) {
      setError('Failed to submit feedback. Please try again. Error: ' + (err.message || 'Unknown error'));
      console.error('Error submitting feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateClick = () => {
    if (onRegenerateAnswer) {
      onRegenerateAnswer(feedback);
    }
  };

  if (submitted) {
    return (
      <div className="mt-4 p-4 bg-green-50 rounded-md">
        <p className="text-green-700 text-sm">Thank you for your feedback!</p>
        
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleRegenerateClick}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Regenerate Answer Based on Feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-md">
      <h3 className="text-sm font-medium text-gray-900">Help us improve</h3>
      
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="mt-3 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Rate the quality of the answer (1-5)
          </label>
          <div className="mt-1 flex items-center space-x-2">
            <span className="text-xs text-gray-500">Poor</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center">
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={parseInt(feedback.rating) === value}
                  onChange={handleChange}
                  className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
                />
                <span className="ml-1 text-sm text-gray-700">{value}</span>
              </label>
            ))}
            <span className="text-xs text-gray-500">Excellent</span>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Was the explanation clear to you?
          </label>
          <div className="mt-1 space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationClear"
                value="yes"
                checked={feedback.explanationClear === 'yes'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Yes</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationClear"
                value="partially"
                checked={feedback.explanationClear === 'partially'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Partially</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationClear"
                value="no"
                checked={feedback.explanationClear === 'no'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">No</span>
            </label>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Would you prefer a more detailed or simpler explanation?
          </label>
          <div className="mt-1 space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationDetail"
                value="more_detailed"
                checked={feedback.explanationDetail === 'more_detailed'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">More detailed</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationDetail"
                value="exactly_right"
                checked={feedback.explanationDetail === 'exactly_right'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Exactly right</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="explanationDetail"
                value="simpler"
                checked={feedback.explanationDetail === 'simpler'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Simpler</span>
            </label>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Did the analogy help you better understand the concept?
          </label>
          <div className="mt-1 space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="analogyHelpful"
                value="yes"
                checked={feedback.analogyHelpful === 'yes'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Yes</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="analogyHelpful"
                value="partially"
                checked={feedback.analogyHelpful === 'partially'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Partially</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name="analogyHelpful"
                value="no"
                checked={feedback.analogyHelpful === 'no'}
                onChange={handleChange}
                className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">No</span>
            </label>
          </div>
        </div>
        
        <div>
          <label htmlFor="comments" className="block text-sm font-medium text-gray-700">
            What would you like to improve in the provided answer?
          </label>
          <div className="mt-1">
            <textarea
              id="comments"
              name="comments"
              rows="3"
              className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
              placeholder="Additional comments and suggestions..."
              value={feedback.comments}
              onChange={handleChange}
            />
          </div>
        </div>
        
        <div className="flex justify-end">
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

export default FeedbackForm; 