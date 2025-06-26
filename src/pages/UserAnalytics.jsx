import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import AnalyticsDashboard from '../components/AnalyticsDashboard.jsx';

const UserAnalytics = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600">Please log in to view your personal analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-full bg-blue-100">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Your Learning Analytics
                </h1>
                <p className="text-gray-600">
                  Track your learning progress, favorite topics, and engagement patterns
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Personal Learning Insights */}
        <div className="mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 Personal Insights</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4">
                <div className="flex items-center">
                  <span className="text-2xl mr-3">🎯</span>
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Learning Focus</p>
                    <p className="text-lg font-bold text-blue-800">Personalized for You</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4">
                <div className="flex items-center">
                  <span className="text-2xl mr-3">📈</span>
                  <div>
                    <p className="text-sm text-green-600 font-medium">Progress Tracking</p>
                    <p className="text-lg font-bold text-green-800">Real-time Updates</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4">
                <div className="flex items-center">
                  <span className="text-2xl mr-3">🔍</span>
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Deep Insights</p>
                    <p className="text-lg font-bold text-purple-800">Your Learning Pattern</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Dashboard - User-specific */}
        <AnalyticsDashboard 
          userId={user.id} 
          isUserSpecific={true}
        />
      </div>
    </div>
  );
};

export default UserAnalytics; 