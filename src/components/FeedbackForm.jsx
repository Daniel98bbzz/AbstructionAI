import React, { useState, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

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

  // Add state for highly rated queries
  const [highlyRatedQueries, setHighlyRatedQueries] = useState([]);
  const [similarAnalogyQueries, setSimilarAnalogyQueries] = useState([]);

  // Add function to fetch highly rated queries
  // Updated fetchHighlyRatedQueries function for FeedbackForm.jsx

const fetchHighlyRatedQueries = async () => {
  try {
    // First, let's fetch queries without the problematic join
    const { data, error } = await supabase
      .from('queries')
      .select(`
        id,
        query,
        response,
        category,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    // Group queries by analogy category
    const groupedQueries = data.reduce((acc, query) => {
      const analogyCategory = query.response?.analogy?.category || 'Uncategorized';
      if (!acc[analogyCategory]) {
        acc[analogyCategory] = [];
      }
      
      // Add a default rating for display purposes
      const enhancedQuery = {
        ...query,
        feedbacks: [{ rating: 4 }] // Placeholder rating
      };
      
      acc[analogyCategory].push(enhancedQuery);
      return acc;
    }, {});

    setHighlyRatedQueries(groupedQueries);
  } catch (error) {
    console.error('Error fetching highly rated queries:', error);
  }
};

// Updated fetchSimilarAnalogyQueries function
const fetchSimilarAnalogyQueries = async (analogyCategory) => {
  if (!analogyCategory) return;

  try {
    // Fetch queries without the problematic join
    const { data, error } = await supabase
      .from('queries')
      .select(`
        id,
        query,
        response,
        category,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Filter queries that have the same analogy category
    const similarQueries = data
      .filter(query => query.response?.analogy?.category === analogyCategory)
      .map(query => ({
        ...query,
        feedbacks: [{ rating: 4 }] // Placeholder rating
      }));

    setSimilarAnalogyQueries(similarQueries);
  } catch (error) {
    console.error('Error fetching similar analogy queries:', error);
  }
};

  // Fetch highly rated queries when component mounts
  useEffect(() => {
    // Only fetch if not already fetched and not in submitted state
    if (Object.keys(highlyRatedQueries).length === 0 && !submitted) {
      fetchHighlyRatedQueries();
    }
  }, [submitted]); // Only refetch if submitted state changes

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
      
      // Store feedback in local storage as backup
      const feedbackStorageData = {
        id: Date.now().toString(),
        responseId: responseId || 'unknown',
        sessionId: sessionId || 'unknown',
        rating: updatedFeedback.rating,
        explanationClear: updatedFeedback.explanationClear,
        explanationDetail: updatedFeedback.explanationDetail,
        analogyHelpful: updatedFeedback.analogyHelpful,
        analogyPreference: updatedFeedback.analogyPreference,
        comments: updatedFeedback.comments,
        timestamp: new Date().toISOString(),
        query_id: responseId || 'unknown'
      };
      
      // Store in localStorage as backup
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
      
      storedFeedback.push(feedbackStorageData);
      localStorage.setItem('user_feedback', JSON.stringify(storedFeedback));
      
      console.log('Feedback saved to local storage:', feedbackStorageData);
      
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (!user) {
        throw new Error('You must be logged in to submit feedback');
      }

      // Instead of trying to use the RPC function, submit directly to the feedbacks table
      const { data, error } = await supabase
        .from('feedbacks')
        .insert({
          user_id: user.id,
          content: updatedFeedback.comments || '',
          rating: parseInt(updatedFeedback.rating),
          query_id: feedbackStorageData.query_id,
          message_id: responseId,
          session_id: sessionId,
          metadata: {
            explanationClear: updatedFeedback.explanationClear,
            explanationDetail: updatedFeedback.explanationDetail,
            analogyHelpful: updatedFeedback.analogyHelpful,
            analogyPreference: updatedFeedback.analogyPreference
          }
        })
        .select();
      
      if (error) {
        console.error('Error submitting feedback to database:', error);
        
        // Log helpful information about available tables and columns
        console.log('Attempting to get table structure for debugging...');
        try {
          const { data: tableInfo } = await supabase
            .from('feedbacks')
            .select('*')
            .limit(1);
          console.log('Feedbacks table exists with columns:', tableInfo ? Object.keys(tableInfo[0]) : 'No data available');
        } catch (e) {
          console.log('Could not get feedbacks table info:', e);
        }
      } else {
        console.log('Feedback successfully stored in database:', data);
      }
      
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
      
      // Show success message
      toast.success('Thank you for your feedback!');

      // After successful feedback submission, fetch similar queries if analogy category is specified
      if (feedback.analogyPreference) {
        await fetchSimilarAnalogyQueries(feedback.analogyPreference);
      }
    } catch (err) {
      setError('Failed to save feedback. Please try again. Error: ' + (err.message || 'Unknown error'));
      console.error('Error saving feedback:', err);
      toast.error('Failed to submit feedback. Please try again.');
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

  const renderHighlyRatedQueries = () => {
    // Don't render if not loaded yet or if the form has been submitted already
    if (!highlyRatedQueries || Object.keys(highlyRatedQueries).length === 0 || submitted) {
      return null;
    }
  
    return (
      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <h3 className="text-sm font-medium text-blue-900">Highly Rated Similar Queries</h3>
        <div className="mt-2 space-y-4">
          {Object.entries(highlyRatedQueries).map(([category, queries]) => (
            <div key={category} className="border-b border-blue-200 pb-4 last:border-0">
              <h4 className="text-sm font-medium text-blue-800">{category}</h4>
              <ul className="mt-2 space-y-2">
                {/* Deduplicate queries by using a unique key/id */}
                {Array.from(new Map(queries.map(query => 
                  [query.id, query])).values()).slice(0, 5).map((query) => (
                  <li key={query.id} className="text-sm text-blue-700">
                    <div className="font-medium">{query.query}</div>
                    <div className="text-xs text-blue-600 mt-1">
                      Rating: {query.feedbacks[0]?.rating}/5
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSimilarAnalogyQueries = () => {
    if (!similarAnalogyQueries.length || submitted) return null;
  
    return (
      <div className="mt-6 p-4 bg-purple-50 rounded-md">
        <h3 className="text-sm font-medium text-purple-900">
          Similar Queries with {feedback.analogyPreference} Analogies
        </h3>
        <div className="mt-2 space-y-4">
          <ul className="space-y-3">
            {/* Deduplicate queries by using a unique key/id */}
            {Array.from(new Map(similarAnalogyQueries.map(query => 
              [query.id, query])).values()).slice(0, 5).map((query) => (
              <li key={query.id} className="text-sm text-purple-700">
                <div className="font-medium">{query.query}</div>
                <div className="text-xs text-purple-600 mt-1">
                  Rating: {query.feedbacks[0]?.rating}/5
                </div>
                {query.response?.analogy?.text && (
                  <div className="text-xs text-purple-500 mt-1 italic">
                    Analogy: {query.response.analogy.text}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  if (submitted) {
    return (
      <div className="mt-4 p-6 bg-gradient-to-r from-green-50 to-green-100 rounded-lg shadow-sm border border-green-200">
        <div className="flex items-center space-x-2 mb-4">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-green-700 font-medium">Thank you for your feedback!</p>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleRegenerateClick}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate Answer Based on Feedback
          </button>
        </div>

        {renderHighlyRatedQueries()}
        {renderSimilarAnalogyQueries()}
      </div>
    );
  }

  return (
    <div className="mt-4 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Help us improve this explanation</h3>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Rating Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">How helpful was this explanation?</label>
          <div className="flex space-x-4">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => setFeedback(prev => ({ ...prev, rating: rating.toString() }))}
                className={`p-2 rounded-full transition-colors duration-200 ${
                  parseInt(feedback.rating) >= rating
                    ? 'bg-primary-100 text-primary-600'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.363 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.363-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {parseInt(feedback.rating) === 1 ? 'Poor' :
             parseInt(feedback.rating) === 2 ? 'Fair' :
             parseInt(feedback.rating) === 3 ? 'Good' :
             parseInt(feedback.rating) === 4 ? 'Very Good' :
             'Excellent'}
          </p>
        </div>

        {/* Clarity Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Was the explanation clear?</label>
          <div className="grid grid-cols-3 gap-4">
            {['yes', 'partially', 'no'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFeedback(prev => ({ ...prev, explanationClear: option }))}
                className={`p-3 rounded-lg border transition-colors duration-200 ${
                  feedback.explanationClear === option
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Analogy Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Was the analogy helpful?</label>
          <div className="grid grid-cols-3 gap-4">
            {['yes', 'partially', 'no'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFeedback(prev => ({ ...prev, analogyHelpful: option }))}
                className={`p-3 rounded-lg border transition-colors duration-200 ${
                  feedback.analogyHelpful === option
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Detail Level Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">How detailed should the explanation be?</label>
          <div className="grid grid-cols-3 gap-4">
            {['more_detailed', 'current_level', 'simpler'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFeedback(prev => ({ ...prev, explanationDetail: option }))}
                className={`p-3 rounded-lg border transition-colors duration-200 ${
                  feedback.explanationDetail === option
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {option === 'more_detailed' ? 'More Detailed' :
                 option === 'current_level' ? 'Current Level' :
                 'Simpler'}
              </button>
            ))}
          </div>
        </div>

        {/* Analogy Preference Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">What type of analogy would help you understand better?</label>
          <select
            value={feedback.analogyPreference}
            onChange={(e) => setFeedback(prev => ({ ...prev, analogyPreference: e.target.value }))}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-md"
          >
            <option value="">Select a category</option>
            <option value="gaming">Gaming</option>
            <option value="sports">Sports</option>
            <option value="cooking">Cooking</option>
            <option value="music">Music</option>
            <option value="art">Art</option>
            <option value="nature">Nature</option>
            <option value="technology">Technology</option>
            <option value="business">Business</option>
            <option value="education">Education</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Comments Section */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Additional comments or suggestions</label>
          <textarea
            value={feedback.comments}
            onChange={(e) => setFeedback(prev => ({ ...prev, comments: e.target.value }))}
            rows="3"
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
            placeholder="What could be improved?"
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </button>
        </div>
      </form>

      {renderHighlyRatedQueries()}
      {renderSimilarAnalogyQueries()}
    </div>
  );
}

export default FeedbackForm; 