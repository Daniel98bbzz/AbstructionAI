import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import RecommendationsDashboard from '../components/RecommendationsDashboard';

/**
 * Dedicated page for template recommendations
 */
const Recommendations = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  
  // Get user ID from your authentication system
  useEffect(() => {
    // TODO: Replace with your actual user authentication logic
    const getCurrentUserId = () => {
      // Check localStorage, context, or your auth provider
      return localStorage.getItem('userId') || 'demo-user-id';
    };
    
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      // Redirect to login if no user
      navigate('/login');
      return;
    }
    
    setUserId(currentUserId);
  }, [navigate]);
  
  const handleTemplateSelected = (recommendation) => {
    console.log('Template selected:', recommendation);
    
    // Option 1: Navigate to query page with pre-filled template
    const templateData = {
      topic: recommendation.topic,
      templateId: recommendation.id,
      suggestedApproach: recommendation.recommendationReason
    };
    
    // Store in localStorage for the query page to pick up
    localStorage.setItem('selectedTemplate', JSON.stringify(templateData));
    
    // Navigate to query page
    navigate('/query', { 
      state: { 
        selectedTemplate: templateData,
        fromRecommendations: true 
      } 
    });
    
    // Option 2: Show a modal with template details
    // setSelectedTemplate(recommendation);
    // setShowTemplateModal(true);
  };
  
  if (!userId) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading user data...</span>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <RecommendationsDashboard
        userId={userId}
        onTemplateSelected={handleTemplateSelected}
        showInsights={true}
        showFilters={true}
      />
    </div>
  );
};

export default Recommendations; 