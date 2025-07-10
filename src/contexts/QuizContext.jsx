// src/contexts/QuizContext.jsx with improved error handling
import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { useAuth } from './AuthContext';
import { toast } from 'react-hot-toast';

// Fallback API URL if the configured one isn't working
const FALLBACK_API_URL = import.meta.env.MODE === 'development' 
  ? 'http://localhost:3001'
  : window.location.origin;

const QuizContext = createContext();

export function useQuiz() {
  return useContext(QuizContext);
}

export function QuizProvider({ children }) {
  const { user } = useAuth();
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mockMode, setMockMode] = useState(false);

  // Mock data for when the server is unavailable
  const createMockQuiz = (query, difficulty) => {
    const mockQuestions = [
      {
        question: `What is the primary focus of ${query}?`,
        options: [
          `Understanding the fundamental principles of ${query}`,
          `The historical development of ${query}`,
          `The practical applications of ${query}`,
          `The social implications of ${query}`
        ],
        correctAnswer: 0,
        explanation: `${query} primarily focuses on understanding the fundamental principles that govern the field.`
      },
      {
        question: `Which of the following best describes ${query}?`,
        options: [
          `A theoretical framework`,
          `A practical methodology`,
          `A scientific discipline`,
          `A technological innovation`
        ],
        correctAnswer: 2,
        explanation: `${query} is best described as a scientific discipline with its own methodologies and principles.`
      },
      {
        question: `Who is generally credited with pioneering work in ${query}?`,
        options: [
          `Albert Einstein`,
          `Marie Curie`,
          `Isaac Newton`,
          `Galileo Galilei`
        ],
        correctAnswer: 3,
        explanation: `Galileo Galilei is often credited with pioneering work in this field through his early experiments.`
      },
      {
        question: `Which concept is NOT typically associated with ${query}?`,
        options: [
          `Theoretical analysis`,
          `Empirical observation`,
          `Supernatural explanation`,
          `Systematic experimentation`
        ],
        correctAnswer: 2,
        explanation: `Supernatural explanations are not typically associated with ${query}, which relies on scientific methods.`
      },
      {
        question: `How has ${query} evolved in the 21st century?`,
        options: [
          `It has become obsolete`,
          `It has integrated with digital technology`,
          `It has remained unchanged`,
          `It has been replaced by new disciplines`
        ],
        correctAnswer: 1,
        explanation: `${query} has evolved significantly by integrating with digital technology in the 21st century.`
      }
    ];

    return {
      id: `mock-${Date.now()}`,
      title: `${query} Quiz (${difficulty} difficulty)`,
      description: `Test your knowledge about ${query}`,
      questions: mockQuestions,
      query,
      difficulty,
      createdAt: new Date().toISOString(),
      userId: user?.id || 'anonymous',
      isMockQuiz: true
    };
  };

  // Create mock quiz results
  const createMockResults = (quiz, answers) => {
    let correctAnswers = 0;
    const results = quiz.questions.map((question, index) => {
      // If no answer provided, default to 0
      const userAnswer = answers[index] !== undefined ? answers[index] : 0;
      const isCorrect = userAnswer === question.correctAnswer;
      
      if (isCorrect) {
        correctAnswers++;
      }
      
      return {
        question: question.question,
        userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation
      };
    });
    
    return {
      quizId: quiz.id,
      score: (correctAnswers / quiz.questions.length) * 100,
      correctAnswers,
      totalQuestions: quiz.questions.length,
      results,
      isMockResult: true
    };
  };

  // Generate a quiz based on a query
  const generateQuiz = async (query, difficulty = 'medium') => {
    try {
      setLoading(true);
      setError(null);
      setCurrentQuiz(null);
      setQuizResults(null);
      
      // Try to use the configured API
      try {
        const response = await axios.post(`${API_URL}/api/generate-quiz`, {
          query,
          difficulty,
          userId: user?.id
        });
        
        setCurrentQuiz(response.data);
        setMockMode(false);
        return response.data;
      } catch (apiError) {
        console.warn('Primary API failed:', apiError);
        
        // Try fallback API URL if different from primary
        if (API_URL !== FALLBACK_API_URL) {
          try {
            const fallbackResponse = await axios.post(`${FALLBACK_API_URL}/api/generate-quiz`, {
              query,
              difficulty,
              userId: user?.id
            });
            
            setCurrentQuiz(fallbackResponse.data);
            setMockMode(false);
            
            // Notify about using fallback
            toast("Using backup API server", {
                icon: '🔄'
              });            
            return fallbackResponse.data;
          } catch (fallbackError) {
            console.warn('Fallback API failed:', fallbackError);
            // Continue to mock mode
          }
        }
        
        // If both APIs failed, use mock mode
        console.log('Switching to mock mode due to API failure');
        const mockQuiz = createMockQuiz(query, difficulty);
        setCurrentQuiz(mockQuiz);
        setMockMode(true);
        
        // Notify user about mock mode
        toast.error("API unavailable - using offline quiz mode", {
            icon: '⚠️'
          });        
        return mockQuiz;
      }
    } catch (err) {
      console.error('Error generating quiz:', err);
      setError('Failed to generate quiz. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Submit quiz answers
  const submitQuiz = async (quizId, answers) => {
    try {
      setLoading(true);
      setError(null);
      
      // If in mock mode, use mock results
      if (mockMode || (currentQuiz && currentQuiz.isMockQuiz)) {
        console.log('Using mock results in mock mode');
        const mockResults = createMockResults(currentQuiz, answers);
        setQuizResults(mockResults);
        
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 800));
        
        return mockResults;
      }
      
      // Try primary API
      try {
        const response = await axios.post(`${API_URL}/api/submit-quiz`, {
          quizId,
          answers,
          userId: user?.id
        });
        
        setQuizResults(response.data);
        return response.data;
      } catch (apiError) {
        console.warn('Primary API failed for submission:', apiError);
        
        // Try fallback API URL
        if (API_URL !== FALLBACK_API_URL) {
          try {
            const fallbackResponse = await axios.post(`${FALLBACK_API_URL}/api/submit-quiz`, {
              quizId,
              answers,
              userId: user?.id
            });
            
            setQuizResults(fallbackResponse.data);
            
            // Notify about using fallback
            toast("Using backup API server for submission", {
                icon: '🔄'
              });            
            return fallbackResponse.data;
          } catch (fallbackError) {
            console.warn('Fallback API failed for submission:', fallbackError);
          }
        }
        
        // If both APIs failed, fall back to mock results
        console.log('Switching to mock results due to API failure');
        const mockResults = createMockResults(currentQuiz, answers);
        setQuizResults(mockResults);
        
        // Notify user
        toast.error("API unavailable - using offline results", {
            icon: '⚠️'
          });        
        return mockResults;
      }
    } catch (err) {
      console.error('Error submitting quiz:', err);
      setError('Failed to submit quiz. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Reset the current quiz
  const resetQuiz = () => {
    setCurrentQuiz(null);
    setQuizResults(null);
    setError(null);
    setMockMode(false);
  };

  const value = {
    currentQuiz,
    quizResults,
    loading,
    error,
    mockMode,
    generateQuiz,
    submitQuiz,
    resetQuiz
  };

  return (
    <QuizContext.Provider value={value}>
      {children}
    </QuizContext.Provider>
  );
}