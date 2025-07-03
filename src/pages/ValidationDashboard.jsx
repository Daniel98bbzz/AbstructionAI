import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAllTestIds, getTestSummary } from '../data/validationTestsData';

const ValidationDashboard = () => {
  const { user } = useAuth();
  const [validationResults, setValidationResults] = useState({});
  const [loading, setLoading] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [summaryData, setSummaryData] = useState(null);

  // Get available validation components from data
  const validationComponents = getAllTestIds().map(testId => getTestSummary(testId));

  // Load validation results on component mount
  useEffect(() => {
    fetchValidationSummary();
  }, []);

  // Fetch validation summary
  const fetchValidationSummary = async () => {
    try {
      const response = await fetch('/api/validation/results');
      const data = await response.json();
      
      if (data.success) {
        setSummaryData(data.summary);
        // Convert results array to object for easier lookup
        const resultsMap = {};
        data.results.forEach(result => {
          resultsMap[result.component] = result;
        });
        setValidationResults(resultsMap);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching validation summary:', error);
    }
  };

  // Run all validation tests
  const runAllTests = async () => {
    const allComponentIds = validationComponents.map(c => c.id);
    
    // Set loading for all components
    const loadingState = {};
    allComponentIds.forEach(id => loadingState[id] = true);
    setLoading(loadingState);
    
    // Run all tests in parallel
    const promises = allComponentIds.map(async (componentId) => {
      try {
        const response = await fetch(`/api/validation/${componentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const result = await response.json();
        return { componentId, result };
      } catch (error) {
        return {
          componentId,
          result: {
            success: false,
            error: error.message,
            log: `Failed to run ${componentId} validation: ${error.message}`
          }
        };
      }
    });
    
    const results = await Promise.all(promises);
    
    // Update results
    const newResults = {};
    results.forEach(({ componentId, result }) => {
      newResults[componentId] = result;
    });
    setValidationResults(newResults);
    
    // Clear loading states
    setLoading({});
    
    // Refresh summary
    fetchValidationSummary();
  };

  // Get status badge color
  const getStatusColor = (success) => {
    if (success === true) return 'bg-green-100 text-green-800';
    if (success === false) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  // Get status text
  const getStatusText = (success) => {
    if (success === true) return 'PASS';
    if (success === false) return 'FAIL';
    return 'UNKNOWN';
  };

  // Get component color classes
  const getColorClasses = (color) => {
    const colors = {
      blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
      purple: 'border-purple-200 bg-purple-50 hover:bg-purple-100',
      green: 'border-green-200 bg-green-50 hover:bg-green-100',
      orange: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
      pink: 'border-pink-200 bg-pink-50 hover:bg-pink-100',
      indigo: 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100',
      teal: 'border-teal-200 bg-teal-50 hover:bg-teal-100'
    };
    return colors[color] || 'border-gray-200 bg-gray-50 hover:bg-gray-100';
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600">Please log in to access the validation dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 System Validation Dashboard</h1>
        <p className="text-gray-600">
          Comprehensive real-time testing of all AI educational platform components. Click on any test to view detailed information.
        </p>
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                📋
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Tests</p>
                <p className="text-2xl font-bold text-gray-900">{summaryData.total_tests}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600">
                ✅
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Passed</p>
                <p className="text-2xl font-bold text-green-600">{summaryData.passed}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-red-100 text-red-600">
                ❌
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{summaryData.failed}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                🕒
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Last Updated</p>
                <p className="text-sm font-bold text-gray-900">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-4 mb-8">
        <button
          onClick={runAllTests}
          disabled={Object.values(loading).some(l => l)}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 transition-colors"
        >
          <span>🚀</span>
          <span>{Object.values(loading).some(l => l) ? 'Running Tests...' : 'Run All Tests'}</span>
        </button>
        
        <button
          onClick={fetchValidationSummary}
          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 transition-colors"
        >
          <span>🔄</span>
          <span>Refresh Results</span>
        </button>
      </div>

      {/* Validation Test Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {validationComponents.map((component) => {
          const result = validationResults[component.id];
          const isLoading = loading[component.id];
          
          return (
            <Link
              key={component.id}
              to={`/validation/${component.id}`}
              className={`block bg-white rounded-lg shadow-md border-2 ${getColorClasses(component.color)} overflow-hidden transition-all duration-200 hover:shadow-lg transform hover:-translate-y-1`}
            >
              {/* Card Header */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-3xl">{component.icon}</span>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{component.title}</h3>
                    </div>
                  </div>
                  
                  {result && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(result.success)}`}>
                      {getStatusText(result.success)}
                    </span>
                  )}
                </div>
                
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {component.description}
                </p>
                
                {/* Quick Metrics Preview */}
                {result && result.metrics && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(result.metrics)
                        .filter(([key, value]) => 
                          // Only show simple metrics in the preview, skip complex objects/arrays
                          typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
                        )
                        .slice(0, 2).map(([key, value]) => (
                        <div key={key} className="text-center">
                          <div className="text-xs text-gray-500 mb-1">
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </div>
                          <div className="font-bold text-gray-900">
                            {typeof value === 'number' ? value.toFixed(2) : 
                             typeof value === 'boolean' ? (value ? '✅' : '❌') : 
                             value.toString().substring(0, 20) + (value.toString().length > 20 ? '...' : '')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Loading State */}
                {isLoading && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-center py-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-sm text-gray-600">Testing...</span>
                    </div>
                  </div>
                )}
                
                {/* Call to Action */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Click for details</span>
                    <span className="text-blue-600">→</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>🔬 Validation Dashboard - Real-time system health monitoring</p>
        <p>Click on any test card to view detailed information, methodology, and results</p>
      </div>
    </div>
  );
};

export default ValidationDashboard; 