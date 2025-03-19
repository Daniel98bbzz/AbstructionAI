import React, { useState } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { supabase } from '../lib/supabaseClient';

function FeedbackForm({ responseId, onFeedbackSubmitted, originalQuery, preferences, onRegenerateAnswer, sessionId }) {
  const { submitFeedback } = useQuery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(() => {
    // Check if this message has already received feedback
    try {
      const existingFeedback = localStorage.getItem('user_feedback');
      if (existingFeedback) {
        const feedbackArray = JSON.parse(existingFeedback);
        // Check if there's already feedback for this specific response
        return feedbackArray.some(item => item.responseId === responseId);
      }
    } catch (e) {
      console.warn('Error checking existing feedback:', e);
    }
    return false;
  });
  const [feedback, setFeedback] = useState({
    rating: 3,
    explanationClear: 'partially',
    explanationDetail: 'exactly_right',
    analogyHelpful: 'partially',
    analogyPreference: '',
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
      
      console.log('Submitting comprehensive feedback...');
      
      // Add specific comment about gaming analogy if selected but no comment provided
      let updatedFeedback = { ...feedback };
      if (feedback.analogyPreference === 'gaming' && (!feedback.comments || !feedback.comments.toLowerCase().includes('game'))) {
        updatedFeedback.comments = feedback.comments 
          ? `${feedback.comments}\nPlease use a gaming analogy instead.` 
          : 'Please use a gaming analogy that relates to video games.';
      }
      
      // Store feedback in local storage since we're having server issues
      const feedbackData = {
        id: Date.now().toString(),
        responseId: responseId || 'unknown',
        sessionId: sessionId || 'unknown',
        rating: updatedFeedback.rating,
        explanationClear: updatedFeedback.explanationClear,
        explanationDetail: updatedFeedback.explanationDetail,
        analogyHelpful: updatedFeedback.analogyHelpful,
        analogyPreference: updatedFeedback.analogyPreference,
        comments: updatedFeedback.comments,
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
      
      console.log('Feedback saved to local storage:', feedbackData);
      
      // Consider feedback as submitted successfully
      setSubmitted(true);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(responseId);
      }
      
      // Automatically trigger regeneration after successful feedback
      setTimeout(() => {
        if (onRegenerateAnswer) {
          console.log('Auto-triggering regeneration based on feedback');
          onRegenerateAnswer(updatedFeedback);
        }
      }, 500);
    } catch (err) {
      setError('Failed to save feedback. Please try again. Error: ' + (err.message || 'Unknown error'));
      console.error('Error saving feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateClick = () => {
    if (onRegenerateAnswer) {
      // Add specific comment about gaming analogy if selected but no comment provided
      let updatedFeedback = { ...feedback };
      if (feedback.analogyPreference === 'gaming' && (!feedback.comments || !feedback.comments.toLowerCase().includes('game'))) {
        updatedFeedback.comments = feedback.comments 
          ? `${feedback.comments}\nPlease use a gaming analogy instead.` 
          : 'Please use a gaming analogy that relates to video games.';
      }
      
      console.log('Manually triggering regeneration with feedback:', updatedFeedback);
      onRegenerateAnswer(updatedFeedback);
    }
  };

  const renderAnalogySuggestion = () => {
    if (feedback.analogyHelpful === 'no' || feedback.analogyHelpful === 'partially') {
      return (
        <div className="mt-3 pl-8">
          <label htmlFor="analogyPreference" className="block text-sm font-medium text-gray-700">
            What type of analogy would help you understand better?
          </label>
          <select
            id="analogyPreference"
            name="analogyPreference"
            value={feedback.analogyPreference}
            onChange={handleChange}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
          >
            <option value="">Select a domain for analogy</option>
            <option value="gaming">Gaming/Video Games</option>
            <option value="sports">Sports</option>
            <option value="music">Music</option>
            <option value="cooking">Cooking/Food</option>
            <option value="automotive">Cars/Vehicles</option>
            <option value="movies">Movies/Films</option>
            <option value="nature">Nature/Outdoors</option>
            <option value="other">Other (please specify in comments)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Selecting a domain will generate a new analogy related to that topic. {feedback.explanationClear === 'yes' && feedback.explanationDetail === 'exactly_right' 
              ? "Since you marked the explanation as clear and appropriate, only the analogy will change." 
              : "Other parts of the answer will also be updated based on your other feedback selections."}
          </p>
        </div>
      );
    }
    return null;
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
      <p className="text-xs text-gray-500 mt-1">Your feedback will affect how we regenerate this response. Different feedback types will change different sections of the answer.</p>
      
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
          <p className="text-xs text-gray-500 mt-1">Selecting "Partially" or "No" will cause the explanation to be rewritten more clearly</p>
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
          <p className="text-xs text-gray-500 mt-1">Selecting "More detailed" or "Simpler" will rewrite the explanation with more or less technical detail</p>
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
          <p className="text-xs text-gray-500 mt-1">Selecting "Partially" or "No" will generate a new analogy while keeping the explanation if it was marked as clear and exactly right</p>
        </div>
        
        {renderAnalogySuggestion()}
        
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
          <p className="mt-1 text-xs text-gray-500">
            Your specific comments will be used to improve the response. Include keywords like "simpler", "more detail", or mention specific topics you'd like included.
          </p>
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