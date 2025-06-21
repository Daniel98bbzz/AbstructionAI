import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';
import { API_URL } from '../config';
import { generateQuizQuestions } from '../api/quizApi';

const ResponseTabs = ({ 
  messageId, 
  mainContent, 
  originalQuery, 
  sessionId, 
  preferences = {},
  userId,
  tabContent = null // New prop for pre-generated content
}) => {
  const [activeTab, setActiveTab] = useState('main');
  const [examplesContent, setExamplesContent] = useState(null);
  const [abstractContent, setAbstractContent] = useState(null);
  const [quizContent, setQuizContent] = useState(null);
  const [flashCardsContent, setFlashCardsContent] = useState(null);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [loadingAbstract, setLoadingAbstract] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [loadingFlashCards, setLoadingFlashCards] = useState(false);
  const [errorExamples, setErrorExamples] = useState(null);
  const [errorAbstract, setErrorAbstract] = useState(null);
  const [errorQuiz, setErrorQuiz] = useState(null);
  const [errorFlashCards, setErrorFlashCards] = useState(null);
  const [examplesFromCache, setExamplesFromCache] = useState(false);
  const [abstractFromCache, setAbstractFromCache] = useState(false);
  const [quizFromCache, setQuizFromCache] = useState(false);
  const [flashCardsFromCache, setFlashCardsFromCache] = useState(false);
  
  // Quiz-specific state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [quizScore, setQuizScore] = useState(null);

  // Flash Cards-specific state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Load existing content when component mounts
  useEffect(() => {
    const loadContent = async () => {
      // First check if we have pre-generated content from the main response
      if (tabContent && tabContent.generated_simultaneously) {
        console.log('Using pre-generated tab content from main response');
        if (tabContent.examples) {
          setExamplesContent(tabContent.examples);
          setExamplesFromCache(true);
        }
        if (tabContent.abstract) {
          setAbstractContent(tabContent.abstract);
          setAbstractFromCache(true);
        }
        if (tabContent.quiz) {
          setQuizContent(tabContent.quiz);
          setQuizFromCache(true);
        }
        if (tabContent.flash_cards) {
          setFlashCardsContent(tabContent.flash_cards);
          setFlashCardsFromCache(true);
        }
        return; // Don't need to fetch from database if we have fresh content
      }

      // If no pre-generated content, try to load from database
      if (!messageId || !userId) {
        console.log('Missing messageId or userId, cannot load cached content');
        return;
      }

      try {
        console.log(`Loading existing tab content for message ${messageId}`);
        
        // Check for existing content for all tabs
        const [examplesResponse, abstractResponse, quizResponse, flashCardsResponse] = await Promise.allSettled([
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/examples`),
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/abstract`),
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/quiz`),
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/flash_cards`)
        ]);

        if (examplesResponse.status === 'fulfilled' && examplesResponse.value.data.content) {
          console.log('Loaded examples from database cache');
          setExamplesContent(examplesResponse.value.data.content);
          setExamplesFromCache(true);
        }

        if (abstractResponse.status === 'fulfilled' && abstractResponse.value.data.content) {
          console.log('Loaded abstract from database cache');
          setAbstractContent(abstractResponse.value.data.content);
          setAbstractFromCache(true);
        }

        if (quizResponse.status === 'fulfilled' && quizResponse.value.data.content) {
          console.log('Loaded quiz from database cache');
          setQuizContent(quizResponse.value.data.content);
          setQuizFromCache(true);
        }

        if (flashCardsResponse.status === 'fulfilled' && flashCardsResponse.value.data.content) {
          console.log('Loaded flash cards from database cache');
          setFlashCardsContent(flashCardsResponse.value.data.content);
          setFlashCardsFromCache(true);
        }
      } catch (error) {
        console.log('No existing content found or error loading:', error.message);
        // This is normal on first load, so we don't show errors
      }
    };

    loadContent();
  }, [messageId, userId, tabContent]); // Add tabContent to dependencies

  // Function to generate examples content
  const generateExamples = async () => {
    if (examplesContent) {
      console.log('Examples content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating examples content via API call');
    setLoadingExamples(true);
    setErrorExamples(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/generate-examples`, {
        query: originalQuery,
        mainContent: mainContent,
        sessionId: sessionId,
        preferences: preferences,
        userId: userId,
        messageId: messageId
      });
      
      setExamplesContent(response.data.content || response.data.examples);
      setExamplesFromCache(response.data.from_cache || false);
      console.log('Examples generated successfully:', response.data.from_cache ? 'from cache' : 'newly generated');
    } catch (error) {
      console.error('Error generating examples:', error);
      setErrorExamples('Failed to generate examples. Please try again.');
    } finally {
      setLoadingExamples(false);
    }
  };

  // Function to generate abstract content
  const generateAbstract = async () => {
    if (abstractContent) {
      console.log('Abstract content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating abstract content via API call');
    setLoadingAbstract(true);
    setErrorAbstract(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/generate-abstract`, {
        query: originalQuery,
        mainContent: mainContent,
        sessionId: sessionId,
        preferences: preferences,
        userId: userId,
        messageId: messageId
      });
      
      setAbstractContent(response.data.content || response.data.abstract);
      setAbstractFromCache(response.data.from_cache || false);
      console.log('Abstract generated successfully:', response.data.from_cache ? 'from cache' : 'newly generated');
    } catch (error) {
      console.error('Error generating abstract:', error);
      setErrorAbstract('Failed to generate abstract content. Please try again.');
    } finally {
      setLoadingAbstract(false);
    }
  };

  // Function to generate quiz content
  const generateQuiz = async () => {
    if (quizContent) {
      console.log('Quiz content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating quiz content via API call');
    setLoadingQuiz(true);
    setErrorQuiz(null);
    
    try {
      const response = await generateQuizQuestions(originalQuery, {
        userId: userId,
        content: mainContent,
        difficultyLevel: preferences.technicalDepth > 75 ? 'hard' : preferences.technicalDepth > 40 ? 'medium' : 'easy'
      });
      
      setQuizContent(response);
      setQuizFromCache(false);
      console.log('Quiz generated successfully');
      
      // Reset quiz state when new quiz is generated
      setCurrentQuestionIndex(0);
      setSelectedAnswers({});
      setShowResults(false);
      setQuizScore(null);
    } catch (error) {
      console.error('Error generating quiz:', error);
      setErrorQuiz('Failed to generate quiz. Please try again.');
    } finally {
      setLoadingQuiz(false);
    }
  };

  // Function to generate flash cards content
  const generateFlashCards = async () => {
    if (flashCardsContent) {
      console.log('Flash cards content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating flash cards content via API call');
    setLoadingFlashCards(true);
    setErrorFlashCards(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/generate-flash-cards`, {
        query: originalQuery,
        mainContent: mainContent,
        sessionId: sessionId,
        preferences: preferences,
        userId: userId,
        messageId: messageId
      });
      
      setFlashCardsContent(response.data.cards);
      setFlashCardsFromCache(response.data.from_cache || false);
      console.log('Flash cards generated successfully:', response.data.from_cache ? 'from cache' : 'newly generated');
      
      // Reset flash cards state when new cards are generated
      setCurrentCardIndex(0);
      setIsCardFlipped(false);
    } catch (error) {
      console.error('Error generating flash cards:', error);
      setErrorFlashCards('Failed to generate flash cards. Please try again.');
    } finally {
      setLoadingFlashCards(false);
    }
  };

  // Handle tab changes and trigger API calls
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    
    if (tab === 'examples' && !examplesContent && !loadingExamples) {
      generateExamples();
    } else if (tab === 'abstract' && !abstractContent && !loadingAbstract) {
      generateAbstract();
    } else if (tab === 'quiz' && !quizContent && !loadingQuiz) {
      generateQuiz();
    } else if (tab === 'flash_cards' && !flashCardsContent && !loadingFlashCards) {
      generateFlashCards();
    }
  };

  // Quiz functionality
  const handleAnswerSelect = (questionIndex, answerIndex) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionIndex]: answerIndex
    }));
  };

  const handleQuizSubmit = () => {
    if (!quizContent || !quizContent.questions) return;
    
    let correctCount = 0;
    quizContent.questions.forEach((question, index) => {
      if (selectedAnswers[index] === question.correctAnswer) {
        correctCount++;
      }
    });
    
    const score = Math.round((correctCount / quizContent.questions.length) * 100);
    setQuizScore(score);
    setShowResults(true);
  };

  const resetQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
    setQuizScore(null);
  };

  // Flash cards functionality
  const flipCard = () => {
    setIsCardFlipped(!isCardFlipped);
  };

  const nextCard = () => {
    if (currentCardIndex < flashCardsContent.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsCardFlipped(false);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsCardFlipped(false);
    }
  };

  // Markdown components for consistent rendering
  const markdownComponents = {
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={tomorrow}
          language={match[1]}
          PreTag="div"
          className="rounded-md"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <div className="response-tabs-container">
      {/* Main Tab Navigation - Top Level */}
      <div className="border-b border-gray-200 mb-3">
        <nav className="-mb-px flex justify-center" aria-label="Main response tab">
          <button
            onClick={() => handleTabChange('main')}
            className={`py-4 px-6 border-b-3 font-bold text-base ${
              activeTab === 'main'
                ? 'border-primary-500 text-primary-700 bg-primary-50 rounded-t-lg shadow-sm'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
            } transition-all duration-200 transform hover:scale-105`}
            style={{ 
              fontSize: '1.1rem',
              fontWeight: activeTab === 'main' ? '700' : '600'
            }}
          >
            📋 Main Answer
          </button>
        </nav>
      </div>

      {/* Secondary Tabs Navigation - Bottom Level */}
      <div className="border-b border-gray-100 mb-4">
        <nav className="-mb-px flex space-x-6 justify-center" aria-label="Secondary response tabs">
          {/* Examples Tab */}
          <button
            onClick={() => handleTabChange('examples')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'examples'
                ? 'border-secondary-500 text-secondary-600 bg-secondary-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              examplesFromCache 
                ? 'Content loaded from cache' 
                : (examplesContent ? 'Content pre-generated' : 'Click to generate examples')
            }
          >
            💡 Examples
            {examplesFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {examplesContent && !examplesFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingExamples && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>
          
          {/* Abstract Tab */}
          <button
            onClick={() => handleTabChange('abstract')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'abstract'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              abstractFromCache 
                ? 'Content loaded from cache' 
                : (abstractContent ? 'Content pre-generated' : 'Click to generate abstract content')
            }
          >
            🎭 Abstract
            {abstractFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {abstractContent && !abstractFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingAbstract && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>

          {/* Quiz Tab */}
          <button
            onClick={() => handleTabChange('quiz')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'quiz'
                ? 'border-green-500 text-green-600 bg-green-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              quizFromCache 
                ? 'Content loaded from cache' 
                : (quizContent ? 'Content pre-generated' : 'Click to generate quiz')
            }
          >
            🧠 Quiz
            {quizFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {quizContent && !quizFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingQuiz && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>

          {/* Flash Cards Tab */}
          <button
            onClick={() => handleTabChange('flash_cards')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'flash_cards'
                ? 'border-pink-500 text-pink-600 bg-pink-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              flashCardsFromCache 
                ? 'Content loaded from cache' 
                : (flashCardsContent ? 'Content pre-generated' : 'Click to generate flash cards')
            }
          >
            🃏 Flash Cards
            {flashCardsFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {flashCardsContent && !flashCardsFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingFlashCards && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Main Tab Content */}
        {activeTab === 'main' && (
          <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
            <ReactMarkdown components={markdownComponents}>
              {mainContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Examples Tab Content */}
        {activeTab === 'examples' && (
          <div className="examples-content">
            {loadingExamples ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-secondary-600"></div>
                  <span className="text-gray-600">Generating examples...</span>
                </div>
              </div>
            ) : errorExamples ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorExamples}</p>
                    <button 
                      onClick={generateExamples}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : examplesContent ? (
              <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
                <ReactMarkdown components={markdownComponents}>
                  {examplesContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateExamples}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-secondary-600 hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500"
                >
                  Generate Examples
                </button>
              </div>
            )}
          </div>
        )}

        {/* Abstract Tab Content */}
        {activeTab === 'abstract' && (
          <div className="abstract-content">
            {loadingAbstract ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                  <span className="text-gray-600">Generating abstractions...</span>
                </div>
              </div>
            ) : errorAbstract ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorAbstract}</p>
                    <button 
                      onClick={generateAbstract}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : abstractContent ? (
              <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
                <ReactMarkdown components={markdownComponents}>
                  {abstractContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateAbstract}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Generate Abstractions
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quiz Tab Content */}
        {activeTab === 'quiz' && (
          <div className="quiz-content">
            {loadingQuiz ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  <span className="text-gray-600">Generating quiz...</span>
                </div>
              </div>
            ) : errorQuiz ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorQuiz}</p>
                    <button 
                      onClick={generateQuiz}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : quizContent ? (
              <div className="quiz-interface">
                {!showResults ? (
                  <div className="space-y-6">
                    {/* Quiz Header */}
                    <div className="text-center pb-4 border-b border-gray-200">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{quizContent.title}</h3>
                      {quizContent.description && (
                        <p className="text-gray-600">{quizContent.description}</p>
                      )}
                      <div className="mt-3 text-sm text-gray-500">
                        {Object.keys(selectedAnswers).length} of {quizContent.questions?.length || 0} questions answered
                      </div>
                    </div>

                    {/* Questions */}
                    <div className="space-y-6">
                      {quizContent.questions?.map((question, questionIndex) => (
                        <div key={questionIndex} className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3">
                            Question {questionIndex + 1}: {question.question}
                          </h4>
                          <div className="space-y-2">
                            {question.options?.map((option, optionIndex) => (
                              <button
                                key={optionIndex}
                                onClick={() => handleAnswerSelect(questionIndex, optionIndex)}
                                className={`w-full text-left p-3 rounded-md border transition-all duration-200 ${
                                  selectedAnswers[questionIndex] === optionIndex
                                    ? 'border-green-500 bg-green-50 text-green-800'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                <span className="font-medium text-sm text-gray-500 mr-2">
                                  {String.fromCharCode(65 + optionIndex)}.
                                </span>
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Submit Button */}
                    <div className="text-center pt-4">
                      <button
                        onClick={handleQuizSubmit}
                        disabled={Object.keys(selectedAnswers).length < (quizContent.questions?.length || 0)}
                        className={`px-6 py-3 rounded-md font-medium text-white transition-all duration-200 ${
                          Object.keys(selectedAnswers).length < (quizContent.questions?.length || 0)
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                        }`}
                      >
                        Submit Quiz
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Quiz Results */
                  <div className="quiz-results space-y-6">
                    {/* Score Display */}
                    <div className="text-center py-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border">
                      <div className="text-4xl font-bold text-green-600 mb-2">{quizScore}%</div>
                      <div className="text-lg text-gray-700">
                        You got {Object.values(selectedAnswers).filter((answer, index) => 
                          answer === quizContent.questions[index]?.correctAnswer
                        ).length} out of {quizContent.questions?.length || 0} questions correct!
                      </div>
                      <div className="mt-4">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          quizScore >= 80 ? 'bg-green-100 text-green-800' :
                          quizScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {quizScore >= 80 ? 'Excellent!' : quizScore >= 60 ? 'Good!' : 'Keep studying!'}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Results */}
                    <div className="space-y-4">
                      {quizContent.questions?.map((question, questionIndex) => {
                        const userAnswer = selectedAnswers[questionIndex];
                        const isCorrect = userAnswer === question.correctAnswer;
                        
                        return (
                          <div key={questionIndex} className={`rounded-lg border p-4 ${
                            isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                          }`}>
                            <div className="flex items-start space-x-2 mb-2">
                              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                                isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                              }`}>
                                {isCorrect ? '✓' : '✗'}
                              </span>
                              <div className="flex-1">
                                <h5 className="font-medium text-gray-900 mb-1">
                                  Question {questionIndex + 1}: {question.question}
                                </h5>
                                <div className="text-sm space-y-1">
                                  <div>
                                    <span className="text-gray-600">Your answer: </span>
                                    <span className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                                      {String.fromCharCode(65 + userAnswer)} - {question.options[userAnswer]}
                                    </span>
                                  </div>
                                  {!isCorrect && (
                                    <div>
                                      <span className="text-gray-600">Correct answer: </span>
                                      <span className="text-green-700">
                                        {String.fromCharCode(65 + question.correctAnswer)} - {question.options[question.correctAnswer]}
                                      </span>
                                    </div>
                                  )}
                                  {question.explanation && (
                                    <div className="mt-2 p-2 bg-blue-50 rounded text-blue-800 text-sm">
                                      <strong>Explanation:</strong> {question.explanation}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reset Button */}
                    <div className="text-center pt-4">
                      <button
                        onClick={resetQuiz}
                        className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                      >
                        Retake Quiz
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateQuiz}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Generate Quiz
                </button>
              </div>
            )}
          </div>
        )}

        {/* Flash Cards Tab Content */}
        {activeTab === 'flash_cards' && (
          <div className="flash-cards-content">
            {loadingFlashCards ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-600"></div>
                  <span className="text-gray-600">Generating flash cards...</span>
                </div>
              </div>
            ) : errorFlashCards ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorFlashCards}</p>
                    <button 
                      onClick={generateFlashCards}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : flashCardsContent && flashCardsContent.length > 0 ? (
              <div className="flash-cards-interface">
                {/* Flash Cards Header */}
                <div className="text-center pb-4 border-b border-gray-200 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Flash Cards</h3>
                  <p className="text-gray-600">Card {currentCardIndex + 1} of {flashCardsContent.length}</p>
                </div>

                {/* Flash Card */}
                <div className="flex justify-center mb-6">
                  <div 
                    className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl shadow-lg p-8 min-h-[300px] w-full max-w-lg flex items-center justify-center cursor-pointer transform transition-transform duration-300 hover:scale-105 border border-pink-200"
                    onClick={flipCard}
                  >
                    <div className="text-center">
                      {!isCardFlipped ? (
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Question:</h4>
                          <p className="text-gray-700 text-base leading-relaxed">
                            {flashCardsContent[currentCardIndex].question}
                          </p>
                          <p className="text-sm text-pink-600 mt-6 font-medium">(Click to see answer)</p>
                        </div>
                      ) : (
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 mb-4">Answer:</h4>
                          <p className="text-gray-700 text-base leading-relaxed">
                            {flashCardsContent[currentCardIndex].answer}
                          </p>
                          <p className="text-sm text-pink-600 mt-6 font-medium">(Click to see question)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={prevCard}
                    disabled={currentCardIndex === 0}
                    className="px-6 py-2 bg-pink-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 transition-colors duration-200"
                  >
                    ← Previous
                  </button>
                  
                  <div className="flex space-x-2">
                    {flashCardsContent.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setCurrentCardIndex(index);
                          setIsCardFlipped(false);
                        }}
                        className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                          index === currentCardIndex
                            ? 'bg-pink-600'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        title={`Go to card ${index + 1}`}
                      />
                    ))}
                  </div>
                  
                  <button
                    onClick={nextCard}
                    disabled={currentCardIndex === flashCardsContent.length - 1}
                    className="px-6 py-2 bg-pink-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 transition-colors duration-200"
                  >
                    Next →
                  </button>
                </div>

                {/* Study Tips */}
                <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">📚 Study Tips:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Try to answer each question before flipping the card</li>
                    <li>• Review cards you found difficult multiple times</li>
                    <li>• Use spaced repetition for better long-term retention</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateFlashCards}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
                >
                  Generate Flash Cards
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponseTabs; 