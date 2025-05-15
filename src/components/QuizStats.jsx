// src/components/QuizStats.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

function QuizStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchRecentQuizzes();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Call the RPC function to get user quiz stats
      const { data, error } = await supabase.rpc('get_user_quiz_stats', {
        user_id: user.id
      });
      
      if (error) throw error;
      
      setStats(data[0] || null);
    } catch (error) {
      console.error('Error fetching quiz stats:', error);
      
      // Fallback: Calculate stats manually
      try {
        const { data: resultsData, error: resultsError } = await supabase
          .from('quiz_results')
          .select('score, created_at, quiz_id')
          .eq('user_id', user.id);
          
        if (resultsError) throw resultsError;
        
        if (resultsData && resultsData.length > 0) {
          const scores = resultsData.map(result => result.score);
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          
          setStats({
            total_quizzes: resultsData.length,
            average_score: avgScore,
            best_score: Math.max(...scores),
            worst_score: Math.min(...scores),
            quizzes_by_difficulty: { easy: 0, medium: 0, hard: 0 }
          });
        } else {
          setStats({
            total_quizzes: 0,
            average_score: 0,
            best_score: 0,
            worst_score: 0,
            quizzes_by_difficulty: { easy: 0, medium: 0, hard: 0 }
          });
        }
      } catch (fallbackError) {
        console.error('Error in fallback stats calculation:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentQuizzes = async () => {
    try {
      const { data, error } = await supabase
        .from('quiz_results')
        .select(`
          *,
          quizzes:quiz_id (
            title,
            query,
            difficulty
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
        
      if (error) throw error;
      
      setRecentQuizzes(data || []);
    } catch (error) {
      console.error('Error fetching recent quizzes:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quiz Performance</h3>
        <p className="text-gray-600">You haven't taken any quizzes yet.</p>
        <Link to="/quiz" className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700">
          Take Your First Quiz
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Quiz Performance</h3>
        <Link to="/quiz" className="text-sm font-medium text-primary-600 hover:text-primary-500">
          View All Quizzes
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Total Quizzes</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total_quizzes}</p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Average Score</p>
          <p className="text-2xl font-bold text-gray-900">{parseFloat(stats.average_score).toFixed(1)}%</p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Best Score</p>
          <p className="text-2xl font-bold text-green-600">{parseFloat(stats.best_score).toFixed(1)}%</p>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-sm text-gray-500">Worst Score</p>
          <p className="text-2xl font-bold text-red-600">{parseFloat(stats.worst_score).toFixed(1)}%</p>
        </div>
      </div>
      
      {recentQuizzes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Quizzes</h4>
          <div className="space-y-3">
            {recentQuizzes.map((quiz, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="font-medium text-gray-900">{quiz.quizzes?.title || 'Untitled Quiz'}</p>
                  <p className="text-sm text-gray-500">{new Date(quiz.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    quiz.score >= 80 ? 'bg-green-100 text-green-800' :
                    quiz.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {quiz.score}%
                  </span>
                  <span className="text-xs font-medium text-gray-500 capitalize">
                    {quiz.quizzes?.difficulty || 'Medium'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {stats.total_quizzes > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Quiz Difficulty Distribution</h4>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex mb-2">
              <div className="flex-grow h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${(stats.quizzes_by_difficulty.easy / stats.total_quizzes) * 100}%` }}
                ></div>
              </div>
              <div className="flex-grow h-3 bg-gray-200 rounded-full overflow-hidden mx-1">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{ width: `${(stats.quizzes_by_difficulty.medium / stats.total_quizzes) * 100}%` }}
                ></div>
              </div>
              <div className="flex-grow h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full"
                  style={{ width: `${(stats.quizzes_by_difficulty.hard / stats.total_quizzes) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="flex text-xs text-gray-500">
              <span className="flex-1">Easy: {stats.quizzes_by_difficulty.easy || 0}</span>
              <span className="flex-1 text-center">Medium: {stats.quizzes_by_difficulty.medium || 0}</span>
              <span className="flex-1 text-right">Hard: {stats.quizzes_by_difficulty.hard || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizStats;