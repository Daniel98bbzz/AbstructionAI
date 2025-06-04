import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { calculateScore, getRecentFeedback, calculateConversationScore, getConversationFeedback } from '../utils/secretFeedbackClassifier';

// Enable debug mode
const DEBUG = true;

function SecretFeedbackDashboard() {
  const { user } = useAuth();
  const [score, setScore] = useState(null);
  const [recentFeedback, setRecentFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    positive: 0,
    negative: 0,
    neutral: 0,
    total: 0
  });
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [viewMode, setViewMode] = useState('overall'); // 'overall' or 'conversation'
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationStats, setConversationStats] = useState(null);
  const [conversationFeedback, setConversationFeedback] = useState([]);
  const [uniqueConversations, setUniqueConversations] = useState([]);

  const loadFeedbackData = async () => {
    if (!user) {
      if (DEBUG) console.log('[DASHBOARD DEBUG] No user available for feedback data');
      return;
    }

    try {
      if (DEBUG) console.log('[DASHBOARD DEBUG] Loading feedback data for user:', user.id);
      
      setLoading(true);

      // Calculate overall score
      const userScore = await calculateScore(user.id);
      if (DEBUG) console.log('[DASHBOARD DEBUG] Received score:', userScore);
      setScore(userScore || 0);

      // Get recent feedback
      const feedbackResult = await getRecentFeedback(user.id, 50);
      if (DEBUG) console.log('[DASHBOARD DEBUG] Recent feedback result:', feedbackResult);
      
      if (feedbackResult.success && feedbackResult.data) {
        setRecentFeedback(feedbackResult.data);

        // Calculate overall stats
        const newStats = {
          positive: feedbackResult.data.filter(f => f.feedback_type === 'positive').length,
          negative: feedbackResult.data.filter(f => f.feedback_type === 'negative').length,
          neutral: feedbackResult.data.filter(f => f.feedback_type === 'neutral').length,
          total: feedbackResult.data.length
        };
        
        if (DEBUG) console.log('[DASHBOARD DEBUG] Calculated stats:', newStats);
        setStats(newStats);

        // Extract unique conversations
        const conversations = [...new Set(feedbackResult.data
          .filter(f => f.conversation_id)
          .map(f => f.conversation_id))]
          .map(id => ({
            id,
            count: feedbackResult.data.filter(f => f.conversation_id === id).length,
            lastActivity: Math.max(...feedbackResult.data
              .filter(f => f.conversation_id === id)
              .map(f => new Date(f.timestamp).getTime()))
          }))
          .sort((a, b) => b.lastActivity - a.lastActivity);
        
        setUniqueConversations(conversations);
        if (DEBUG) console.log('[DASHBOARD DEBUG] Unique conversations:', conversations);
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('[DASHBOARD DEBUG] Error loading feedback data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversationData = async (conversationId) => {
    if (!user || !conversationId) return;

    try {
      if (DEBUG) console.log('[DASHBOARD DEBUG] Loading conversation data for:', conversationId);

      // Calculate conversation score
      const conversationScore = await calculateConversationScore(user.id, conversationId);
      
      // Get conversation feedback
      const conversationFeedbackResult = await getConversationFeedback(user.id, conversationId);
      
      if (conversationFeedbackResult.success && conversationFeedbackResult.data) {
        setConversationFeedback(conversationFeedbackResult.data);
        
        // Calculate conversation stats
        const conversationData = conversationFeedbackResult.data;
        const conversationStatsData = {
          positive: conversationData.filter(f => f.feedback_type === 'positive').length,
          negative: conversationData.filter(f => f.feedback_type === 'negative').length,
          neutral: conversationData.filter(f => f.feedback_type === 'neutral').length,
          total: conversationData.length,
          score: conversationScore || 0
        };
        
        setConversationStats(conversationStatsData);
        if (DEBUG) console.log('[DASHBOARD DEBUG] Conversation stats:', conversationStatsData);
      }
    } catch (error) {
      console.error('[DASHBOARD DEBUG] Error loading conversation data:', error);
    }
  };

  useEffect(() => {
    if (DEBUG) console.log('[DASHBOARD DEBUG] useEffect triggered, user:', user?.id);
    loadFeedbackData();
  }, [user]);

  useEffect(() => {
    if (selectedConversation) {
      loadConversationData(selectedConversation);
    }
  }, [selectedConversation, user]);

  const handleRefresh = () => {
    if (DEBUG) console.log('[DASHBOARD DEBUG] Manual refresh triggered');
    loadFeedbackData();
    if (selectedConversation) {
      loadConversationData(selectedConversation);
    }
  };

  const getScoreColor = (score) => {
    if (score > 0) return 'text-green-600';
    if (score < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getScoreText = (score) => {
    if (score > 5) return 'Excellent';
    if (score > 0) return 'Positive';
    if (score === 0) return 'Neutral';
    if (score > -5) return 'Needs Improvement';
    return 'Poor';
  };

  const formatConversationId = (conversationId) => {
    // Show first 8 characters of conversation ID for readability
    return conversationId.length > 8 ? `${conversationId.substring(0, 8)}...` : conversationId;
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Feedback Analytics
        </h3>
        
        {/* View Mode Toggle */}
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setViewMode('overall');
              setSelectedConversation(null);
            }}
            className={`px-3 py-1 text-sm rounded-md ${
              viewMode === 'overall' 
                ? 'bg-primary-100 text-primary-700' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Overall
          </button>
          <button
            onClick={() => setViewMode('conversation')}
            className={`px-3 py-1 text-sm rounded-md ${
              viewMode === 'conversation' 
                ? 'bg-primary-100 text-primary-700' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            By Conversation
          </button>
        </div>
      </div>

      {viewMode === 'overall' ? (
        <>
          {/* Overall Score Display */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Overall Score:</span>
              <div className="text-right">
                <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                  {score !== null ? score : 'N/A'}
                </span>
                <div className={`text-sm ${getScoreColor(score)}`}>
                  {score !== null ? getScoreText(score) : 'No data'}
                </div>
              </div>
            </div>
            {score !== null && (
              <div className="mt-2 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    score > 0 ? 'bg-green-500' : score < 0 ? 'bg-red-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${Math.min(Math.abs(score) * 10, 100)}%` }}
                ></div>
              </div>
            )}
          </div>

          {/* Overall Statistics */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
              <div className="text-sm text-green-700">Positive</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats.negative}</div>
              <div className="text-sm text-red-700">Negative</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{stats.neutral}</div>
              <div className="text-sm text-gray-700">Neutral</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-blue-700">Total</div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Conversation View */}
          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-900 mb-3">Select Conversation</h4>
            <select
              value={selectedConversation || ''}
              onChange={(e) => setSelectedConversation(e.target.value || null)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Choose a conversation...</option>
              {uniqueConversations.map((conv) => (
                <option key={conv.id} value={conv.id}>
                  {formatConversationId(conv.id)} ({conv.count} messages)
                </option>
              ))}
            </select>
          </div>

          {selectedConversation && conversationStats && (
            <>
              {/* Conversation Score */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Conversation Score:</span>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${getScoreColor(conversationStats.score)}`}>
                      {conversationStats.score}
                    </span>
                    <div className={`text-sm ${getScoreColor(conversationStats.score)}`}>
                      {getScoreText(conversationStats.score)}
                    </div>
                  </div>
                </div>
                {conversationStats.score !== null && (
                  <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        conversationStats.score > 0 ? 'bg-green-500' : conversationStats.score < 0 ? 'bg-red-500' : 'bg-gray-400'
                      }`}
                      style={{ width: `${Math.min(Math.abs(conversationStats.score) * 10, 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Conversation Statistics */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{conversationStats.positive}</div>
                  <div className="text-sm text-green-700">Positive</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{conversationStats.negative}</div>
                  <div className="text-sm text-red-700">Negative</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{conversationStats.neutral}</div>
                  <div className="text-sm text-gray-700">Neutral</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{conversationStats.total}</div>
                  <div className="text-sm text-blue-700">Total</div>
                </div>
              </div>

              {/* Conversation Messages */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Messages in This Conversation</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {conversationFeedback.length > 0 ? (
                    conversationFeedback.map((feedback) => (
                      <div key={feedback.id} className="flex items-start justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{feedback.message}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(feedback.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                          feedback.feedback_type === 'positive' 
                            ? 'bg-green-100 text-green-800'
                            : feedback.feedback_type === 'negative'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {feedback.feedback_type}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No feedback data for this conversation</p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Refresh Button */}
      <div className="mt-4 pt-4 border-t">
        <button
          onClick={handleRefresh}
          className="w-full px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}

export default SecretFeedbackDashboard; 