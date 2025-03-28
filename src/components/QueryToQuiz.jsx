// src/components/QueryToQuiz.jsx
import React, { useState } from 'react';
import { useQuiz } from '../contexts/QuizContext';
import Quiz from './Quiz';

function QueryToQuiz({ query, responseContent }) {
  const { loading } = useQuiz();
  const [showQuiz, setShowQuiz] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');

  const handleGenerateQuiz = () => {
    setShowQuiz(true);
  };

  const handleCloseQuiz = () => {
    setShowQuiz(false);
  };

  if (showQuiz) {
    return <Quiz query={query} onClose={handleCloseQuiz} initialDifficulty={difficulty} />;
  }

  return (
    <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
      <h3 className="text-lg font-medium text-primary-900 mb-2">Test Your Knowledge</h3>
      <p className="text-primary-700 mb-4">
        Generate a quiz based on this topic to test your understanding of the concept.
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
        <div className="w-full sm:w-auto">
          <label htmlFor="difficulty" className="block text-sm font-medium text-primary-700 mb-1">
            Difficulty
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full rounded-md border-primary-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        
        <button
          onClick={handleGenerateQuiz}
          disabled={loading}
          className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 mt-4 sm:mt-0 w-full sm:w-auto"
        >
          {loading ? 'Generating...' : 'Generate Quiz'}
        </button>
      </div>
      
      <p className="text-xs text-primary-600">
        The quiz will include 5 multiple-choice questions based on the topic above.
      </p>
    </div>
  );
}

export default QueryToQuiz;