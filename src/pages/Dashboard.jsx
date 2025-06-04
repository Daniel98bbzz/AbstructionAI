import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '../contexts/QueryContext';
import ClusterQuizSuggestions from '../components/ClusterQuizSuggestions';
import SecretFeedbackDashboard from '../components/SecretFeedbackDashboard';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import TopicFeed from '../components/TopicFeed';


function Dashboard() {
  const { user } = useAuth();
  const { getQueryHistory, loading } = useQuery();
  const [recentQueries, setRecentQueries] = useState([]);
  const [stats, setStats] = useState({
    totalQueries: 0,
    averageRating: 0
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (user) {
          const history = await getQueryHistory(5);
          
          // Convert to array if it's not already
          const historyArray = Array.isArray(history) ? history : (history ? [] : []);
          setRecentQueries(historyArray);
          
          // Calculate stats from history
          const totalQueries = historyArray.length;
          
          // Calculate average rating if ratings exist
          let totalRating = 0;
          let ratingCount = 0;
          historyArray.forEach(query => {
            if (query.rating) {
              totalRating += query.rating;
              ratingCount++;
            }
          });
          
          const averageRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : 0;
          
          setStats({
            totalQueries,
            averageRating: averageRating || 0
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };
    
    fetchData();
  }, [user]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to AbstructionAI</h1>
        <p className="text-lg text-gray-600 mb-8">Please log in to access your dashboard.</p>
        <Link to="/login" className="btn btn-primary">
          Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Welcome, {user?.email}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Query Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">New Query</h2>
          <p className="text-gray-600 mb-4">Start a new query to analyze your data</p>
          <button
            onClick={() => navigate('/query')}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Start Query
          </button>
        </div>

        {/* History Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Query History</h2>
          <p className="text-gray-600 mb-4">View your past queries and results</p>
          <button
            onClick={() => navigate('/history')}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            View History
          </button>
        </div>

        {/* Feedbacks Card */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">User Feedbacks</h2>
          <p className="text-gray-600 mb-4">View and manage user feedbacks</p>
          <button
            onClick={() => navigate('/admin/feedbacks')}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            View Feedbacks
          </button>
        </div>
      </div>

      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.user_metadata?.first_name || 'User'}
          </h1>
          <p className="mt-1 text-lg text-gray-500">
            Continue your learning journey
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <Link
            to="/query"
            className="btn btn-primary"
          >
            New Query
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Queries
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {stats.totalQueries}
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Average Rating
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {stats.averageRating} / 5
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
                <svg className="h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Learning Streak
                  </dt>
                  <dd>
                    <div className="text-lg font-medium text-gray-900">
                      {Math.min(stats.totalQueries, 7)} days
                    </div>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cluster Quiz Suggestions */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              What Others Are Challenging
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Quiz scores from users with similar learning preferences - can you beat them?
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200">
          <ClusterQuizSuggestions />
        </div>
      </div>

      {/* Discover Section */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Discover Learning Topics
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Explore trending topics and personalized recommendations from your learning community
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200">
          <TopicFeed />
        </div>
      </div>

      {/* Analytics Section */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              System Analytics
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Insights into topic popularity, user engagement, and learning trends across the platform
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200 p-6">
          <AnalyticsDashboard />
        </div>
      </div>

      {/* Secret Feedback Analytics Card */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Feedback Analytics</h2>
        <p className="text-gray-600 mb-4">Your interaction patterns and sentiment analysis</p>
        <SecretFeedbackDashboard />
      </div>
    </div>
  );
}

export default Dashboard;