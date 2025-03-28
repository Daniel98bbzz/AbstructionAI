import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchAllFeedback, syncLocalFeedbackToDatabase, deleteLocalFeedback, deleteDatabaseFeedback } from '../../utils/fetchFeedbackUtils';
import FeedbackDetail from '../../components/FeedbackDetail';

function FeedbackList() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { feedbackId } = useParams();
  const navigate = useNavigate();

  // Load all feedback on component mount
  useEffect(() => {
    loadFeedback();
  }, []);

  // Select feedback when feedbackId param changes
  useEffect(() => {
    if (feedbackId && feedback.length > 0) {
      const selected = feedback.find(item => item.id === feedbackId);
      setSelectedFeedback(selected || null);
    } else if (feedback.length > 0 && !selectedFeedback) {
      setSelectedFeedback(feedback[0]);
    }
  }, [feedbackId, feedback, selectedFeedback]);

  // Load feedback from database and localStorage
  const loadFeedback = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchAllFeedback();
      setFeedback(data);
      
      // If specific feedback was requested, select it
      if (feedbackId) {
        const selected = data.find(item => item.id === feedbackId);
        setSelectedFeedback(selected || (data.length > 0 ? data[0] : null));
      } else if (data.length > 0) {
        setSelectedFeedback(data[0]);
      }
    } catch (err) {
      setError('Failed to load feedback: ' + err.message);
      console.error('Error loading feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle syncing feedback from localStorage to database
  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      
      const result = await syncLocalFeedbackToDatabase();
      setSyncResult(result);
      
      // Reload feedback to reflect changes
      if (result.synced > 0) {
        await loadFeedback();
      }
    } catch (err) {
      setSyncResult({
        success: false,
        message: 'Error syncing feedback: ' + err.message
      });
      console.error('Error syncing feedback:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Handle deleting feedback
  const handleDelete = async (id, source) => {
    if (!id) return;
    
    if (!window.confirm('Are you sure you want to delete this feedback?')) {
      return;
    }
    
    try {
      setDeleting(true);
      
      let success = false;
      if (source === 'localStorage') {
        success = deleteLocalFeedback(id);
      } else {
        success = await deleteDatabaseFeedback(id);
      }
      
      if (success) {
        // If we deleted the currently selected feedback, clear selection
        if (selectedFeedback && selectedFeedback.id === id) {
          setSelectedFeedback(null);
          navigate('/admin/feedback');
        }
        
        // Reload feedback to reflect changes
        await loadFeedback();
      } else {
        setError('Failed to delete feedback');
      }
    } catch (err) {
      setError('Error deleting feedback: ' + err.message);
      console.error('Error deleting feedback:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Admin Dashboard - Feedback Management
          </h1>
          <Link to="/dashboard" className="text-primary-600 hover:text-primary-900">
            Return to Dashboard
          </Link>
        </div>
      </header>
      
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          {/* Action buttons */}
          <div className="mb-6 flex justify-between">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Local Feedback to Database'}
            </button>
            
            <button
              onClick={loadFeedback}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh Data'}
            </button>
          </div>
          
          {/* Sync result message */}
          {syncResult && (
            <div className={`mb-6 p-4 rounded-md ${
              syncResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              <p className="font-medium">{syncResult.message}</p>
              {syncResult.synced > 0 && (
                <p className="mt-1 text-sm">
                  Successfully synced {syncResult.synced} items
                  {syncResult.failed > 0 && `, failed to sync ${syncResult.failed} items`}.
                </p>
              )}
            </div>
          )}
          
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 rounded-md bg-red-50 text-red-800">
              <p>{error}</p>
            </div>
          )}
          
          {/* Main content */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            {loading ? (
              <div className="flex justify-center items-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              </div>
            ) : feedback.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-gray-500">No feedback found</p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row">
                {/* Feedback list */}
                <div className="w-full md:w-1/3 border-r border-gray-200">
                  <div className="pt-3 pb-2 px-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                      Feedback ({feedback.length})
                    </h3>
                  </div>
                  <ul className="overflow-y-auto max-h-[calc(100vh-16rem)]">
                    {feedback.map((item) => (
                      <li
                        key={item.id}
                        className={`border-b border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                          selectedFeedback && selectedFeedback.id === item.id ? 'bg-gray-100' : ''
                        }`}
                        onClick={() => {
                          setSelectedFeedback(item);
                          navigate(`/admin/feedback/${item.id}`);
                        }}
                      >
                        <div className="flex justify-between">
                          <div className="text-sm font-medium text-primary-600">
                            Rating: {item.rating}/5
                          </div>
                          <div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.source === 'database' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {item.source === 'database' ? 'DB' : 'Local'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="mt-1 flex justify-between">
                          <div className="text-xs text-gray-500">
                            {new Date(item.timestamp).toLocaleString()}
                          </div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id, item.source);
                            }}
                            disabled={deleting}
                            className="text-xs text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Feedback detail */}
                <div className="w-full md:w-2/3 p-6">
                  <FeedbackDetail feedback={selectedFeedback} />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default FeedbackList;