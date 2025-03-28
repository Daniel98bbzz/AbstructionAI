import React, { useState, useEffect } from 'react';

// This component shows a button to generate a quiz from a query response
// and displays the quiz interface when active
function QueryToQuiz({ query, responseContent, onQuizStart, onQuizEnd, isActive, alwaysVisible = false }) {
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [difficultyLevel, setDifficultyLevel] = useState('medium'); // 'easy', 'medium', 'hard'

  // If external isActive prop changes, update quizMode
  useEffect(() => {
    if (isActive && !quizMode) {
      setQuizMode(true);
    } else if (!isActive && quizMode) {
      // Only reset if explicitly set to inactive from outside
      setQuizMode(false);
      resetQuiz();
    }
  }, [isActive]);

  // Reset quiz state
  const resetQuiz = () => {
    setQuizQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizScore(0);
    if (onQuizEnd) onQuizEnd();
  };

  // Generate quiz questions based on query and response
  const generateQuiz = async () => {
    setLoading(true);
    try {
      // In a real implementation, you would call your AI service or API
      // For now, we'll use a simple mock implementation
      
      // Mock delay to simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate mock questions based on the content
      const mockQuestions = [
        {
          question: `Based on the explanation about ${query}, what is one key concept?`,
          options: [
            'A mock answer that is correct',
            'A plausible but incorrect answer',
            'Another incorrect option',
            'One more incorrect option'
          ],
          correctIndex: 0
        },
        {
          question: `Which of the following best describes ${query}?`,
          options: [
            'An incorrect description',
            'A correct description based on the content',
            'A partially correct but misleading description',
            'A completely unrelated description'
          ],
          correctIndex: 1
        },
        {
          question: `What is an application of ${query}?`,
          options: [
            'An unrelated application',
            'A somewhat related but incorrect application',
            'The correct application based on content',
            'A made-up application'
          ],
          correctIndex: 2
        }
      ];
      
      setQuizQuestions(mockQuestions);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setQuizScore(0);
      setQuizMode(true);
    } catch (error) {
      console.error('Error generating quiz questions:', error);
      // Handle error appropriately
    } finally {
      setLoading(false);
    }
  };

  // Handle answer selection
  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
    
    // Check if answer is correct
    if (answerIndex === quizQuestions[currentQuestionIndex].correctIndex) {
      setQuizScore(prevScore => prevScore + 1);
    }
  };

  // Move to next question
  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      setSelectedAnswer(null);
    } else {
      // Quiz is complete
      alert(`Quiz complete! Your score: ${quizScore}/${quizQuestions.length}`);
      setQuizMode(false);
      resetQuiz();
    }
  };

  // Exit quiz mode
  const handleExitQuiz = () => {
    setQuizMode(false);
    resetQuiz();
    // Ensure parent component knows quiz has ended
    if (onQuizEnd) onQuizEnd();
  };

  // If not in quiz mode or selection phase, show the quiz button
  if (!quizMode) {
    return (
      <div className="flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              generateQuiz();
              // Ensure parent component knows quiz is starting
              if (onQuizStart) onQuizStart();
            }}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Test Your Knowledge
          </button>
          
          <div className="flex items-center">
            <span className="text-sm text-gray-500 mr-2">Difficulty:</span>
            <select
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // When loading questions
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          <p className="mt-2 text-gray-600">Generating quiz questions...</p>
        </div>
      </div>
    );
  }

  // Quiz interface
  return (
    <div className={`${alwaysVisible ? 'block' : isActive ? 'block' : 'hidden'}`}>
      <div className="bg-white rounded-lg shadow-lg p-6 border border-indigo-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            Quiz Question {currentQuestionIndex + 1}/{quizQuestions.length}
          </h3>
          <button 
            onClick={handleExitQuiz}
            className="text-gray-400 hover:text-gray-500"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <p className="text-gray-800 mb-4 font-medium">
          {quizQuestions[currentQuestionIndex]?.question}
        </p>
        
        <div className="space-y-3 mb-6">
          {quizQuestions[currentQuestionIndex]?.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              disabled={selectedAnswer !== null}
              className={`w-full text-left p-3 rounded-md border ${
                selectedAnswer === index 
                  ? index === quizQuestions[currentQuestionIndex].correctIndex
                    ? 'bg-green-50 border-green-500 text-green-700'
                    : 'bg-red-50 border-red-500 text-red-700'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option}
              {selectedAnswer === index && (
                <span className="float-right">
                  {index === quizQuestions[currentQuestionIndex].correctIndex 
                    ? '✓' 
                    : '✗'}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <div className="flex justify-between">
          <div className="text-sm text-gray-500">
            Score: {quizScore}/{quizQuestions.length}
          </div>
          <button
            onClick={handleNextQuestion}
            disabled={selectedAnswer === null}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md disabled:opacity-50"
          >
            {currentQuestionIndex < quizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QueryToQuiz;