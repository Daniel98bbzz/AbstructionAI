import React, { useState } from 'react';
import { formatRecommendationScore, getRecommendationQuality } from '../api/recommendations';

/**
 * Individual recommendation card component
 */
const RecommendationCard = ({ 
  recommendation, 
  onApplyTemplate, 
  onViewDetails,
  showScoreBreakdown = false,
  compact = false 
}) => {
  const [showDetails, setShowDetails] = useState(false);
  
  const quality = getRecommendationQuality(recommendation.finalScore);
  const scorePercentage = formatRecommendationScore(recommendation.finalScore);
  
  const handleApplyTemplate = () => {
    if (onApplyTemplate) {
      onApplyTemplate(recommendation);
    }
  };
  
  const handleViewDetails = () => {
    setShowDetails(!showDetails);
    if (onViewDetails) {
      onViewDetails(recommendation);
    }
  };
  
  const formatTopic = (topic) => {
    return topic.replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  return (
    <div className={`border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold text-gray-900 ${compact ? 'text-sm' : 'text-base'}`}>
              {formatTopic(recommendation.topic)}
            </h3>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${quality.bgColor} ${quality.textColor}`}>
              {quality.label}
            </span>
          </div>
          <p className={`text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
            {recommendation.recommendationReason}
          </p>
        </div>
        
        <div className="flex flex-col items-end ml-3">
          <div className={`font-bold text-right ${compact ? 'text-sm' : 'text-lg'}`} style={{ color: quality.color }}>
            {scorePercentage}
          </div>
          <div className={`text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>
            Match Score
          </div>
        </div>
      </div>
      
      {/* Template Info */}
      {!compact && (
        <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            <span className="text-gray-500">Efficacy:</span>
            <span className="ml-1 font-medium">
              {recommendation.efficacy_score ? `${recommendation.efficacy_score.toFixed(1)}/5` : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Usage:</span>
            <span className="ml-1 font-medium">
              {recommendation.usage_count || 0} times
            </span>
          </div>
        </div>
      )}
      
      {/* Score Breakdown (if enabled) */}
      {showScoreBreakdown && recommendation.scoreBreakdown && !compact && (
        <div className="mb-3 p-3 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Score Breakdown</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Cluster Popularity:</span>
              <span className="font-medium">{formatRecommendationScore(recommendation.scoreBreakdown.clusterPopularity)}</span>
            </div>
            <div className="flex justify-between">
              <span>Topic Relevance:</span>
              <span className="font-medium">{formatRecommendationScore(recommendation.scoreBreakdown.topicRelevance)}</span>
            </div>
            <div className="flex justify-between">
              <span>Sentiment Weight:</span>
              <span className="font-medium">{formatRecommendationScore(recommendation.scoreBreakdown.sentimentWeight)}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Additional Details (expandable) */}
      {showDetails && !compact && (
        <div className="mb-3 p-3 bg-blue-50 rounded-md">
          <h4 className="text-sm font-medium text-blue-700 mb-2">Template Details</h4>
          <div className="text-sm text-blue-600">
            <p><strong>ID:</strong> {recommendation.id}</p>
            {recommendation.template_text && (
              <p><strong>Pattern:</strong> {typeof recommendation.template_text === 'string' 
                ? recommendation.template_text.substring(0, 100) + '...' 
                : 'Structured template'}</p>
            )}
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className={`flex gap-2 ${compact ? 'justify-end' : 'justify-between'}`}>
        {!compact && (
          <button
            onClick={handleViewDetails}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
          >
            {showDetails ? 'Hide Details' : 'View Details'}
          </button>
        )}
        
        <button
          onClick={handleApplyTemplate}
          className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium ${compact ? 'text-sm' : ''}`}
        >
          Use Template
        </button>
      </div>
    </div>
  );
};

export default RecommendationCard; 