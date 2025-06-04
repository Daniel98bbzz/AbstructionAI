import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../contexts/QueryContext';

function History() {
  const { 
    getQueryHistory, 
    getSessionDetails, 
    getSessionsByTopic, 
    getUserTopicsSummary, 
    getAllTopics,
    loading 
  } = useQuery();
  
  const [queries, setQueries] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  
  // Topic filtering state
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [userTopics, setUserTopics] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [topicStats, setTopicStats] = useState({ user_topics: [], total_sessions: 0, unique_topics: 0 });
  const [loadingTopics, setLoadingTopics] = useState(false);
  
  const limit = 10;

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingTopics(true);
      
      // Load topics data in parallel
      const [topicsData, userTopicsData, allTopicsData] = await Promise.all([
        getUserTopicsSummary(),
        getUserTopicsSummary(),
        getAllTopics()
      ]);
      
      setTopicStats(userTopicsData);
      setUserTopics(userTopicsData.user_topics || []);
      setAllTopics(allTopicsData || []);
      
      // Load initial queries (all topics)
      loadQueries(true);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadQueries = async (reset = false) => {
    try {
      setLoadingMore(true);
      const offset = reset ? 0 : page * limit;
      
      let history;
      if (selectedTopic === 'all') {
        history = await getQueryHistory(limit, offset);
      } else {
        history = await getSessionsByTopic(selectedTopic, limit, offset);
      }
      
      // Convert to array if it's not already
      const historyArray = Array.isArray(history) ? history : [];
      
      if (historyArray.length < limit) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      
      if (reset) {
        setQueries(historyArray);
        setPage(1);
      } else {
        setQueries(prev => [...prev, ...historyArray]);
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error loading query history:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTopicChange = (topic) => {
    setSelectedTopic(topic);
    setPage(0);
    setHasMore(true);
    // Load queries with the new topic filter
    loadQueriesForTopic(topic);
  };

  const loadQueriesForTopic = async (topic) => {
    try {
      setLoadingMore(true);
      
      let history;
      if (topic === 'all') {
        history = await getQueryHistory(limit, 0);
      } else {
        history = await getSessionsByTopic(topic, limit, 0);
      }
      
      // Convert to array if it's not already
      const historyArray = Array.isArray(history) ? history : [];
      
      if (historyArray.length < limit) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      
      setQueries(historyArray);
      setPage(1);
    } catch (error) {
      console.error('Error loading query history for topic:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadSessionDetails = async (sessionId) => {
    try {
      setLoadingSession(true);
      const sessionData = await getSessionDetails(sessionId);
      setSelectedSession(sessionData);
    } catch (error) {
      console.error('Error loading session details:', error);
    } finally {
      setLoadingSession(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTopicName = (topicName) => {
    if (!topicName) return 'No Topic';
    return topicName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getTopicBadgeColor = (topicName) => {
    // Generate consistent colors based on topic name
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
    
    // Simple hash function to get consistent color
    let hash = 0;
    for (let i = 0; i < topicName.length; i++) {
      hash = topicName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="max-w-4xl mx-auto">
      {selectedSession ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Session Details
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                {formatDate(selectedSession.created_at)}
              </p>
              {selectedSession.secret_topic && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${getTopicBadgeColor(selectedSession.secret_topic)}`}>
                  {formatTopicName(selectedSession.secret_topic)}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedSession(null)}
              className="text-primary-600 hover:text-primary-900 text-sm font-medium"
            >
              Back to History
            </button>
          </div>
          
          <div className="border-t border-gray-200">
            {loadingSession ? (
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading session details...</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {selectedSession.interactions && selectedSession.interactions.map((interaction, index) => (
                  <div key={index} className="p-6">
                    {interaction.type === 'query' ? (
                      <div>
                        <div className="flex items-center">
                          <div className="flex-shrink-0 bg-primary-100 rounded-md p-2">
                            <svg className="h-5 w-5 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <h3 className="text-lg font-medium text-gray-900">Query</h3>
                            <p className="text-sm text-gray-500">{formatDate(interaction.created_at)}</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="text-gray-800">{interaction.query}</p>
                        </div>
                        {interaction.response && (
                          <div className="mt-4 pl-5 border-l-2 border-primary-600">
                            <h4 className="text-md font-medium text-gray-900">Explanation</h4>
                            <p className="mt-1 text-gray-700">{interaction.response.explanation}</p>
                            
                            {interaction.response.analogy && (
                              <div className="mt-3">
                                <h4 className="text-md font-medium text-gray-900">Analogy</h4>
                                <p className="mt-1 text-gray-700">{interaction.response.analogy}</p>
                              </div>
                            )}
                            
                            {interaction.response.resources && interaction.response.resources.length > 0 && (
                              <div className="mt-3">
                                <h4 className="text-md font-medium text-gray-900">Resources</h4>
                                <ul className="mt-1 list-disc pl-5">
                                  {interaction.response.resources.map((resource, idx) => (
                                    <li key={idx}>
                                      <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500">
                                        {resource.title}
                                      </a>
                                      {resource.description && (
                                        <p className="text-sm text-gray-500">{resource.description}</p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : interaction.type === 'feedback' ? (
                      <div>
                        <div className="flex items-center">
                          <div className="flex-shrink-0 bg-green-100 rounded-md p-2">
                            <svg className="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <h3 className="text-lg font-medium text-gray-900">Feedback</h3>
                            <p className="text-sm text-gray-500">{formatDate(interaction.created_at)}</p>
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center">
                            <span className="text-sm text-gray-700 mr-2">Rating:</span>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= interaction.rating ? 'text-yellow-400' : 'text-gray-300'
                                  }`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                          </div>
                          {interaction.comments && (
                            <p className="mt-2 text-gray-700">{interaction.comments}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-700">Unknown interaction type: {interaction.type}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Query History
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Review your past learning sessions
            </p>
            
            {/* Topic Statistics Summary */}
            {topicStats.unique_topics > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Your Learning Overview</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">{topicStats.total_sessions}</div>
                    <div className="text-sm text-gray-500">Total Sessions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{topicStats.unique_topics}</div>
                    <div className="text-sm text-gray-500">Topics Explored</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {topicStats.unique_topics > 0 ? Math.round(topicStats.total_sessions / topicStats.unique_topics) : 0}
                    </div>
                    <div className="text-sm text-gray-500">Avg Sessions/Topic</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Topic Filter Section */}
          <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <label htmlFor="topic-filter" className="text-sm font-medium text-gray-700">
                  Filter by Topic:
                </label>
                <select
                  id="topic-filter"
                  value={selectedTopic}
                  onChange={(e) => handleTopicChange(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  disabled={loadingTopics}
                >
                  <option value="all">All Topics ({topicStats.total_sessions})</option>
                  {userTopics.map((topic) => (
                    <option key={topic.name} value={topic.name}>
                      {formatTopicName(topic.name)} ({topic.user_session_count})
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Topic quick filters for most used topics */}
              {userTopics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleTopicChange('all')}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                      selectedTopic === 'all' 
                        ? 'bg-primary-100 text-primary-800 border-primary-200' 
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </button>
                  {userTopics.slice(0, 4).map((topic) => (
                    <button
                      key={topic.name}
                      onClick={() => handleTopicChange(topic.name)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        selectedTopic === topic.name 
                          ? 'bg-primary-100 text-primary-800 border-primary-200' 
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {formatTopicName(topic.name)} ({topic.user_session_count})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="border-t border-gray-200">
            {queries.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {queries.map((query, index) => (
                  <li key={index} className="px-4 py-5 sm:px-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-primary-600 truncate">
                          {query.query}
                        </h3>
                        <div className="mt-1 flex items-center space-x-2">
                          <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            {formatDate(query.created_at)}
                          </p>
                          {(query.secret_topic || query.session?.secret_topic) && (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTopicBadgeColor(query.secret_topic || query.session?.secret_topic)}`}>
                              {formatTopicName(query.secret_topic || query.session?.secret_topic)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        <button
                          onClick={() => loadSessionDetails(query.session.id)}
                          className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {query.response?.explanation?.substring(0, 150)}...
                      </p>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center">
                        {query.rating ? (
                          <div className="flex items-center">
                            <span className="text-sm text-gray-500 mr-2">Rating:</span>
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= query.rating ? 'text-yellow-400' : 'text-gray-300'
                                  }`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">No rating provided</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-5 sm:px-6 text-center">
                {loading || loadingMore ? (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-500">
                      {selectedTopic === 'all' 
                        ? 'No queries found in your history.' 
                        : `No queries found for topic "${formatTopicName(selectedTopic)}".`
                      }
                    </p>
                    <div className="mt-4">
                      <Link to="/query" className="btn btn-primary">
                        Submit a Query
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {hasMore && queries.length > 0 && (
              <div className="px-4 py-4 sm:px-6 border-t border-gray-200">
                <button
                  onClick={() => loadQueries()}
                  disabled={loadingMore}
                  className="w-full btn btn-outline"
                >
                  {loadingMore ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading...
                    </span>
                  ) : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default History;