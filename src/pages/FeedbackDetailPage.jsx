import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function FeedbackDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFeedback();
  }, [id]);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setFeedback(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
        <div className="text-red-600">Error loading feedback: {error}</div>
      </div>
    );
  }

  if (!feedback) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-600">Feedback not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Feedback Details</h1>
          <button
            onClick={() => navigate('/admin/feedbacks')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Back to Feedbacks
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-medium text-gray-500">Rating</h2>
              <div className="flex items-center mt-1">
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

            <div>
              <h2 className="text-sm font-medium text-gray-500">Content</h2>
              <p className="mt-1 text-gray-900 whitespace-pre-wrap">{feedback.content}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500">Submission Date</h2>
              <p className="mt-1 text-gray-900">
                {new Date(feedback.created_at).toLocaleString()}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500">Last Updated</h2>
              <p className="mt-1 text-gray-900">
                {new Date(feedback.updated_at).toLocaleString()}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500">Feedback ID</h2>
              <p className="mt-1 text-gray-900 font-mono text-sm">{feedback.id}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FeedbackDetailPage; 