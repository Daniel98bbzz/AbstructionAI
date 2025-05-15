import React, { useState, useEffect } from 'react';
import { generateQuizQuestions } from '../api/quizApi';

// This component shows a button to generate a quiz from a query response
// and displays the quiz interface when active
function QueryToQuiz({ 
  query, 
  responseContent, 
  onQuizStart, 
  onQuizEnd, 
  isActive, 
  alwaysVisible = false, 
  preGeneratedQuiz = null 
}) {
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [difficultyLevel, setDifficultyLevel] = useState('medium'); // 'easy', 'medium', 'hard'
  const [showExplanation, setShowExplanation] = useState(false);

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

  useEffect(() => {
    if (preGeneratedQuiz?.questions?.length > 0) {
      setQuizQuestions(preGeneratedQuiz.questions);
    }
  }, [preGeneratedQuiz]);

  // Reset quiz state
  const resetQuiz = () => {
    setQuizQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizScore(0);
    setShowExplanation(false);
    if (onQuizEnd) onQuizEnd();
  };

  // Generate quiz questions based on query and response
  const generateQuiz = async () => {
    setLoading(true);
    try {
      if (preGeneratedQuiz?.questions?.length > 0) {
        setQuizQuestions(preGeneratedQuiz.questions);
      } else {
        const response = await generateQuizQuestions(query, {
          content: responseContent,
          difficultyLevel
        });
        setQuizQuestions(response.questions);
      }
      
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setQuizScore(0);
      setQuizMode(true);
      setShowExplanation(false);
      if (onQuizStart) onQuizStart();
    } catch (error) {
      console.error('Error generating quiz questions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle answer selection
  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
    setShowExplanation(true);
    
    // Check if answer is correct
    const currentQuestion = quizQuestions[currentQuestionIndex];
    if (answerIndex === currentQuestion.correctAnswer) {
      setQuizScore(prevScore => prevScore + 1);
    }
  };

  // Move to next question
  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      // Quiz is complete
      const finalScore = (quizScore / quizQuestions.length) * 100;
      alert(`Quiz complete! Your score: ${finalScore.toFixed(1)}%`);
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
    if (!alwaysVisible && !isActive) return null;
    
    return (
      <div className="mt-4">
        <button
          onClick={generateQuiz}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Generating Quiz...' : 'Take a Quiz'}
        </button>
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
  const currentQuestion = quizQuestions[currentQuestionIndex];
  if (!currentQuestion) return null;

  return (
    <div className="mt-4 bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">
          Question {currentQuestionIndex + 1} of {quizQuestions.length}
        </h3>
        <button
          onClick={handleExitQuiz}
          className="text-gray-500 hover:text-gray-700"
        >
          Exit Quiz
        </button>
      </div>

      <p className="mb-4 text-gray-700">{currentQuestion.question}</p>

      <div className="space-y-3 mb-6">
        {currentQuestion.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAnswerSelect(index)}
            disabled={selectedAnswer !== null}
            className={`w-full text-left p-3 rounded-md border ${
              selectedAnswer === index 
                ? index === currentQuestion.correctAnswer
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'bg-red-50 border-red-500 text-red-700'
                : selectedAnswer !== null && index === currentQuestion.correctAnswer
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {option}
            {selectedAnswer !== null && (
              <span className="float-right">
                {index === currentQuestion.correctAnswer 
                  ? '✓' 
                  : selectedAnswer === index ? '✗' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {showExplanation && selectedAnswer !== null && (
        <div className={`p-4 rounded-md mb-4 ${
          selectedAnswer === currentQuestion.correctAnswer 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <h4 className="font-medium text-gray-900 mb-2">
            {selectedAnswer === currentQuestion.correctAnswer 
              ? 'Correct!' 
              : 'Incorrect!'}
          </h4>
          <p className="text-gray-700">{currentQuestion.explanation}</p>
          {selectedAnswer !== currentQuestion.correctAnswer && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
              <p className="text-sm font-medium text-gray-700">
                The correct answer is: {currentQuestion.options[currentQuestion.correctAnswer]}
              </p>
            </div>
          )}
        </div>
      )}

      {selectedAnswer !== null && (
        <button
          onClick={handleNextQuestion}
          className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {currentQuestionIndex < quizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}
        </button>
      )}
    </div>
  );
}

export default QueryToQuiz;