import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function FeedbacksPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedbacks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackClick = (feedbackId) => {
    navigate(`/admin/feedbacks/${feedbackId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">Error loading feedbacks: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">User Feedbacks</h1>
      
      <div className="grid gap-6">
        {feedbacks.map((feedback) => (
          <div
            key={feedback.id}
            onClick={() => handleFeedbackClick(feedback.id)}
            className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-500">
                  {new Date(feedback.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center">
                {[...Array(5)].map((_, index) => (
                  <svg
                    key={index}
                    className={`w-5 h-5 ${
                      index < feedback.rating ? 'text-yellow-400' : 'text-gray-300'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            
            <p className="text-gray-700 whitespace-pre-wrap">{feedback.content}</p>
          </div>
        ))}
        
        {feedbacks.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No feedbacks yet. Be the first to share your thoughts!
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbacksPage; 