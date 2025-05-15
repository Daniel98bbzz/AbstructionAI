// src/pages/QuizPage.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Quiz from '../components/Quiz';

function QuizPage() {
  const { user } = useAuth();
  const [topic, setTopic] = useState('');
  const [recentTopics, setRecentTopics] = useState([]);
  const [popularTopics, setPopularTopics] = useState([
    'Quantum Physics',
    'Machine Learning',
    'Web Development',
    'Data Structures',
    'Artificial Intelligence',
    'Blockchain Technology',
    'Algorithms',
    'Computer Networks',
    'Cloud Computing'
  ]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizHistory, setQuizHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRecentTopics();
      fetchQuizHistory();
    }
  }, [user]);

  const fetchRecentTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('queries')
        .select('query')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        // Extract unique topics
        const uniqueTopics = [...new Set(data.map(item => item.query))];
        setRecentTopics(uniqueTopics);
      }
    } catch (error) {
      console.error('Error fetching recent topics:', error);
    }
  };

  const fetchQuizHistory = async () => {
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
        .limit(10);

      if (!error && data) {
        setQuizHistory(data);
      }
    } catch (error) {
      console.error('Error fetching quiz history:', error);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (topic.trim()) {
      setShowQuiz(true);
    }
  };

  const handleTopicClick = (selectedTopic) => {
    setTopic(selectedTopic);
    setShowQuiz(true);
  };

  const handleCloseQuiz = () => {
    setShowQuiz(false);
    fetchQuizHistory(); // Refresh quiz history after closing
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Please Log In</h2>
          <p className="text-gray-600 mb-6">You need to be logged in to take quizzes.</p>
          <Link to="/login" className="btn btn-primary">
            Log In
          </Link>
          <p className="mt-4 text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary-600 hover:text-primary-500">
              Register
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (showQuiz) {
    return <Quiz query={topic} onClose={handleCloseQuiz} />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Knowledge Quiz</h1>
          <p className="text-gray-600 mb-6">Test your understanding with interactive quizzes on any topic.</p>
          
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter a topic to quiz yourself on..."
                className="flex-grow rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                required
              />
              <button
                type="submit"
                className="px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Start Quiz
              </button>
            </div>
          </form>
          
          {recentTopics.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Recent Topics</h2>
              <div className="flex flex-wrap gap-2">
                {recentTopics.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleTopicClick(item)}
                    className="px-4 py-2 bg-primary-50 text-primary-700 rounded-full hover:bg-primary-100 transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Popular Topics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {popularTopics.map((topic, index) => (
                <button
                  key={index}
                  onClick={() => handleTopicClick(topic)}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <h3 className="font-medium text-gray-900">{topic}</h3>
                  <p className="text-sm text-gray-500 mt-1">Test your knowledge</p>
                </button>
              ))}
            </div>
          </div>
          
          {quizHistory.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Quiz History</h2>
              <div className="overflow-hidden border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Topic</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Difficulty</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {quizHistory.map((result, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{result.quizzes?.title || 'Unknown Quiz'}</div>
                          <div className="text-sm text-gray-500">{result.quizzes?.query || ''}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(result.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            result.score >= 80 ? 'bg-green-100 text-green-800' :
                            result.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {result.score}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {result.quizzes?.difficulty || 'Medium'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleTopicClick(result.quizzes?.query || '')}
                            className="text-primary-600 hover:text-primary-900"
                          >
                            Retry
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuizPage;