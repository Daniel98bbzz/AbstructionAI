import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../contexts/QueryContext';

function ProgressDashboard() {
  const { 
    getUserProgress, 
    getLearningPathRecommendations, 
    getUserAchievements,
    loading 
  } = useQuery();
  
  const [progressData, setProgressData] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, topics, paths, achievements

  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    try {
      setLoadingProgress(true);
      setError(null);
      
      // Load all progress data in parallel
      const [progressResult, recommendationsResult, achievementsResult] = await Promise.all([
        getUserProgress(),
        getLearningPathRecommendations(),
        getUserAchievements()
      ]);
      
      if (progressResult.success) {
        setProgressData(progressResult);
      }
      
      if (recommendationsResult.success) {
        setRecommendations(recommendationsResult.recommendations || []);
      }
      
      if (achievementsResult.success) {
        setAchievements(achievementsResult.achievements || []);
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
            Track your learning journey and discover your next steps
          </p>
        </div>

        {/* Progress Summary Cards with Cluster Insights */}
        {progressData && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                        {progressData.summary.total_topics}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            
            {/* New: Cluster Performance Card */}
            {progressData.cluster_insights && (
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Learning Cluster
                        </dt>
                        <dd className="text-lg font-bold text-gray-900">
                          {progressData.cluster_insights.clusterSize} learners
                        </dd>
                        <dd className="text-xs text-gray-500">
                          {Math.round(progressData.cluster_performance?.avgClusterPercentile || 0)}% avg performance
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                        {Math.round(progressData.summary.avg_mastery)}%
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
                    <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Learning Sessions
                      </dt>
                      <dd className="text-2xl font-bold text-gray-900">
                        {progressData.summary.total_sessions}
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
                        Achievements
                      </dt>
                      <dd className="text-2xl font-bold text-gray-900">
                        {achievements.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', icon: '📊' },
              { id: 'topics', name: 'Topic Progress', icon: '📚' },
              { id: 'cluster', name: 'Cluster Insights', icon: '👥' },
              { id: 'paths', name: 'Learning Paths', icon: '🗺️' },
              { id: 'achievements', name: 'Achievements', icon: '🏆' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && progressData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Topics */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium text-gray-900">Your Top Topics</h3>
                <p className="mt-1 text-sm text-gray-500">Topics with highest mastery levels</p>
              </div>
              <div className="border-t border-gray-200">
                {progressData.progress.slice(0, 5).map((topic, index) => (
                  <div key={index} className="px-4 py-4 border-b border-gray-200 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {formatTopicName(topic.topic_name)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {topic.session_count} sessions • {getMasteryLabel(topic.mastery_level)}
                        </p>
                      </div>
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-3">
                          <div 
                            className={`h-2 rounded-full ${getMasteryColor(topic.mastery_level)}`}
                            style={{ width: `${topic.mastery_level}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {topic.mastery_level}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Recommendations */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium text-gray-900">Recommended Next Steps</h3>
                <p className="mt-1 text-sm text-gray-500">Personalized learning suggestions</p>
              </div>
              <div className="border-t border-gray-200">
                {recommendations.slice(0, 5).map((rec, index) => (
                  <div key={index} className="px-4 py-4 border-b border-gray-200 last:border-b-0">
                    <Link to={`/query?topic=${rec.topic}`} className="block hover:bg-gray-50 p-2 rounded">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 mr-3">
                          {getRecommendationIcon(rec.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {formatTopicName(rec.topic)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {rec.reason}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'topics' && progressData && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">All Topic Progress</h3>
              <p className="mt-1 text-sm text-gray-500">Detailed breakdown of your learning in each topic</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {progressData.progress.map((topic, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        {formatTopicName(topic.topic_name)}
                      </h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        topic.difficulty_progression === 'expert' ? 'bg-green-100 text-green-800' :
                        topic.difficulty_progression === 'advanced' ? 'bg-blue-100 text-blue-800' :
                        topic.difficulty_progression === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {topic.difficulty_progression}
                      </span>
                    </div>
                    
                    <div className="mb-3">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Mastery Level</span>
                        <span>{topic.mastery_level}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${getMasteryColor(topic.mastery_level)}`}
                          style={{ width: `${topic.mastery_level}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-xs text-gray-500">
                      <p>📖 {topic.session_count} sessions</p>
                      <p>⏱️ {topic.learning_hours.toFixed(1)} hours</p>
                      {topic.quiz_scores.length > 0 && (
                        <p>🧠 {topic.avg_quiz_score}% avg quiz score</p>
                      )}
                      {/* New: Cluster comparison data */}
                      {topic.cluster_comparison && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            topic.cluster_comparison.performance_vs_cluster === 'above_average' ? 'bg-green-100 text-green-800' :
                            topic.cluster_comparison.performance_vs_cluster === 'average' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            🎯 {topic.cluster_comparison.cluster_percentile}% vs cluster
                          </div>
                          <p className="mt-1">
                            👥 {topic.cluster_comparison.cluster_topic_users} peers learning this
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cluster' && progressData && progressData.cluster_insights && (
          <div className="space-y-6">
            {/* Cluster Overview */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium text-gray-900">Your Learning Cluster</h3>
                <p className="mt-1 text-sm text-gray-500">You're grouped with learners who have similar preferences and learning styles</p>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{progressData.cluster_insights.clusterSize}</div>
                    <div className="text-sm text-gray-500">Total Learners</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{progressData.cluster_insights.totalTopicsInCluster}</div>
                    <div className="text-sm text-gray-500">Topics Explored</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{progressData.cluster_insights.avgTopicsPerUser}</div>
                    <div className="text-sm text-gray-500">Avg Topics/User</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance vs Cluster */}
            {progressData.cluster_performance && (
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg font-medium text-gray-900">Your Performance vs Cluster</h3>
                  <p className="mt-1 text-sm text-gray-500">How you compare to other learners in your cluster</p>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{progressData.cluster_performance.strongerThanCluster}</div>
                      <div className="text-sm text-gray-500">Topics Above Average</div>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          🚀 Outperforming
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{progressData.cluster_performance.averageInCluster}</div>
                      <div className="text-sm text-gray-500">Topics At Average</div>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          📊 On Track
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">{progressData.cluster_performance.weakerThanCluster}</div>
                      <div className="text-sm text-gray-500">Topics Below Average</div>
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          📈 Growth Area
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Overall Performance Indicator */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Overall Cluster Performance</span>
                      <span className="text-sm font-bold text-gray-900">
                        {Math.round(progressData.cluster_performance.avgClusterPercentile)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          progressData.cluster_performance.avgClusterPercentile >= 80 ? 'bg-green-500' :
                          progressData.cluster_performance.avgClusterPercentile >= 60 ? 'bg-blue-500' :
                          progressData.cluster_performance.avgClusterPercentile >= 40 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${progressData.cluster_performance.avgClusterPercentile}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      You're performing at the {Math.round(progressData.cluster_performance.avgClusterPercentile)}% percentile within your learning cluster
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Topics with Cluster Comparisons */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg font-medium text-gray-900">Topic-Specific Cluster Comparisons</h3>
                <p className="mt-1 text-sm text-gray-500">Detailed breakdown of how you compare in each topic</p>
              </div>
              <div className="border-t border-gray-200">
                <div className="divide-y divide-gray-200">
                  {progressData.progress
                    .filter(topic => topic.cluster_comparison)
                    .sort((a, b) => b.cluster_comparison.cluster_percentile - a.cluster_comparison.cluster_percentile)
                    .map((topic, index) => (
                    <div key={index} className="px-4 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-gray-900">
                            {formatTopicName(topic.topic_name)}
                          </h4>
                          <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                            <span>📖 You: {topic.session_count} sessions</span>
                            <span>👥 Cluster avg: {topic.cluster_comparison.cluster_avg_sessions} sessions</span>
                            <span>🎯 {topic.cluster_comparison.cluster_topic_users} peers learning this</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                            topic.cluster_comparison.performance_vs_cluster === 'above_average' ? 'bg-green-100 text-green-800' :
                            topic.cluster_comparison.performance_vs_cluster === 'average' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {topic.cluster_comparison.cluster_percentile}% percentile
                          </div>
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                topic.cluster_comparison.performance_vs_cluster === 'above_average' ? 'bg-green-500' :
                                topic.cluster_comparison.performance_vs_cluster === 'average' ? 'bg-blue-500' :
                                'bg-yellow-500'
                              }`}
                              style={{ width: `${topic.cluster_comparison.cluster_percentile}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'paths' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Learning Path Recommendations</h3>
              <p className="mt-1 text-sm text-gray-500">Personalized suggestions for your learning journey</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                {recommendations.map((rec, index) => (
                  <Link 
                    key={index} 
                    to={`/query?topic=${rec.topic}`}
                    className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-primary-300 transition-all"
                  >
                    <div className="flex items-start">
                      <div className="flex-shrink-0 mr-3 mt-1">
                        {getRecommendationIcon(rec.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">
                          {formatTopicName(rec.topic)}
                        </h4>
                        <p className="text-xs text-gray-600 mb-2">
                          {rec.reason}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            rec.type === 'advancement' ? 'bg-green-100 text-green-800' :
                            rec.type === 'strengthen' ? 'bg-yellow-100 text-yellow-800' :
                            rec.type === 'complement' ? 'bg-blue-100 text-blue-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {rec.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {Math.round(rec.confidence * 100)}% match
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Your Achievements</h3>
              <p className="mt-1 text-sm text-gray-500">Milestones you've unlocked on your learning journey</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {achievements.map((achievement, index) => (
                  <div 
                    key={index} 
                    className="border border-gray-200 rounded-lg p-4 text-center hover:shadow-md transition-shadow bg-gradient-to-br from-yellow-50 to-orange-50"
                  >
                    <div className="text-3xl mb-2">{achievement.icon}</div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      {achievement.name}
                    </h4>
                    <p className="text-xs text-gray-600 mb-2">
                      {achievement.description}
                    </p>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Earned
                    </span>
                  </div>
                ))}
                
                {achievements.length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <p>No achievements yet! Keep learning to unlock your first milestone.</p>
                    <Link to="/query" className="text-primary-600 hover:text-primary-500 text-sm">
                      Start learning
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        <div className="mt-6 text-center">
          <button
            onClick={loadProgressData}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Progress
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProgressDashboard; 