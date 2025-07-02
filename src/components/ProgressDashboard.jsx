import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../contexts/QueryContext';

function ProgressDashboard() {
  const { 
    getUserProgress, 
    getLearningPathRecommendations, 
    getUserAchievements,
    getEnhancedProgress,
    getLeaderboard,
    getAdaptiveRecommendations,
    loading 
  } = useQuery();
  
  const [progressData, setProgressData] = useState(null);
  const [enhancedProgress, setEnhancedProgress] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [achievements, setAchievements] = useState([]);

  const [leaderboardData, setLeaderboardData] = useState(null);
  const [adaptiveRecommendations, setAdaptiveRecommendations] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, topics, paths, achievements, leaderboard

  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    try {
      setLoadingProgress(true);
      setError(null);
      
      // Load all progress data in parallel
      // Load core progress data
      const enhancedResult = await getEnhancedProgress();
      
      // Load optional data with graceful fallbacks
      const [
        progressResult, 
        recommendationsResult, 
        achievementsResult, 
        leaderboardResult,
        adaptiveResult
      ] = await Promise.allSettled([
        getUserProgress(),
        getLearningPathRecommendations(),
        getUserAchievements(),
        getLeaderboard('total').catch(() => ({ success: false, error: 'Leaderboard not available' })),
        getAdaptiveRecommendations().catch(() => ({ success: false, error: 'Recommendations not available' }))
      ]);
      
      // Handle core progress data
      if (enhancedResult.success) {
        setEnhancedProgress(enhancedResult);
      }
      
      // Handle optional data with graceful fallbacks
      if (progressResult.status === 'fulfilled' && progressResult.value?.success) {
        setProgressData(progressResult.value);
      }
      
      if (recommendationsResult.status === 'fulfilled' && recommendationsResult.value?.success) {
        setRecommendations(recommendationsResult.value.recommendations || []);
      }
      
      if (achievementsResult.status === 'fulfilled' && achievementsResult.value?.success) {
        setAchievements(achievementsResult.value.achievements || []);
      }
      

      
      if (leaderboardResult.status === 'fulfilled' && leaderboardResult.value?.success) {
        setLeaderboardData(leaderboardResult.value);
      } else {
        // Set empty leaderboard if endpoint fails
        setLeaderboardData({
          success: true,
          leaderboard: [],
          currentUser: { position: 'Unranked', tier: 'bronze', total_points: 0 }
        });
      }
      
      if (adaptiveResult.status === 'fulfilled' && adaptiveResult.value?.success) {
        setAdaptiveRecommendations(adaptiveResult.value.recommendations || []);
      }
      
    } catch (err) {
      console.error('Error loading progress data:', err);
      setError('Failed to load your progress data. Please try again.');
    } finally {
      setLoadingProgress(false);
    }
  };

  const formatTopicName = (topicName) => {
    if (!topicName) return 'Unknown Topic';
    return topicName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getMasteryColor = (level) => {
    if (level >= 80) return 'bg-green-500';
    if (level >= 60) return 'bg-blue-500';
    if (level >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getMasteryLabel = (level) => {
    if (level >= 80) return 'Expert';
    if (level >= 60) return 'Advanced';
    if (level >= 30) return 'Intermediate';
    return 'Beginner';
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'advancement':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        );
      case 'strengthen':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        );
      case 'complement':
        return (
          <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
        );
      case 'review':
        return (
          <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'trending':
        return (
          <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const formatTimeUntilReview = (nextReviewDate) => {
    if (!nextReviewDate) return 'No review scheduled';
    
    const now = new Date();
    const reviewDate = new Date(nextReviewDate);
    const diffMs = reviewDate - now;
    
    if (diffMs <= 0) return 'Due now';
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
      return 'Soon';
    }
  };

  const handleStartReview = (topicName) => {
    // Navigate to a review session for the specific topic
    // This could redirect to the main chat with a pre-filled review prompt
    const reviewPrompt = `I'd like to review ${formatTopicName(topicName)}. Can you help me practice and test my understanding of this topic?`;
    
    // Store the review prompt and navigate to the main chat
    localStorage.setItem('reviewPrompt', reviewPrompt);
    
    // Show success message
    alert(`Starting review session for ${formatTopicName(topicName)}! Redirecting to chat...`);
    
    // Navigate to the main page (you might want to use React Router here)
    window.location.href = '/';
  };

  const handleStartLearning = (topic, type = 'general') => {
    let learningPrompt = '';
    
    switch(type) {
      case 'advancement':
        learningPrompt = `I want to advance my knowledge in ${formatTopicName(topic)}. Can you teach me more advanced concepts?`;
        break;
      case 'strengthen':
        learningPrompt = `I need to strengthen my understanding of ${formatTopicName(topic)}. Can you help me with the fundamentals?`;
        break;
      case 'review':
        learningPrompt = `I'd like to review ${formatTopicName(topic)}. Can you help me practice what I've learned?`;
        break;
      default:
        learningPrompt = `I want to learn more about ${formatTopicName(topic)}. Can you help me get started?`;
    }
    
    localStorage.setItem('learningPrompt', learningPrompt);
    alert(`Starting learning session for ${formatTopicName(topic)}! Redirecting to chat...`);
    window.location.href = '/';
  };

  const ProgressBar = ({ value, max = 100, color = 'bg-blue-500', label, showValue = true }) => (
    <div className="w-full">
      {label && <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{label}</span>
        {showValue && <span>{Math.round(value)}%</span>}
      </div>}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div 
          className={`h-2 rounded-full ${color} transition-all duration-300`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );



  const LeaderboardCard = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900">🏆 Leaderboard</h3>
        <span className="text-sm text-gray-500">Total Points</span>
      </div>
      
      {leaderboardData?.currentUser && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-medium text-blue-900">Your Rank</span>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-blue-600">#{leaderboardData.currentUser.position}</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                leaderboardData.currentUser.tier === 'diamond' ? 'bg-purple-100 text-purple-800' :
                leaderboardData.currentUser.tier === 'platinum' ? 'bg-gray-100 text-gray-800' :
                leaderboardData.currentUser.tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                leaderboardData.currentUser.tier === 'silver' ? 'bg-gray-100 text-gray-600' :
                'bg-orange-100 text-orange-800'
              }`}>
                {leaderboardData.currentUser.tier}
              </span>
            </div>
          </div>
          <div className="text-sm text-blue-700">
            {leaderboardData.currentUser.total_points} points
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        {leaderboardData?.leaderboard?.slice(0, 5).map((entry, index) => (
          <div key={entry.userId} className="flex items-center justify-between py-2">
            <div className="flex items-center space-x-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                index === 0 ? 'bg-yellow-100 text-yellow-800' :
                index === 1 ? 'bg-gray-100 text-gray-600' :
                index === 2 ? 'bg-orange-100 text-orange-600' :
                'bg-gray-50 text-gray-500'
              }`}>
                {index + 1}
              </span>
              <span className="font-medium text-gray-900">{entry.name}</span>
            </div>
            <div className="text-right">
              <div className="font-medium text-gray-900">{entry.points}</div>
              <div className="text-xs text-gray-500">{entry.tier}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading || loadingProgress) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your learning progress...</p>
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
            onClick={loadProgressData}
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Learning Progress</h1>
          <p className="mt-2 text-lg text-gray-600">
            Track your learning journey with adaptive mastery and gamification
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            {['overview', 'topics', 'paths', 'achievements', 'leaderboard'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Gamification Cards Row */}
            <div className="grid grid-cols-1 gap-6">
              <LeaderboardCard />
            </div>

            {/* Progress Summary Cards */}
            {(progressData || enhancedProgress) && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-8 w-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Topics Explored
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900">
                            {enhancedProgress?.summary?.totalTopics || progressData?.summary?.total_topics || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Average Mastery
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900">
                            {Math.round(enhancedProgress?.summary?.averageMastery || progressData?.summary?.avg_mastery || 0)}%
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Due for Review
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900">
                            {enhancedProgress?.summary?.topicsDue || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            Expert Level
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900">
                            {enhancedProgress?.summary?.expertLevel || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* Adaptive Recommendations */}
            {adaptiveRecommendations.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">🧠 Adaptive Recommendations</h3>
                  <span className="text-sm text-gray-500">Powered by learning algorithms</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adaptiveRecommendations.slice(0, 4).map((rec, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                         onClick={() => handleStartLearning(rec.topic_name || rec.topic, rec.type)}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          {getRecommendationIcon(rec.type)}
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {rec.topic_name || rec.topic || 'Unknown Topic'}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {rec.reasoning}
                            </p>
                            <button className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium">
                              Click to start →
                            </button>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rec.type === 'review' ? 'bg-purple-100 text-purple-800' :
                          rec.type === 'strengthen' ? 'bg-yellow-100 text-yellow-800' :
                          rec.type === 'advancement' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {rec.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Topics Tab */}
        {activeTab === 'topics' && enhancedProgress && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Your Learning Topics</h3>
              <div className="text-sm text-gray-500">
                Using {enhancedProgress.algorithm_insights?.spaced_repetition} for optimization
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              {enhancedProgress.topics?.map((topic, index) => (
                <div key={index} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-lg font-medium text-gray-900">
                        {formatTopicName(topic.topic_name)}
                      </h4>
                      {topic.dueForReview && (
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                          Review Due
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">
                        Next review: {formatTimeUntilReview(topic.nextReviewDate)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <ProgressBar 
                        value={topic.mastery?.score || 0}
                        label="Current Mastery"
                        color={getMasteryColor(topic.mastery?.score || 0)}
                      />
                    </div>
                    <div>
                      <ProgressBar 
                        value={topic.currentRetention || 0}
                        label="Retention Level"
                        color="bg-purple-500"
                      />
                    </div>
                    <div>
                      <ProgressBar 
                        value={(topic.mastery?.confidence || 0) * 100}
                        label="Confidence"
                        color="bg-indigo-500"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Level</div>
                      <div className="font-medium capitalize">{topic.mastery?.level || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Reviews</div>
                      <div className="font-medium">{topic.review_count || 0}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Study Time</div>
                      <div className="font-medium">
                        {Math.round((topic.total_time_spent || 0) / 60)} min
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Interval</div>
                      <div className="font-medium">{topic.interval_days || 1} days</div>
                    </div>
                  </div>
                  
                  {topic.mastery?.components && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-600 mb-2">Mastery Breakdown:</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>Feedback: {topic.mastery.components.feedback}%</div>
                        <div>Quiz: {topic.mastery.components.quiz}%</div>
                        <div>Retention: {topic.mastery.components.retention}%</div>
                        <div>Engagement: {topic.mastery.components.engagement}%</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Learning Paths Tab */}
        {activeTab === 'paths' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">Recommended Learning Paths</h3>
            
            <div className="grid grid-cols-1 gap-6">
              {recommendations.map((rec, index) => (
                <div key={index} className="bg-white rounded-lg shadow p-6 border-l-4 border-primary-500">
                  <div className="flex items-start space-x-4">
                    {getRecommendationIcon(rec.type)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium text-gray-900">{formatTopicName(rec.topic)}</h4>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          rec.difficulty === 'advanced' ? 'bg-red-100 text-red-800' :
                          rec.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {rec.difficulty}
                        </span>
                      </div>
                      <p className="text-gray-600 mt-2">{rec.reason}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>Type: {rec.type}</span>
                          <span>Confidence: {Math.round(rec.confidence * 100)}%</span>
                        </div>
                        <button 
                          onClick={() => handleStartLearning(rec.topic, rec.type)}
                          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors"
                        >
                          Start Learning
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Achievements Tab */}
        {activeTab === 'achievements' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-900">Your Achievements</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {achievements.map((achievement, index) => (
                <div key={index} className="bg-white rounded-lg shadow p-6 text-center">
                  <div className="text-4xl mb-4">{achievement.icon}</div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">{achievement.name}</h4>
                  <p className="text-gray-600 text-sm">{achievement.description}</p>
                  <div className="mt-4 text-xs text-gray-500">
                    Earned: {new Date(achievement.earned_date).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && leaderboardData && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Global Leaderboard</h3>
              <div className="text-sm text-gray-500">
                Your rank: #{leaderboardData.currentUser?.position || 'Unranked'}
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">Learner</span>
                  <span className="font-medium text-gray-900">Points</span>
                </div>
              </div>
              
              <div className="divide-y divide-gray-200">
                {leaderboardData.leaderboard?.map((entry, index) => (
                  <div key={entry.userId} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-gray-100 text-gray-600' :
                        index === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-gray-50 text-gray-500'
                      }`}>
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-gray-900">{entry.name}</div>
                        <div className="text-sm text-gray-500 flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            entry.tier === 'diamond' ? 'bg-purple-100 text-purple-800' :
                            entry.tier === 'platinum' ? 'bg-gray-100 text-gray-800' :
                            entry.tier === 'gold' ? 'bg-yellow-100 text-yellow-800' :
                            entry.tier === 'silver' ? 'bg-gray-100 text-gray-600' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {entry.tier}
                          </span>
                          <span>{entry.achievements} achievements</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{entry.points.toLocaleString()}</div>
                      <div className="text-sm text-gray-500">points</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }

export default ProgressDashboard; 