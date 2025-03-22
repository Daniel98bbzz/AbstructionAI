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
  const fetchHighlyRatedQueries = async () => {
    try {
      const { data, error } = await supabase
        .from('queries')
        .select(`
          id,
          query,
          response,
          category,
          feedbacks!inner (
            rating
          )
        `)
        .gte('feedbacks.rating', 4)
        .order('feedbacks.rating', { ascending: false });

      if (error) throw error;

      // Group queries by analogy category
      const groupedQueries = data.reduce((acc, query) => {
        const analogyCategory = query.response?.analogy?.category || 'Uncategorized';
        if (!acc[analogyCategory]) {
          acc[analogyCategory] = [];
        }
        acc[analogyCategory].push(query);
        return acc;
      }, {});

      setHighlyRatedQueries(groupedQueries);
    } catch (error) {
      console.error('Error fetching highly rated queries:', error);
    }
  };

  // Add function to fetch similar queries by analogy category
  const fetchSimilarAnalogyQueries = async (analogyCategory) => {
    if (!analogyCategory) return;

    try {
      const { data, error } = await supabase
        .from('queries')
        .select(`
          id,
          query,
          response,
          category,
          feedbacks!inner (
            rating
          )
        `)
        .gte('feedbacks.rating', 4)
        .order('feedbacks.rating', { ascending: false });

      if (error) throw error;

      // Filter queries that have the same analogy category
      const similarQueries = data.filter(query => 
        query.response?.analogy?.category === analogyCategory
      );

      setSimilarAnalogyQueries(similarQueries);
    } catch (error) {
      console.error('Error fetching similar analogy queries:', error);
    }
  };

  // Fetch highly rated queries when component mounts
  useEffect(() => {
    fetchHighlyRatedQueries();
  }, []);

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

      // First, find the associated query for this response
      const { data: queryData, error: queryError } = await supabase
        .from('queries')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (queryError) {
        console.error('Error finding associated query:', queryError);
        // Instead of throwing an error, we'll create a new query
        const { data: newQuery, error: createQueryError } = await supabase
          .from('queries')
          .insert([
            {
              user_id: user.id,
              query: originalQuery || 'Feedback for response',
              response: { id: responseId },
              explanation: 'Feedback submission'
            }
          ])
          .select()
          .single();

        if (createQueryError) {
          console.error('Error creating new query:', createQueryError);
          throw new Error('Failed to create associated query for feedback');
        }

        queryData = newQuery;
      }

      // Store in new feedbacks table with the correct query_id
      const { data: feedbackRecord, error: feedbackError } = await supabase
        .from('feedbacks')
        .insert([
          {
            user_id: user.id,
            content: updatedFeedback.comments,
            rating: parseInt(updatedFeedback.rating),
            query_id: queryData.id // Use the query ID we found or created
          }
        ])
        .select()
        .single();

      if (feedbackError) {
        console.error('Error storing feedback in feedbacks table:', feedbackError);
        throw feedbackError;
      }

      // Update the query with the feedback_id
      const { error: updateQueryError } = await supabase
        .from('queries')
        .update({ feedback_id: feedbackRecord.id })
        .eq('id', queryData.id);

      if (updateQueryError) {
        console.error('Error updating query with feedback:', updateQueryError);
      }

      // Store in interactions table (existing functionality)
      try {
        // Either use the submit_feedback RPC function if it exists
        const { data, error } = await supabase.rpc('submit_feedback', {
          response_id: responseId,
          rating: updatedFeedback.rating,
          comments: updatedFeedback.comments,
          message_id: responseId,
          query_id: queryData.id // Use the query ID we found or created
        });
        
        if (error) {
          console.error('Error submitting feedback to database via RPC:', error);
          
          // Fallback: Insert directly into interactions table
          const { data: insertData, error: insertError } = await supabase
            .from('interactions')
            .insert([
              {
                session_id: sessionId,
                type: 'feedback',
                rating: updatedFeedback.rating,
                comments: updatedFeedback.comments,
                related_to: responseId,
                feedback_content: updatedFeedback,
                message_id: responseId,
                query_id: queryData.id // Use the query ID we found or created
              }
            ]);
            
          if (insertError) {
            console.error('Error inserting feedback directly:', insertError);
          } else {
            console.log('Feedback successfully stored in database via direct insert');
          }
        } else {
          console.log('Feedback successfully stored in database via RPC function:', data);
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        // Continue with the rest of the function even if database storage fails
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

  // Add this before the return statement
  const renderHighlyRatedQueries = () => {
    if (!highlyRatedQueries || Object.keys(highlyRatedQueries).length === 0) {
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
                {queries.map((query) => (
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

  // Add function to render similar analogy queries
  const renderSimilarAnalogyQueries = () => {
    if (!similarAnalogyQueries.length) return null;

    return (
      <div className="mt-6 p-4 bg-purple-50 rounded-md">
        <h3 className="text-sm font-medium text-purple-900">
          Similar Queries with {feedback.analogyPreference} Analogies
        </h3>
        <div className="mt-2 space-y-4">
          <ul className="space-y-3">
            {similarAnalogyQueries.map((query) => (
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

        {renderHighlyRatedQueries()}
        {renderSimilarAnalogyQueries()}
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

      {renderHighlyRatedQueries()}
      {renderSimilarAnalogyQueries()}
    </div>
  );
}

export default FeedbackForm; 