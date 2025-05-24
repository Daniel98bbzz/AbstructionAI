import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

function ClusterQuizSuggestions() {
  const { user } = useAuth();
  const [clusterQuizzes, setClusterQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    if (user) {
      fetchClusterQuizzes();
    }
  }, [user]);

  async function fetchClusterQuizzes() {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/clusters/cluster-quizzes/${user.id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch cluster quizzes');
      }
      
      setClusterQuizzes(data.quizzes || []);
    } catch (err) {
      console.error('Error fetching cluster quizzes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 80) return 'text-blue-600 bg-blue-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    if (score >= 60) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'hard': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(clusterQuizzes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentQuizzes = clusterQuizzes.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(page);
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What Others Are Challenging</h3>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What Others Are Challenging</h3>
        <div className="text-center py-8">
          <p className="text-red-600 mb-2">Failed to load quiz suggestions</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <button 
            onClick={fetchClusterQuizzes}
            className="mt-3 text-primary-600 hover:text-primary-500 text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (clusterQuizzes.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What Others Are Challenging</h3>
        <div className="text-center py-8">
          <p className="text-gray-500">No quiz results found from users in your cluster yet.</p>
          <p className="text-gray-400 text-sm mt-1">Be the first to take a quiz!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">What Others Are Challenging</h3>
        <Link to="/quiz" className="text-sm font-medium text-primary-600 hover:text-primary-500">
          Create Quiz →
        </Link>
      </div>
      
      <div className="space-y-4">
        {currentQuizzes.map((quiz) => (
          <div key={quiz.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 mb-1">{quiz.title}</h4>
                <p className="text-sm text-gray-600 mb-2">{quiz.query}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>by {quiz.username}</span>
                  <span>{formatDate(quiz.timestamp)}</span>
                  <span className={`px-2 py-1 rounded-full ${getDifficultyColor(quiz.difficulty)}`}>
                    {quiz.difficulty}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreColor(quiz.score)}`}>
                  {Math.round(quiz.score)}%
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-3">
              <span className="text-xs text-gray-400">
                Challenge: Can you beat {Math.round(quiz.score)}%?
              </span>
              <Link 
                to={`/quiz?topic=${encodeURIComponent(quiz.query)}&difficulty=${quiz.difficulty}`}
                className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 transition-colors"
              >
                Take Quiz
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {startIndex + 1} to {Math.min(endIndex, clusterQuizzes.length)} of {clusterQuizzes.length} results
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Mobile pagination - Simple previous/next */}
            <div className="flex sm:hidden">
              <button
                onClick={goToPrevious}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={goToNext}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>

            {/* Desktop pagination - Full page numbers */}
            <div className="hidden sm:flex">
              <button
                onClick={goToPrevious}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              {[...Array(totalPages)].map((_, index) => {
                const pageNumber = index + 1;
                return (
                  <button
                    key={pageNumber}
                    onClick={() => goToPage(pageNumber)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-medium border ${
                      currentPage === pageNumber
                        ? 'bg-primary-50 border-primary-500 text-primary-600'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
              
              <button
                onClick={goToNext}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClusterQuizSuggestions; 