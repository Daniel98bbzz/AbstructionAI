import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../contexts/QueryContext';

function TopicFeed() {
  const { 
    getTopicFeed, 
    getTrendingTopics, 
    getTopicSuggestions,
    loading 
  } = useQuery();
  
  const [feed, setFeed] = useState({
    recent_activity: [],
    trending_topics: [],
    suggestions: [],
    cluster_id: null,
    cluster_size: 0
  });
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState(null);
  const [showLearners, setShowLearners] = useState({}); // Track which topics show learners

  useEffect(() => {
    loadTopicFeed();
  }, []);

  const loadTopicFeed = async () => {
    try {
      setLoadingFeed(true);
      setError(null);
      
      const feedData = await getTopicFeed();
      setFeed(feedData.feed || {
        recent_activity: [],
        trending_topics: [],
        suggestions: [],
        cluster_id: null,
        cluster_size: 0
      });
    } catch (err) {
      console.error('Error loading topic feed:', err);
      setError('Failed to load your personalized topic feed. Please try again.');
    } finally {
      setLoadingFeed(false);
    }
  };

  const toggleLearners = (topicName) => {
    setShowLearners(prev => ({
      ...prev,
      [topicName]: !prev[topicName]
    }));
  };

  const formatTopicName = (topicName) => {
    if (!topicName) return 'Unknown Topic';
    return topicName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getTopicBadgeColor = (topicName) => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800', 
      'bg-purple-100 text-purple-800',
      'bg-yellow-100 text-yellow-800',
      'bg-red-100 text-red-800',
      'bg-indigo-100 text-indigo-800',
      'bg-pink-100 text-pink-800',
      'bg-gray-100 text-gray-800'
    ];
    
    if (!topicName) return 'bg-gray-100 text-gray-800';
    
    let hash = 0;
    for (let i = 0; i < topicName.length; i++) {
      hash = topicName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getSuggestionIcon = (type) => {
    switch (type) {
      case 'cluster_trending':
        return (
          <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'global_popular':
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      case 'interest_based':
        return (
          <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (loading || loadingFeed) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your personalized topic feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <button 
            onClick={loadTopicFeed}
            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Discover Topics</h1>
          <p className="mt-2 text-lg text-gray-600">
            Explore trending topics and personalized recommendations from your learning community
          </p>
          {feed.cluster_size > 0 && (
            <div className="mt-2 text-sm text-gray-500">
              Connected to a cluster of {feed.cluster_size} learners
            </div>
          )}
        </div>

        <div className="mb-6">
          <button
            onClick={loadTopicFeed}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Feed
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
              <p className="mt-1 text-sm text-gray-500">Your latest learning topics</p>
            </div>
            <div className="border-t border-gray-200">
              {feed.recent_activity && feed.recent_activity.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                  {feed.recent_activity.slice(0, 5).map((activity, index) => (
                    <li key={index} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTopicBadgeColor(activity.secret_topic)}`}>
                            {formatTopicName(activity.secret_topic)}
                          </span>
                        </div>
                        <div className="flex-shrink-0 text-xs text-gray-500">
                          {formatDate(activity.created_at)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-5 text-center text-gray-500">
                  <p>No recent activity</p>
                  <Link to="/query" className="text-primary-600 hover:text-primary-500 text-sm">
                    Start learning
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Trending Topics */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Trending in Your Cluster</h3>
              <p className="mt-1 text-sm text-gray-500">Popular topics among similar learners</p>
            </div>
            <div className="border-t border-gray-200">
              {feed.trending_topics && feed.trending_topics.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                  {feed.trending_topics.slice(0, 5).map((topic, index) => (
                    <li key={index} className="px-4 py-3">
                      <Link to={`/query?topic=${topic.name}`} className="block hover:bg-gray-50 p-2 rounded">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTopicBadgeColor(topic.name)}`}>
                              {formatTopicName(topic.name)}
                            </span>
                            <div className="mt-1 flex items-center justify-between">
                              <p className="text-xs text-gray-500">
                                {topic.unique_users} learners • Trend score: {topic.trend_score.toFixed(1)}
                              </p>
                              {topic.learners && topic.learners.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleLearners(topic.name);
                                  }}
                                  className="text-xs text-primary-600 hover:text-primary-500 flex items-center"
                                >
                                  <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                                  </svg>
                                  {showLearners[topic.name] ? 'Hide' : 'Show'} learners
                                </button>
                              )}
                            </div>
                            
                            {/* Learners List */}
                            {showLearners[topic.name] && topic.learners && topic.learners.length > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                <p className="text-gray-600 font-medium mb-1">Learning community:</p>
                                <div className="flex flex-wrap gap-1">
                                  {topic.learners.slice(0, 6).map((learner, learnerIndex) => (
                                    <span
                                      key={learnerIndex}
                                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                    >
                                      {learner.username}
                                    </span>
                                  ))}
                                  {topic.learners.length > 6 && (
                                    <span className="text-gray-500">
                                      +{topic.learners.length - 6} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 ml-2">
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-5 text-center text-gray-500">
                  <p>No trending topics available</p>
                  <p className="text-xs">More learners in your cluster will create trends</p>
                </div>
              )}
            </div>
          </div>

          {/* Topic Suggestions */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Suggested for You</h3>
              <p className="mt-1 text-sm text-gray-500">Topics you might find interesting</p>
            </div>
            <div className="border-t border-gray-200">
              {feed.suggestions && feed.suggestions.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                  {feed.suggestions.slice(0, 5).map((suggestion, index) => (
                    <li key={index} className="px-4 py-3 hover:bg-gray-50">
                      <Link to={`/query?topic=${suggestion.name}`} className="block">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center">
                              {getSuggestionIcon(suggestion.type)}
                              <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTopicBadgeColor(suggestion.name)}`}>
                                {formatTopicName(suggestion.name)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {suggestion.reason}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-5 text-center text-gray-500">
                  <p>No suggestions available</p>
                  <p className="text-xs">Complete your profile for better recommendations</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TopicFeed; 