import React, { useState, useEffect } from 'react';
import RecommendationCard from './RecommendationCard';
import { 
  getTemplateRecommendations, 
  getUserRecommendationInsights,
  getCustomWeightedRecommendations,
  groupRecommendationsByTopic 
} from '../api/recommendations';

/**
 * Comprehensive recommendations dashboard
 */
const RecommendationsDashboard = ({ 
  userId, 
  onTemplateSelected,
  showInsights = true,
  showFilters = true,
  defaultTopic = null 
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter and display options
  const [selectedTopic, setSelectedTopic] = useState(defaultTopic);
  const [maxRecommendations, setMaxRecommendations] = useState(6);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid', 'list', 'compact'
  const [groupByTopic, setGroupByTopic] = useState(false);
  
  // Custom weights (for advanced users)
  const [showCustomWeights, setShowCustomWeights] = useState(false);
  const [customWeights, setCustomWeights] = useState({
    clusterPopularity: 0.4,
    topicRelevance: 0.35,
    sentimentWeight: 0.25
  });
  
  const [availableTopics, setAvailableTopics] = useState([]);
  
  // Load data on component mount and when filters change
  useEffect(() => {
    loadRecommendations();
    if (showInsights) {
      loadInsights();
    }
  }, [userId, selectedTopic, maxRecommendations, showScoreBreakdown]);
  
  // Load recommendations
  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const options = {
        topic: selectedTopic,
        maxRecommendations,
        includeScoreBreakdown: showScoreBreakdown
      };
      
      const response = await getTemplateRecommendations(userId, options);
      
      if (response.success) {
        setRecommendations(response.recommendations || []);
        
        // Extract unique topics for filter dropdown
        const topics = [...new Set(response.recommendations.map(r => r.topic))];
        setAvailableTopics(topics.sort());
      } else {
        setError('Failed to load recommendations');
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      setError('Error loading recommendations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Load user insights
  const loadInsights = async () => {
    try {
      const response = await getUserRecommendationInsights(userId);
      if (response.success) {
        setInsights(response);
      }
    } catch (err) {
      console.error('Error loading insights:', err);
    }
  };
  
  // Apply custom weights
  const applyCustomWeights = async () => {
    try {
      setLoading(true);
      
      const requestData = {
        topic: selectedTopic,
        max_recommendations: maxRecommendations,
        include_score_breakdown: showScoreBreakdown,
        weights: customWeights
      };
      
      const response = await getCustomWeightedRecommendations(userId, requestData);
      
      if (response.success) {
        setRecommendations(response.recommendations || []);
      }
    } catch (err) {
      console.error('Error applying custom weights:', err);
      setError('Error applying custom weights: ' + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle template selection
  const handleTemplateSelected = (recommendation) => {
    if (onTemplateSelected) {
      onTemplateSelected(recommendation);
    }
  };
  
  // Weight adjustment helper
  const adjustWeight = (weightName, value) => {
    const newWeights = { ...customWeights, [weightName]: value };
    
    // Ensure weights sum to 1.0
    const total = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      Object.keys(newWeights).forEach(key => {
        newWeights[key] = newWeights[key] / total;
      });
    }
    
    setCustomWeights(newWeights);
  };
  
  // Render insights section
  const renderInsights = () => {
    if (!showInsights || !insights) return null;
    
    return (
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Recommendation Profile</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cluster Info */}
          <div className="bg-white p-3 rounded-md">
            <h4 className="font-medium text-gray-700 mb-2">Learning Cluster</h4>
            {insights.cluster_info ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Similarity:</span> <span className="font-medium">{Math.round(insights.cluster_info.similarity * 100)}%</span></p>
                <p><span className="text-gray-500">Cluster Size:</span> <span className="font-medium">{insights.cluster_info.member_count} users</span></p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No cluster assigned yet</p>
            )}
          </div>
          
          {/* Active Topics */}
          <div className="bg-white p-3 rounded-md">
            <h4 className="font-medium text-gray-700 mb-2">Your Topics</h4>
            {insights.active_topics && insights.active_topics.length > 0 ? (
              <div className="space-y-1 text-sm">
                {insights.active_topics.slice(0, 3).map((topic, index) => (
                  <p key={index}>
                    <span className="text-gray-600">{topic.topic.replace(/_/g, ' ')}</span>
                    <span className="ml-2 text-xs bg-gray-100 px-1 rounded">{topic.count}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No topic history yet</p>
            )}
          </div>
          
          {/* Sentiment */}
          <div className="bg-white p-3 rounded-md">
            <h4 className="font-medium text-gray-700 mb-2">Satisfaction</h4>
            {insights.sentiment_stats ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Trend:</span> <span className="font-medium capitalize">{insights.insights.sentiment_trend}</span></p>
                <p><span className="text-gray-500">Feedback:</span> <span className="font-medium">{insights.sentiment_stats.total} responses</span></p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No feedback yet</p>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Render filters section
  const renderFilters = () => {
    if (!showFilters) return null;
    
    return (
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-wrap items-center gap-4">
          {/* Topic Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
            <select
              value={selectedTopic || ''}
              onChange={(e) => setSelectedTopic(e.target.value || null)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="">All Topics</option>
              {availableTopics.map(topic => (
                <option key={topic} value={topic}>
                  {topic.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          
          {/* Max Results */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Results</label>
            <select
              value={maxRecommendations}
              onChange={(e) => setMaxRecommendations(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value={3}>3</option>
              <option value={6}>6</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
          </div>
          
          {/* View Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm"
            >
              <option value="grid">Grid</option>
              <option value="list">List</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          
          {/* Toggle Options */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={showScoreBreakdown}
                onChange={(e) => setShowScoreBreakdown(e.target.checked)}
                className="mr-2"
              />
              Show Score Details
            </label>
            
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={groupByTopic}
                onChange={(e) => setGroupByTopic(e.target.checked)}
                className="mr-2"
              />
              Group by Topic
            </label>
          </div>
          
          {/* Custom Weights Toggle */}
          <div>
            <button
              onClick={() => setShowCustomWeights(!showCustomWeights)}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
            >
              {showCustomWeights ? 'Hide' : 'Show'} Custom Weights
            </button>
          </div>
        </div>
        
        {/* Custom Weights Section */}
        {showCustomWeights && (
          <div className="mt-4 p-3 bg-white rounded-md border">
            <h4 className="font-medium text-gray-700 mb-3">Custom Recommendation Weights</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(customWeights).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm text-gray-600 mb-1">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} ({Math.round(value * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={value}
                    onChange={(e) => adjustWeight(key, parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={applyCustomWeights}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Apply Custom Weights
            </button>
          </div>
        )}
      </div>
    );
  };
  
  // Render recommendations
  const renderRecommendations = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading recommendations...</span>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={loadRecommendations}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      );
    }
    
    if (recommendations.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">No recommendations found.</p>
          <p className="text-sm text-gray-500">Try adjusting your filters or use the system more to get personalized recommendations.</p>
        </div>
      );
    }
    
    // Group by topic if enabled
    if (groupByTopic) {
      const grouped = groupRecommendationsByTopic(recommendations);
      return (
        <div className="space-y-6">
          {Object.entries(grouped).map(([topic, recs]) => (
            <div key={topic}>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 capitalize">
                {topic.replace(/_/g, ' ')}
              </h3>
              <div className={`grid gap-4 ${getGridCols()}`}>
                {recs.map((rec, index) => (
                  <RecommendationCard
                    key={rec.id || index}
                    recommendation={rec}
                    onApplyTemplate={handleTemplateSelected}
                    showScoreBreakdown={showScoreBreakdown}
                    compact={viewMode === 'compact'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    
    // Regular grid/list view
    return (
      <div className={`${viewMode === 'list' ? 'space-y-4' : `grid gap-4 ${getGridCols()}`}`}>
        {recommendations.map((rec, index) => (
          <RecommendationCard
            key={rec.id || index}
            recommendation={rec}
            onApplyTemplate={handleTemplateSelected}
            showScoreBreakdown={showScoreBreakdown}
            compact={viewMode === 'compact'}
          />
        ))}
      </div>
    );
  };
  
  const getGridCols = () => {
    switch (viewMode) {
      case 'compact':
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      case 'list':
        return 'grid-cols-1';
      default:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Template Recommendations</h2>
        <p className="text-gray-600">
          Personalized suggestions based on your learning patterns and similar users
        </p>
      </div>
      
      {/* Insights */}
      {renderInsights()}
      
      {/* Filters */}
      {renderFilters()}
      
      {/* Recommendations */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {selectedTopic ? `${selectedTopic.replace(/_/g, ' ')} Templates` : 'Recommended Templates'}
          </h3>
          <div className="text-sm text-gray-500">
            {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
          </div>
        </div>
        
        {renderRecommendations()}
      </div>
    </div>
  );
};

export default RecommendationsDashboard; 