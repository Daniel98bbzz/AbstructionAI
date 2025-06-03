import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import RecommendationCard from './RecommendationCard';
import { getTemplateRecommendations } from '../api/recommendations';

/**
 * Compact recommendations widget for embedding in other pages
 */
const RecommendationsWidget = ({ 
  userId, 
  maxRecommendations = 3,
  topic = null,
  onTemplateSelected,
  showHeader = true,
  className = ""
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (userId) {
      loadRecommendations();
    }
  }, [userId, topic, maxRecommendations]);
  
  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const options = {
        topic,
        maxRecommendations,
        includeScoreBreakdown: false
      };
      
      const response = await getTemplateRecommendations(userId, options);
      
      if (response.success) {
        setRecommendations(response.recommendations || []);
      } else {
        setError('Failed to load recommendations');
      }
    } catch (err) {
      console.error('Error loading recommendations:', err);
      setError('Error loading recommendations');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTemplateSelected = (recommendation) => {
    if (onTemplateSelected) {
      onTemplateSelected(recommendation);
    }
  };
  
  if (!userId) {
    return null;
  }
  
  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {topic ? `${topic.replace(/_/g, ' ')} Recommendations` : 'Recommended Templates'}
              </h3>
              <p className="text-sm text-gray-600">
                Personalized suggestions for you
              </p>
            </div>
            <Link
              to="/recommendations"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View All →
            </Link>
          </div>
        </div>
      )}
      
      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 text-sm">Loading...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600 text-sm mb-2">{error}</p>
            <button
              onClick={loadRecommendations}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Retry
            </button>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 text-sm mb-2">No recommendations available</p>
            <p className="text-xs text-gray-500">
              Use the system more to get personalized suggestions
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <RecommendationCard
                key={rec.id || index}
                recommendation={rec}
                onApplyTemplate={handleTemplateSelected}
                compact={true}
                showScoreBreakdown={false}
              />
            ))}
            
            {recommendations.length >= maxRecommendations && (
              <div className="pt-2 border-t">
                <Link
                  to="/recommendations"
                  className="block text-center text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View More Recommendations
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendationsWidget; 