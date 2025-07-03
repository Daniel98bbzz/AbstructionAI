import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getValidationTestById, getTestIcon, getTestColor } from '../data/validationTestsData';

const ValidationTestDetail = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [testData, setTestData] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    // Get test data from mock data
    const data = getValidationTestById(testId);
    if (!data) {
      navigate('/validation');
      return;
    }
    setTestData(data);
    
    // Try to fetch real validation results if available
    fetchValidationResult();
  }, [testId, navigate]);

  const fetchValidationResult = async () => {
    try {
      const response = await fetch(`/api/validation/${testId}`);
      if (response.ok) {
        const result = await response.json();
        setValidationResult(result);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching validation result:', error);
    }
  };

  const runValidationTest = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/validation/${testId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      setValidationResult(result);
      setLastUpdated(new Date());
    } catch (error) {
      console.error(`Error running ${testId} validation:`, error);
      setValidationResult({
        success: false,
        error: error.message,
        log: `Failed to run ${testId} validation: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const getColorClasses = (color) => {
    const colors = {
      blue: 'border-blue-200 bg-blue-50 text-blue-700',
      purple: 'border-purple-200 bg-purple-50 text-purple-700',
      green: 'border-green-200 bg-green-50 text-green-700',
      orange: 'border-orange-200 bg-orange-50 text-orange-700',
      pink: 'border-pink-200 bg-pink-50 text-pink-700',
      indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      teal: 'border-teal-200 bg-teal-50 text-teal-700'
    };
    return colors[color] || 'border-gray-200 bg-gray-50 text-gray-700';
  };

  const getBorderColor = (color) => {
    const colors = {
      blue: 'border-blue-300',
      purple: 'border-purple-300',
      green: 'border-green-300',
      orange: 'border-orange-300',
      pink: 'border-pink-300',
      indigo: 'border-indigo-300',
      teal: 'border-teal-300'
    };
    return colors[color] || 'border-gray-300';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'good':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600">Please log in to access validation details.</p>
        </div>
      </div>
    );
  }

  if (!testData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Test Not Found</h2>
          <p className="text-gray-600 mb-4">The validation test "{testId}" could not be found.</p>
          <Link to="/validation" className="text-blue-600 hover:text-blue-800">
            ← Back to Validation Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const testIcon = getTestIcon(testId);
  const testColor = getTestColor(testId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <Link 
            to="/validation" 
            className="text-blue-600 hover:text-blue-800 mr-4 flex items-center"
          >
            ← Back to Dashboard
          </Link>
        </div>
        
        <div className={`flex items-center space-x-4 p-6 rounded-lg border-2 ${getBorderColor(testColor)} bg-white`}>
          <span className="text-4xl">{testIcon}</span>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{testData.title}</h1>
            <p className="text-gray-600 mt-2">{testData.purpose.split('.')[0]}.</p>
          </div>
          
          <div className="flex items-center space-x-3">
            {validationResult && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                validationResult.success 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {validationResult.success ? 'PASS' : 'FAIL'}
              </span>
            )}
            
            <button
              onClick={runValidationTest}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2 transition-colors"
            >
              <span>{loading ? '⏳' : '🔍'}</span>
              <span>{loading ? 'Running Test...' : 'Run Test'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Purpose Section */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-blue-600 mr-2">🎯</span>
              Purpose
            </h2>
            <p className="text-gray-700 leading-relaxed">{testData.purpose}</p>
          </div>

          {/* Validation Method */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-green-600 mr-2">🔬</span>
              Validation Method
            </h2>
            <p className="text-gray-700 leading-relaxed">{testData.method}</p>
          </div>

          {/* Importance */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-orange-600 mr-2">⚡</span>
              Importance
            </h2>
            <p className="text-gray-700 leading-relaxed">{testData.importance}</p>
          </div>

          {/* Live Results */}
          {validationResult && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="text-purple-600 mr-2">📊</span>
                Live Test Results
                {lastUpdated && (
                  <span className="text-sm text-gray-500 ml-2 font-normal">
                    (Updated: {lastUpdated.toLocaleTimeString()})
                  </span>
                )}
              </h2>
              
              {/* Special handling for analogies validation */}
              {testId === 'analogies' && validationResult.visualization && (
                <div className="space-y-6 mb-6">
                  {/* API Testing Metrics */}
                  {validationResult.visualization.apiMetrics && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">🔄</span>
                        Real API Testing Results
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {Object.entries(validationResult.visualization.apiMetrics).map(([key, value]) => (
                          <div key={key} className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <div className="text-sm font-medium text-blue-600">{key}</div>
                            <div className="text-lg font-bold text-blue-800">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Live User Results Table */}
                  {validationResult.visualization.userTable && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">👥</span>
                        Real User Test Results
                        <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          Live API Testing
                        </span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(validationResult.visualization.userTable[0] || {}).map(header => (
                                <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {validationResult.visualization.userTable.map((row, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                {Object.entries(row).map(([key, value], cellIndex) => (
                                  <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {key === 'User Created' && value === '✅' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Real User ✅
                                      </span>
                                    ) : key === 'User Created' && value === '❌' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                        Simulated ❌
                                      </span>
                                    ) : key === 'API Success' && value === '✅' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        API Success ✅
                                      </span>
                                    ) : key === 'API Success' && value === '❌' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        API Failed ❌
                                      </span>
                                    ) : key === 'Match' && value === '✅' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        Personalized ✅
                                      </span>
                                    ) : key === 'Match' && value === '❌' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                        Generic ❌
                                      </span>
                                    ) : (
                                      value
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Personalization Pie Chart */}
                  {validationResult.visualization.pieChart && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">📊</span>
                        Personalization Distribution
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <pre className="text-sm font-mono text-gray-700">
                              {Object.entries(validationResult.visualization.pieChart.data).map(([key, value]) => 
                                `${key}: ${value} tests\n`
                              ).join('')}
                            </pre>
                          </div>
                        </div>
                        <div>
                          <div className="space-y-2">
                            {Object.entries(validationResult.visualization.pieChart.data).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">{key}</span>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                  key === 'Personalized' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Live Analogy Viewer */}
                  {validationResult.visualization.analogyViewer && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">🎭</span>
                        Generated Analogies (Live Results)
                      </h3>
                      <div className="space-y-4">
                        {validationResult.visualization.analogyViewer.map((analogy, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 bg-white">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-gray-800">
                                User: {analogy.user} 
                                <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                  {analogy.preference}
                                </span>
                              </h4>
                              <div className="flex space-x-2">
                                {analogy.isReal ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Real API
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Simulated
                                  </span>
                                )}
                                {analogy.apiSuccess && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    API Success
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-gray-700 mb-3">
                              {analogy.analogy}
                            </div>
                            <div className="flex items-center justify-between text-sm text-gray-500">
                              <span>Domain: <strong>{analogy.domain}</strong></span>
                              {analogy.highlightedTerms && analogy.highlightedTerms.length > 0 && (
                                <span>
                                  Terms: {analogy.highlightedTerms.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Special handling for flashcards validation */}
              {testId === 'flashcards' && validationResult.visualization && (
                <div className="space-y-6 mb-6">
                  {/* Topic Summary Viewer */}
                  {validationResult.visualization.topicSummary && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">🏷️</span>
                        Topic Summary & Classification
                      </h3>
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Query Analysis</h4>
                            <div className="text-sm space-y-1">
                              <div><strong>Query:</strong> {validationResult.visualization.topicSummary.query}</div>
                              <div><strong>Classified Topic:</strong> 
                                <span className="ml-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                  {validationResult.visualization.topicSummary.classifiedTopic}
                                </span>
                              </div>
                              <div><strong>Confidence:</strong> {(validationResult.visualization.topicSummary.confidence * 100).toFixed(1)}%</div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Topic Details</h4>
                            <div className="text-sm text-gray-700">
                              <p className="mb-2">{validationResult.visualization.topicSummary.description}</p>
                              <div><strong>Key Aspects:</strong></div>
                              <ul className="list-disc list-inside text-xs mt-1">
                                {validationResult.visualization.topicSummary.keyAspects.map((aspect, index) => (
                                  <li key={index}>{aspect}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Flashcard List with Alignment Tags */}
                  {validationResult.visualization.flashcardList && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">📚</span>
                        Generated Flashcards with Topic Alignment
                      </h3>
                      <div className="space-y-3">
                        {validationResult.visualization.flashcardList.map((card, index) => (
                          <div key={index} className="border border-gray-200 rounded-lg p-4 bg-white">
                            <div className="flex items-start justify-between mb-2">
                              <h4 className="font-semibold text-gray-800 text-sm">#{card.id} - {card.conceptCovered}</h4>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                card.alignmentTag === 'Perfect' ? 'bg-green-100 text-green-800' :
                                card.alignmentTag === 'High' ? 'bg-blue-100 text-blue-800' :
                                card.alignmentTag === 'Good' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {card.alignmentTag} ({card.topicRelevance})
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">Question:</div>
                                <div className="text-sm text-gray-900 font-medium">{card.question}</div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">Answer:</div>
                                <div className="text-sm text-gray-700">{card.answer}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Topic-to-Question Relevance Score */}
                  {validationResult.visualization.relevanceDistribution && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">📊</span>
                        Topic-to-Question Relevance Distribution
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Relevance Breakdown</h4>
                          {Object.entries(validationResult.visualization.relevanceDistribution).map(([level, count]) => (
                            <div key={level} className="flex justify-between items-center py-1">
                              <span className="text-sm text-gray-600">{level}:</span>
                              <span className="font-semibold text-gray-900">{count} cards</span>
                            </div>
                          ))}
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Visual Distribution</h4>
                          <pre className="text-xs font-mono text-gray-700">
                            {Object.entries(validationResult.visualization.relevanceChart).map(([level, bar]) => (
                              `${level}: ${bar}\n`
                            )).join('')}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Special handling for quiz-generation validation */}
              {testId === 'quiz-generation' && validationResult.visualization && (
                <div className="space-y-6 mb-6">
                  {/* Topic Summary Viewer */}
                  {validationResult.visualization.topicSummary && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">🏷️</span>
                        Topic Summary & Classification
                      </h3>
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Query Analysis</h4>
                            <div className="text-sm space-y-1">
                              <div><strong>Query:</strong> {validationResult.visualization.topicSummary.query}</div>
                              <div><strong>Classified Topic:</strong> 
                                <span className="ml-1 px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                  {validationResult.visualization.topicSummary.classifiedTopic}
                                </span>
                              </div>
                              <div><strong>Confidence:</strong> {(validationResult.visualization.topicSummary.confidence * 100).toFixed(1)}%</div>
                              <div><strong>Quiz Alignment:</strong> {validationResult.visualization.topicSummary.quizAlignment}</div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Topic Details</h4>
                            <div className="text-sm text-gray-700">
                              <p className="mb-2">{validationResult.visualization.topicSummary.description}</p>
                              <div><strong>Key Aspects:</strong></div>
                              <ul className="list-disc list-inside text-xs mt-1">
                                {validationResult.visualization.topicSummary.keyAspects.map((aspect, index) => (
                                  <li key={index}>{aspect}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Quiz Question Table with Topic Tags */}
                  {validationResult.visualization.quizQuestionTable && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">❓</span>
                        Generated Quiz Questions with Topic Alignment
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Question</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Correct Answer</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Difficulty</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Topic Relevance</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Security Concept</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alignment</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {validationResult.visualization.quizQuestionTable.map((question, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200">#{question.id}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 max-w-xs">
                                  <div className="truncate" title={question.question}>
                                    {question.question.length > 50 ? question.question.substring(0, 50) + '...' : question.question}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200 max-w-xs">
                                  <div className="truncate" title={question.correctAnswer}>
                                    {question.correctAnswer.length > 40 ? question.correctAnswer.substring(0, 40) + '...' : question.correctAnswer}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm border-r border-gray-200">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    question.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                                    question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {question.difficulty}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200">{question.topicRelevance}</td>
                                <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200">{question.securityConcept}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-2 py-1 rounded-full text-xs ${
                                    question.topicTag === 'Perfect' ? 'bg-green-100 text-green-800' :
                                    question.topicTag === 'High' ? 'bg-blue-100 text-blue-800' :
                                    question.topicTag === 'Good' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {question.topicTag}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Topic Alignment Analysis */}
                  {validationResult.visualization.alignmentDistribution && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">📊</span>
                        Topic Alignment per Question
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Alignment Distribution</h4>
                          {Object.entries(validationResult.visualization.alignmentDistribution).map(([level, count]) => (
                            <div key={level} className="flex justify-between items-center py-1">
                              <span className="text-sm text-gray-600">{level}:</span>
                              <span className="font-semibold text-gray-900">{count} questions</span>
                            </div>
                          ))}
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Visual Distribution</h4>
                          <pre className="text-xs font-mono text-gray-700">
                            {Object.entries(validationResult.visualization.alignmentChart).map(([level, bar]) => (
                              `${level}: ${bar}\n`
                            )).join('')}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Difficulty vs User Level Chart */}
                  {validationResult.visualization.difficultyChart && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">📈</span>
                        Difficulty vs User Level Analysis
                      </h3>
                      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">User Profile</h4>
                            <div className="text-sm space-y-1">
                              <div><strong>User Level:</strong> 
                                <span className="ml-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                  {validationResult.visualization.difficultyChart.userLevel}
                                </span>
                              </div>
                              <div><strong>Target Difficulty:</strong> {validationResult.visualization.difficultyChart.targetDifficulty}</div>
                              <div><strong>Alignment:</strong> 
                                <span className={`ml-1 px-2 py-1 rounded text-xs ${
                                  validationResult.visualization.difficultyChart.alignment === 'Well Matched' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {validationResult.visualization.difficultyChart.alignment}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Question Distribution</h4>
                            <div className="text-sm space-y-1">
                              {Object.entries(validationResult.visualization.difficultyChart.actualDistribution).map(([level, count]) => (
                                <div key={level} className="flex justify-between">
                                  <span className="capitalize">{level}:</span>
                                  <span className="font-medium">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-2">Recommendation</h4>
                            <div className="text-sm text-gray-700">
                              {validationResult.visualization.difficultyChart.recommendation}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {validationResult.metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {Object.entries(validationResult.metrics).map(([key, value]) => {
                    // Skip complex objects for analogies test that are handled above
                    if (testId === 'analogies' && ['testUsers', 'queryVariations', 'testResults', 'analogyViewer'].includes(key)) {
                      return null;
                    }
                    
                    // Special handling for different data types
                    const renderValue = () => {
                      if (typeof value === 'number') {
                        return value.toFixed(3);
                      } else if (Array.isArray(value)) {
                        // Special handling for flashcards array
                        if (key === 'sampleFlashcards' && value.length > 0 && value[0].question) {
                          return (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {value.map((flashcard, index) => (
                                <div key={index} className="text-xs p-2 bg-white rounded border">
                                  <div className="font-medium text-blue-800">Q: {flashcard.question}</div>
                                  <div className="text-gray-600 mt-1">A: {flashcard.answer}</div>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        // For other arrays, show count and first few items
                        return `Array (${value.length} items): ${value.slice(0, 3).map(v => typeof v === 'object' ? JSON.stringify(v).substring(0, 30) + '...' : v).join(', ')}${value.length > 3 ? '...' : ''}`;
                      } else if (typeof value === 'object' && value !== null) {
                        // For objects, show key-value pairs or JSON
                        const entries = Object.entries(value);
                        if (entries.length <= 3) {
                          return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
                        }
                        return JSON.stringify(value, null, 2).substring(0, 100) + '...';
                      } else if (typeof value === 'boolean') {
                        return value ? '✅ True' : '❌ False';
                      } else {
                        return value.toString();
                      }
                    };

                    return (
                      <div key={key} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-sm font-medium text-gray-600 mb-1">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </div>
                        <div className={`${key === 'sampleFlashcards' ? 'text-sm' : 'text-lg font-bold'} text-gray-900`}>
                          {renderValue()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {validationResult.log && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">📝 Test Log</h4>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">{validationResult.log}</pre>
                  </div>
                </div>
              )}

              {validationResult.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="text-sm font-medium text-red-700 mb-1">❌ Error</h4>
                  <p className="text-sm text-red-600">{validationResult.error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Expected Results */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-indigo-600 mr-2">📈</span>
              Expected Results
            </h3>
            <div className="space-y-3">
              {testData.results.map((result, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg border ${getStatusColor(result.status)}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium">{result.metric}</span>
                    <span className="text-sm font-bold">{result.value}</span>
                  </div>
                  <div className="text-xs opacity-75">
                    Threshold: {result.threshold}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Details */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-teal-600 mr-2">⚙️</span>
              Technical Details
            </h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Algorithm</h4>
                <p className="text-sm text-gray-600">{testData.technicalDetails.algorithm}</p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Parameters</h4>
                <div className="space-y-2">
                  {Object.entries(testData.technicalDetails.parameters).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-mono text-gray-900">{value.toString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Data Source</h4>
                <p className="text-sm text-gray-600">{testData.technicalDetails.dataSource}</p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">Update Frequency</h4>
                <p className="text-sm text-gray-600">{testData.technicalDetails.updateFrequency}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <span className="text-yellow-600 mr-2">⚡</span>
              Quick Actions
            </h3>
            
            <div className="space-y-3">
              <button
                onClick={runValidationTest}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Running...' : 'Run Test'}
              </button>
              
              <button
                onClick={fetchValidationResult}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Refresh Results
              </button>
              
              <Link
                to="/validation"
                className="block w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium text-center transition-colors"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidationTestDetail; 