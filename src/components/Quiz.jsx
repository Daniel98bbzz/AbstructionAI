// src/components/Quiz.jsx - Complete version with offline support
import React, { useState, useEffect } from 'react';
import { useQuiz } from '../contexts/QuizContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

function Quiz({ query, onClose, initialDifficulty = 'medium' }) {
  const { user } = useAuth();
  const { currentQuiz, quizResults, loading, error, mockMode, generateQuiz, submitQuiz, resetQuiz } = useQuiz();
  const [currentStep, setCurrentStep] = useState('intro'); // intro, questions, results
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [generationError, setGenerationError] = useState(null);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Generate quiz on component mount if query is provided
  useEffect(() => {
    if (query && currentStep === 'intro') {
      handleStartQuiz();
    }
    
    return () => {
      // Clean up when component unmounts
      resetQuiz();
    };
  }, [query]);

  const handleStartQuiz = async () => {
    try {
      setGenerationError(null);
      const quiz = await generateQuiz(query, difficulty);
      setCurrentStep('questions');
      // Initialize answer array based on the number of questions
      const questionCount = quiz?.questions?.length || 5;
      setSelectedAnswers(Array(questionCount).fill(null));
      setCurrentQuestion(0);
    } catch (err) {
      console.error('Failed to generate quiz:', err);
      setGenerationError('Failed to generate quiz. Please try again.');
      toast.error('Quiz generation failed. Please try again.', {
        duration: 4000
      });
    }
  };

  const handleSelectAnswer = (questionIndex, answerIndex) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[questionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
    setShowExplanation(true);
    
    const isCorrect = answerIndex === currentQuiz.questions[questionIndex].correctAnswer;
    if (isCorrect) {
      setQuizScore(prevScore => prevScore + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < (currentQuiz?.questions?.length || 0) - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswers(Array(currentQuiz.questions.length).fill(null));
      setShowExplanation(false);
    } else {
      handleSubmitQuiz();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    try {
      await submitQuiz(currentQuiz.id, selectedAnswers);
      setCurrentStep('results');
    } catch (err) {
      console.error('Failed to submit quiz:', err);
      // Still move to results if we're in mock mode, the context should handle it
      if (mockMode) {
        setCurrentStep('results');
      } else {
        toast.error('Failed to submit quiz. Your responses could not be saved.');
      }
    }
  };

  const handleRestartQuiz = () => {
    resetQuiz();
    setCurrentStep('intro');
    setSelectedAnswers([]);
    setCurrentQuestion(0);
    setQuizScore(0);
  };

  // Render the intro screen
  const renderIntro = () => (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Knowledge Quiz</h2>
      <p className="text-gray-600 mb-6">
        Test your understanding of <span className="font-semibold">{query}</span> with a short quiz!
      </p>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      
      {generationError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {generationError}
        </div>
      )}
      
      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleStartQuiz}
          disabled={loading}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </span>
          ) : (
            'Start Quiz'
          )}
        </button>
      </div>
    </div>
  );

  // Render the questions
  const renderQuestions = () => {
    if (!currentQuiz || !currentQuiz.questions || currentQuiz.questions.length === 0) {
      return (
        <div className="text-center p-6">
          <p className="text-red-600">No questions available.</p>
          <button
            onClick={handleRestartQuiz}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    const question = currentQuiz.questions[currentQuestion];

    return (
      <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
        {mockMode && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-yellow-400 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-yellow-700">
                <span className="font-medium">Offline Mode:</span> Working without server connection. Your results will not be saved.
              </p>
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">{currentQuiz.title}</h2>
          <span className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
            Question {currentQuestion + 1} of {currentQuiz.questions.length}
          </span>
        </div>
        
        <div className="mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">{question.question}</h3>
          
          <div className="space-y-3">
            {question.options.map((option, index) => (
              <div
                key={index}
                onClick={() => handleSelectAnswer(currentQuestion, index)}
                className={`p-3 border rounded-md cursor-pointer transition-colors ${
                  selectedAnswers[currentQuestion] === index
                    ? 'bg-primary-100 border-primary-500'
                    : 'hover:bg-gray-50 border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full mr-3 ${
                    selectedAnswers[currentQuestion] === index
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {String.fromCharCode(65 + index)}
                  </div>
                  <span>{option}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {showExplanation && (
          <div className={`p-4 rounded-md mb-4 ${
            selectedAnswers[currentQuestion] === currentQuiz.questions[currentQuestion].correctAnswer
              ? 'bg-green-50 border border-green-200' 
              : 'bg-yellow-50 border border-yellow-200'
          }`}>
            <h4 className="font-medium text-gray-900 mb-1">Explanation:</h4>
            <p className="text-sm text-gray-700">{currentQuiz.questions[currentQuestion].explanation}</p>
          </div>
        )}
        
        <div className="flex justify-between">
          <button
            onClick={handlePreviousQuestion}
            disabled={currentQuestion === 0}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          
          <button
            onClick={handleNextQuestion}
            disabled={selectedAnswers[currentQuestion] === null}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {currentQuestion === currentQuiz.questions.length - 1 ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    );
  };

  // Render the results
  const renderResults = () => {
    if (!quizResults) {
      return (
        <div className="text-center p-6">
          <p className="text-red-600">No results available.</p>
          <button
            onClick={handleRestartQuiz}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    const scorePercentage = (quizResults.correctAnswers / quizResults.totalQuestions) * 100;
    
    let grade;
    if (scorePercentage >= 90) grade = 'A';
    else if (scorePercentage >= 80) grade = 'B';
    else if (scorePercentage >= 70) grade = 'C';
    else if (scorePercentage >= 60) grade = 'D';
    else grade = 'F';

    return (
      <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
        {mockMode && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-md">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-yellow-400 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-yellow-700">
                <span className="font-medium">Offline Results:</span> Your results could not be saved to the server.
              </p>
            </div>
          </div>
        )}
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Results</h2>
        <p className="text-gray-600 mb-6">{currentQuiz?.title}</p>
        
        <div className="bg-gray-50 p-6 rounded-lg mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-gray-700">Your Score</p>
              <p className="text-3xl font-bold text-gray-900">{scorePercentage.toFixed(0)}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-700">Grade</p>
              <span className={`inline-block w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
                grade === 'A' ? 'bg-green-100 text-green-800' :
                grade === 'B' ? 'bg-blue-100 text-blue-800' :
                grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                grade === 'D' ? 'bg-orange-100 text-orange-800' :
                'bg-red-100 text-red-800'
              }`}>
                {grade}
              </span>
            </div>
            <div className="text-right">
              <p className="text-gray-700">Correct Answers</p>
              <p className="text-xl font-bold text-gray-900">{quizResults.correctAnswers} / {quizResults.totalQuestions}</p>
            </div>
          </div>
        </div>
        
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Question Review</h3>
          
          <div className="space-y-6">
            {quizResults.results.map((result, index) => (
              <div key={index} className="border rounded-md overflow-hidden">
                <div className={`p-4 ${result.isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-start">
                    <span className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full mr-3 ${
                      result.isCorrect 
                        ? 'bg-green-500 text-white' 
                        : 'bg-red-500 text-white'
                    }`}>
                      {result.isCorrect ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">Question {index + 1}: {result.question}</p>
                      <p className="mt-1 text-sm">
                        {result.isCorrect 
                          ? 'Correct!' 
                          : `Incorrect. You selected option ${String.fromCharCode(65 + result.userAnswer)}, but the correct answer is option ${String.fromCharCode(65 + result.correctAnswer)}.`}
                      </p>
                    </div>
                  </div>
                </div>
                {result.explanation && (
                  <div className="p-4 bg-gray-50 border-t">
                    <p className="text-sm text-gray-700"><span className="font-medium">Explanation:</span> {result.explanation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={handleRestartQuiz}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            New Quiz
          </button>
        </div>
      </div>
    );
  };

  // Main render logic
  return (
    <div className="p-4">
      {currentStep === 'intro' && renderIntro()}
      {currentStep === 'questions' && renderQuestions()}
      {currentStep === 'results' && renderResults()}
    </div>
  );
}

export default Quiz;