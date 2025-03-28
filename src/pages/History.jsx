import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../contexts/QueryContext';

function History() {
  const { getQueryHistory, getSessionDetails, loading } = useQuery();
  const [queries, setQueries] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const limit = 10;

  useEffect(() => {
    loadQueries();
  }, []);

  const loadQueries = async () => {
    try {
      setLoadingMore(true);
      const offset = page * limit;
      const history = await getQueryHistory(limit, offset);
      
      // Convert to array if it's not already
      const historyArray = Array.isArray(history) ? history : [];
      
      if (historyArray.length < limit) {
        setHasMore(false);
      }
      
      setQueries(prev => [...prev, ...historyArray]);
      setPage(prev => prev + 1);
    } catch (error) {
      console.error('Error loading query history:', error);
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
          </div>
          
          <div className="border-t border-gray-200">
            {queries.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {queries.map((query, index) => (
                  <li key={index} className="px-4 py-5 sm:px-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-primary-600 truncate">
                        {query.query}
                      </h3>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {formatDate(query.created_at)}
                        </p>
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
                      
                      <button
                        onClick={() => loadSessionDetails(query.session.id)}
                        className="text-primary-600 hover:text-primary-900 text-sm font-medium"
                      >
                        View Details
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-5 sm:px-6 text-center">
                {loading ? (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-500">No queries found in your history.</p>
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
                  onClick={loadQueries}
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