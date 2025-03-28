import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ConversationHistory from '../components/ConversationHistory';
import FeedbackForm from '../components/FeedbackForm';
import { supabase } from '../lib/supabaseClient';
import QueryToQuiz from '../components/QueryToQuiz';
import { generateQuizQuestions as generateQuizAPI } from '../api/quizApi';
import { toast } from 'react-hot-toast';

function QueryPage() {
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [activeQuizMessage, setActiveQuizMessage] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState(() => {
    // Try to load preferences from localStorage with user namespace
    const key = user ? `userPreferences_${user.id}` : 'userPreferences';
    const savedPreferences = localStorage.getItem(key);
    return savedPreferences ? JSON.parse(savedPreferences) : {
      visualLearning: 50,
      practicalExamples: 50,
      technicalDepth: 50,
    };
  });
  const [messages, setMessages] = useState(() => {
    // Try to load messages from localStorage with user namespace
    const key = user ? `currentMessages_${user.id}` : 'currentMessages';
    const savedMessages = localStorage.getItem(key);
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [conversations, setConversations] = useState(() => {
    // Try to load conversations from localStorage with user namespace
    const key = user ? `conversations_${user.id}` : 'conversations';
    const savedConversations = localStorage.getItem(key);
    return savedConversations ? JSON.parse(savedConversations) : [];
  });
  const [activeConversation, setActiveConversation] = useState(() => {
    // Try to load active conversation from localStorage with user namespace
    const key = user ? `activeConversation_${user.id}` : 'activeConversation';
    return localStorage.getItem(key) || null;
  });
  const [showFeedbackFor, setShowFeedbackFor] = useState(() => {
    // Try to load feedback state from localStorage with user namespace
    const key = user ? `showFeedbackFor_${user.id}` : 'showFeedbackFor';
    return localStorage.getItem(key) || null;
  });
  const [activeFeedbackMessage, setActiveFeedbackMessage] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const messagesEndRef = useRef(null);
  const { submitQuery, loading, error, regenerateAnswer, currentSession } = useQuery();
  
  // Set sessionId from the current session in the QueryContext or from localStorage
  const [sessionId, setSessionId] = useState(() => {
    if (user) {
      // First try to load from localStorage
      const savedSessionId = localStorage.getItem(`sessionId_${user.id}`);
      // Fall back to currentSession from context if available
      return savedSessionId || currentSession?.id || null;
    }
    return currentSession?.id || null;
  });
  
  // Update sessionId when currentSession changes
  useEffect(() => {
    if (currentSession?.id) {
      console.log('Setting sessionId from currentSession:', currentSession.id);
      setSessionId(currentSession.id);
    }
  }, [currentSession]);
  
  // Persist sessionId to localStorage whenever it changes
  useEffect(() => {
    if (user && sessionId) {
      localStorage.setItem(`sessionId_${user.id}`, sessionId);
    } else if (user) {
      localStorage.removeItem(`sessionId_${user.id}`);
    }
  }, [sessionId, user]);
  
  // Persist preferences whenever they change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`userPreferences_${user.id}`, JSON.stringify(preferences));
    }
  }, [preferences, user]);
  
  // Persist messages whenever they change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`currentMessages_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);
  
  // Persist conversations whenever they change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`conversations_${user.id}`, JSON.stringify(conversations));
    }
  }, [conversations, user]);
  
  // Persist active conversation whenever it changes
  useEffect(() => {
    if (user) {
      if (activeConversation) {
        localStorage.setItem(`activeConversation_${user.id}`, activeConversation);
      } else {
        localStorage.removeItem(`activeConversation_${user.id}`);
      }
    }
  }, [activeConversation, user]);
  
  // Save showFeedbackFor state to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      if (showFeedbackFor) {
        localStorage.setItem(`showFeedbackFor_${user.id}`, showFeedbackFor);
      } else {
        localStorage.removeItem(`showFeedbackFor_${user.id}`);
      }
    }
  }, [showFeedbackFor, user]);
  
  // Load user-specific data when user changes
  useEffect(() => {
    if (user) {
      // Load preferences
      const savedPreferences = localStorage.getItem(`userPreferences_${user.id}`);
      if (savedPreferences) {
        setPreferences(JSON.parse(savedPreferences));
      }
      
      // Load messages
      const savedMessages = localStorage.getItem(`currentMessages_${user.id}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        setMessages([]);
      }
      
      // Load conversations
      const savedConversations = localStorage.getItem(`conversations_${user.id}`);
      if (savedConversations) {
        setConversations(JSON.parse(savedConversations));
      } else {
        setConversations([]);
      }
      
      // Load active conversation
      const savedActiveConversation = localStorage.getItem(`activeConversation_${user.id}`);
      setActiveConversation(savedActiveConversation || null);
      
      // Load feedback state
      const savedFeedbackFor = localStorage.getItem(`showFeedbackFor_${user.id}`);
      if (savedFeedbackFor) {
        setShowFeedbackFor(savedFeedbackFor);
      }
      
      // Load session ID
      const savedSessionId = localStorage.getItem(`sessionId_${user.id}`);
      if (savedSessionId) {
        setSessionId(savedSessionId);
      }
    }
  }, [user?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      // Cleanup function
      setShowFeedbackFor(null);
      setActiveFeedbackMessage(null);
    };
  }, []);

  const handlePreferenceChange = (e) => {
    const { name, value } = e.target;
    setPreferences(prev => ({ ...prev, [name]: parseInt(value, 10) }));
  };

  const generateTitle = (message) => {
    // Remove common question words and get the first meaningful part
    const words = message.toLowerCase().split(' ');
    const skipWords = ['what', 'how', 'why', 'when', 'where', 'who', 'explain', 'tell', 'me', 'about', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'to'];
    const meaningfulWords = words.filter(word => !skipWords.includes(word));
    
    if (meaningfulWords.length === 0) return 'New Conversation';
    
    // Take up to 3 meaningful words and capitalize them
    const title = meaningfulWords
      .slice(0, 3)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return title;
  };

  const handleNewConversation = () => {
    // Create a unique ID for the new conversation
    const newConversationId = Date.now().toString();
    
    // Create the new conversation object
    const newConversation = {
      id: newConversationId,
      title: 'New Conversation',
      messages: [],
      lastMessageTime: new Date().toISOString(),
      // Preserve the sessionId for continuity
      sessionId: sessionId
    };
    
    // Add the new conversation to the list
    setConversations(prev => [newConversation, ...prev]);
    
    // Set it as the active conversation
    setActiveConversation(newConversationId);
    
    // Clear the messages for this new conversation
    setMessages([]);
    
    // Don't clear the sessionId if it exists - we'll keep using the same session
    // but if we want a completely fresh session, uncomment the next line
    // setSessionId(null);
    
    // Reset the UI state and clear feedback form
    setShowFeedbackFor(null);
    setQuery('');
    
    // Clear localStorage for the current messages and feedback state
    if (user) {
      localStorage.removeItem(`currentMessages_${user.id}`);
      localStorage.removeItem(`showFeedbackFor_${user.id}`);
      
      // Store the current state
      localStorage.setItem(`activeConversation_${user.id}`, newConversationId);
      localStorage.setItem(`conversations_${user.id}`, JSON.stringify([newConversation, ...conversations]));
      
      // Keep the sessionId in localStorage
      if (sessionId) {
        localStorage.setItem(`sessionId_${user.id}`, sessionId);
      }
    }
  };

  const handleSelectConversation = (conversationId) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      setActiveConversation(conversationId);
      setMessages(conversation.messages);
      setSessionId(conversation.sessionId);
      
      // Reset feedback form when switching conversations
      setShowFeedbackFor(null);
      setActiveFeedbackMessage(null);
      if (user) {
        localStorage.removeItem(`showFeedbackFor_${user.id}`);
      }
    }
  };

  const handleQueryChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // If this is the first message in a new conversation, create it
    if (!activeConversation && newQuery.trim()) {
      const newConversation = {
        id: Date.now().toString(),
        title: generateTitle(newQuery),
        messages: [],
        lastMessageTime: new Date().toISOString(),
      };
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversation(newConversation.id);
    }
    // If we have an active conversation and it's still titled "New Conversation", update its title
    else if (activeConversation && newQuery.trim()) {
      const currentConversation = conversations.find(c => c.id === activeConversation);
      if (currentConversation && currentConversation.title === 'New Conversation') {
        setConversations(prev => prev.map(conv => {
          if (conv.id === activeConversation) {
            return {
              ...conv,
              title: generateTitle(newQuery)
            };
          }
          return conv;
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    // If no active conversation exists, create one
    if (!activeConversation) {
      const newConversation = {
        id: Date.now().toString(),
        title: generateTitle(query),
        messages: [],
        lastMessageTime: new Date().toISOString(),
      };
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversation(newConversation.id);
    }
    
    // Add user message immediately
    const userMessage = {
      type: 'user',
      content: query,
      timestamp: new Date().toISOString()
    };
    
    // Update messages and conversation
    setMessages(prev => [...prev, userMessage]);
    
    try {
      // Clear input
      setQuery('');
      
      // If we don't have a session ID yet, try to get it from the context
      if (!sessionId && currentSession?.id) {
        console.log('Using session ID from context:', currentSession.id);
        setSessionId(currentSession.id);
      }
      
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
    
      // Get AI response using the existing session ID if available
      const response = await submitQuery(query, preferences, sessionId);
      
      // Store the session ID if this is the first message
      if (response.sessionId) {
        console.log('Received sessionId in response:', response.sessionId);
        setSessionId(response.sessionId);
        
        // Also update the conversation with the session ID
        setConversations(prev => prev.map(conv => {
          if (conv.id === activeConversation) {
            return {
              ...conv,
              sessionId: response.sessionId
            };
          }
          return conv;
        }));
      }
      
      // Add AI response with unique ID for feedback
      const responseId = response.id || Date.now().toString();
      const aiMessage = {
        id: responseId,
        type: 'assistant',
        content: response.explanation,
        introduction: response.introduction,
        analogy: response.analogy,
        resources: response.resources,
        recap: response.recap,
        timestamp: new Date().toISOString(),
        messageId: responseId // Add messageId to the message object
      };
      
      const updatedMessages = [...messages, userMessage, aiMessage];
      setMessages(updatedMessages);
      
      // First, store the user prompt
      const { data: promptData, error: promptError } = await supabase
        .from('user_prompts')
        .insert({
          user_id: user.id,
          prompt_text: query,
          category: response.category,
          metadata: {
            session_id: response.sessionId,
            difficulty_level: response.difficulty_level,
            conversation_id: activeConversation
          }
        })
        .select()
        .single();
    
      if (promptError) throw promptError;
    
      // Then, store the query with the prompt_id
      const { data: queryData, error: queryError } = await supabase
        .from('queries')
        .insert({
          user_id: user.id,
          query: query,
          response: response,
          explanation: response.explanation,
          category: response.category,
          difficulty_level: response.difficulty_level,
          prompt_id: promptData.id
        })
        .select()
        .single();
    
      if (queryError) throw queryError;
    
      // Update the user_prompts with the query_id
      const { error: updatePromptError } = await supabase
        .from('user_prompts')
        .update({ query_id: queryData.id })
        .eq('id', promptData.id);
    
      if (updatePromptError) throw updatePromptError;
      
      // Update conversations with a more descriptive title based on the AI response
      setConversations(prev => prev.map(conv => {
        if (conv.id === activeConversation) {
          // Use the AI suggested title if available, otherwise create one from the introduction
          let betterTitle = response.suggested_title || conv.title;
          
          // If no suggested title but we have an introduction, create one from that
          if (!betterTitle && response.introduction) {
            const introContent = response.introduction.trim();
            // Extract the first sentence or up to 40 chars for the title
            const firstSentence = introContent.split(/[.!?]/)[0].trim();
            betterTitle = firstSentence.length > 40 
              ? firstSentence.substring(0, 40) + '...' 
              : firstSentence;
          }
          
          return {
            ...conv,
            title: betterTitle || conv.title,
            messages: updatedMessages,
            lastMessageTime: new Date().toISOString(),
          };
        }
        return conv;
      }));
      
      setShowFeedbackFor(responseId);
      setActiveFeedbackMessage(responseId);
      console.log('Showing feedback form for message:', responseId, 'with session:', sessionId);
    } catch (error) {
      console.error('Error processing query:', error);
      // Add error message
      const errorMessage = {
        type: 'error',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Handle feedback submission complete
  const handleFeedbackSubmitted = (messageId) => {
    console.log('Feedback submitted successfully for message:', messageId);
    setShowFeedbackFor(null);
    setActiveFeedbackMessage(null);
    
    // Don't affect active quiz state here
    
    // Also clear from localStorage if stored
    if (user) {
      localStorage.removeItem(`showFeedbackFor_${user.id}`);
    }
  };

  // Handle regenerating an answer based on feedback
  const handleRegenerateAnswer = async (feedbackData) => {
    // Save current quiz state
    const quizMessageId = activeQuizMessage;
    
    try {
      setRegenerating(true);
      
      // Find the most recent assistant message
      const lastAssistantMessage = messages.find(msg => msg.type === 'assistant');
      if (!lastAssistantMessage) {
        throw new Error('Could not find the original message to regenerate');
      }
      
      // Find the most recent user query before this response
      const userMessageIndex = messages.findIndex(msg => msg.id === lastAssistantMessage.id) - 1;
      if (userMessageIndex < 0) {
        throw new Error('Could not find the original query for this response');
      }
      
      const userQuery = messages[userMessageIndex].content;
      
      console.log(`Regenerating answer for message ${lastAssistantMessage.id} with original query: "${userQuery}"`);
      console.log('Feedback data:', feedbackData);
      
      // Temporarily show a message about regeneration
      const regeneratingMsg = {
        type: 'system',
        content: 'Regenerating answer based on your feedback...',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, regeneratingMsg]);

      // Call the regenerateAnswer function
      console.log('Calling regenerateAnswer with preferences:', preferences);
      const response = await regenerateAnswer(
        userQuery,
        lastAssistantMessage.id,
        feedbackData,
        preferences
      );
      
      console.log('Received regenerated response:', response);

      // Remove the regenerating message
      setMessages(prev => prev.filter(m => m !== regeneratingMsg));

      // Add the regenerated response
      const regeneratedResponseId = response.id || Date.now().toString();
      
      // Find the original message to preserve its explanation if we're only changing the analogy
      const originalMessage = messages.find(msg => msg.id === lastAssistantMessage.id);
      const isOnlyAnalogyFeedback = originalMessage && 
                                 (feedbackData.analogyHelpful === 'no' || 
                                  feedbackData.analogyHelpful === 'partially' || 
                                  feedbackData.analogyPreference) &&
                                 feedbackData.explanationClear === 'yes' &&
                                 feedbackData.explanationDetail === 'exactly_right';
                                 
      const regeneratedMessage = {
        id: regeneratedResponseId,
        type: 'assistant',
        // Only preserve the original explanation if ONLY the analogy feedback was given
        content: isOnlyAnalogyFeedback ? originalMessage.content : response.explanation,
        introduction: response.introduction,
        analogy: response.analogy,
        resources: response.resources,
        recap: response.recap,
        isRegenerated: true,
        timestamp: new Date().toISOString()
      };

      console.log('Adding regenerated message to conversation');
      setMessages(prev => [...prev, regeneratedMessage]);

      // Update the conversation
      setConversations(prev => prev.map(conv => {
        if (conv.id === activeConversation) {
          // Update the title if we got a suggested title from the regenerated response
          const updatedTitle = response.suggested_title 
            ? response.suggested_title 
            : conv.title;
            
          return {
            ...conv,
            title: updatedTitle,
            messages: [...messages, regeneratedMessage],
            lastMessageTime: new Date().toISOString(),
          };
        }
        return conv;
      }));

      // Show feedback for the new message after a delay
      setTimeout(() => {
        setShowFeedbackFor(regeneratedResponseId);
      }, 1000);

      // After regeneration completes, restore quiz state if it was active
      if (quizMessageId) {
        setTimeout(() => {
          setActiveQuizMessage(quizMessageId);
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error regenerating answer:', error);
      const errorMessage = {
        type: 'error',
        content: 'Sorry, there was an error regenerating the answer. Please try again. Error: ' + (error.message || ''),
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setRegenerating(false);
    }
  };

  // Update the generateQuizQuestions function
  const generateQuizQuestions = async (topic) => {
    try {
      const lastAssistantMessage = messages
        .filter(msg => msg.type === 'assistant')
        .pop();
        
      if (!lastAssistantMessage) {
        console.error('No assistant messages found to generate quiz from');
        return;
      }
      
      try {
        // Try the API first
        const response = await generateQuizAPI(lastAssistantMessage.content, {
          difficultyLevel: 'medium',
          userId: user?.id,
          content: lastAssistantMessage.content
        });
        
        if (!response || !response.questions) {
          throw new Error('Invalid quiz response format');
        }
        
        const questions = response.questions.map(q => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctAnswer,
          explanation: q.explanation
        }));
        
        setQuizQuestions(questions);
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
        setQuizScore(0);
        setQuizMode(true);
        
      } catch (apiError) {
        console.warn('API failed, falling back to local generation:', apiError);
        setIsUsingFallback(true);
        toast.warning('Using offline quiz mode due to API unavailability');
        
        // Fallback to local generation when API fails
        const mockQuestions = generateLocalQuestions(lastAssistantMessage.content);
        setQuizQuestions(mockQuestions);
        setCurrentQuestionIndex(0);
        setSelectedAnswer(null);
        setQuizScore(0);
        setQuizMode(true);
      }
      
    } catch (error) {
      console.error('Error generating quiz:', error);
      toast.error('Failed to generate quiz. Please try again.');
    }
  };

  // Add this helper function for local question generation
  const generateLocalQuestions = (content) => {
    // Extract key phrases from content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const questions = [];
    
    // Generate questions from content
    for (let i = 0; i < Math.min(5, sentences.length); i++) {
      const sentence = sentences[i].trim();
      // Find a key term to ask about
      const words = sentence.split(' ').filter(w => w.length > 4);
      const keyTerm = words[Math.floor(Math.random() * words.length)];
      
      questions.push({
        question: `Based on the explanation, what is the significance of ${keyTerm}?`,
        options: [
          sentence, // Correct answer is the original sentence
          `${keyTerm} is not relevant to this topic`,
          `${keyTerm} is a minor detail that can be ignored`,
          `${keyTerm} is only used in theoretical scenarios`
        ],
        correctIndex: 0,
        explanation: `This is directly stated in the original explanation: "${sentence}"`
      });
    }
    
    return questions;
  };

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
    if (answerIndex === quizQuestions[currentQuestionIndex].correctIndex) {
      setQuizScore(prevScore => prevScore + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      setSelectedAnswer(null);
    } else {
      alert(`Quiz complete! Your score: ${quizScore}/${quizQuestions.length}`);
      setQuizMode(false);
    }
  };

  const handleExitQuiz = () => {
    setQuizMode(false);
    setQuizQuestions([]);
  };

  useEffect(() => {
    // If there's an active quiz and we're regenerating, keep the quiz visible
    if (activeQuizMessage && regenerating) {
      const timer = setTimeout(() => {
        setActiveQuizMessage(activeQuizMessage);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [regenerating, activeQuizMessage]);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Please Log In</h2>
          <p className="text-gray-600 mb-6">You need to be logged in to submit queries and get personalized responses.</p>
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

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Conversation History Sidebar */}
      <ConversationHistory
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div key={index}>
              <div
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-lg p-4 ${
                    message.type === 'user'
                      ? 'bg-primary-600 text-white'
                      : message.type === 'error'
                      ? 'bg-red-100 text-red-700'
                      : message.type === 'system'
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-white shadow'
                  }`}
                >
                  {message.type === 'assistant' ? (
                    <div className="space-y-4">
                      {message.isRegenerated && (
                        <div className="text-sm text-green-600 font-medium mb-2">
                          Improved answer based on your feedback:
                        </div>
                      )}
                      
                      {/* Introduction Section */}
                      {message.introduction && (
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Introduction:</h4>
                          <div className="prose max-w-none">
                            {message.introduction}
                          </div>
                        </div>
                      )}
                      
                      {/* Main Explanation */}
                      <div>
                        <h4 className="font-medium text-gray-900 mt-4 mb-2">Explanation:</h4>
                        <div className="prose max-w-none">
                          {message.content}
                        </div>
                      </div>
                      
                      {/* Analogy Section */}
                      {message.analogy && (
                        <div>
                          <h4 className="font-medium text-gray-900 mt-4 mb-2">Analogy:</h4>
                          <div className="prose max-w-none">
                            {message.analogy}
                          </div>
                        </div>
                      )}
                      
                      {/* Resources Section */}
                      {message.resources && message.resources.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 mt-4 mb-2">Additional Resources:</h4>
                          <ul className="list-disc pl-5 space-y-1">
                            {message.resources.map((resource, idx) => (
                              <li key={idx}>
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary-600 hover:text-primary-500"
                                >
                                  {resource.title}
                                </a>
                                {resource.description && (
                                  <p className="text-sm text-gray-500">{resource.description}</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Recap Section */}
                      {message.recap && (
                        <div>
                          <h4 className="font-medium text-gray-900 mt-4 mb-2">Brief Recap:</h4>
                          <div className="prose max-w-none">
                            {message.recap}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="prose max-w-none">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>
                    {/* Quiz Generation Option */}
              {message.type === 'assistant' && (
                <div className="mt-4 relative" style={{ zIndex: activeQuizMessage === message.id ? 10 : 1 }}>
                  <QueryToQuiz 
                    key={`quiz-${message.id}`}
                    query={messages.find(m => m.type === 'user' && m.timestamp < message.timestamp)?.content || ''}
                    responseContent={message.content}
                    onQuizStart={() => {
                      console.log('Quiz started for message:', message.id);
                      setActiveQuizMessage(message.id);
                      // Hide any feedback forms when quiz starts
                      setShowFeedbackFor(null);
                      setActiveFeedbackMessage(null);
                    }}
                    onQuizEnd={() => {
                      console.log('Quiz ended for message:', message.id);
                      setActiveQuizMessage(null);
                    }}
                    isActive={activeQuizMessage === message.id}
                    alwaysVisible={true} // Add this prop to always show the quiz button
                  />
                </div>
              )}

              {/* Feedback form below AI responses */}
              {message.type === 'assistant' && showFeedbackFor === message.id && activeFeedbackMessage === message.id && !activeQuizMessage && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <FeedbackForm
                    key={`feedback-${message.id}`}
                    responseId={message.id}
                    onFeedbackSubmitted={handleFeedbackSubmitted}
                    originalQuery={messages.find(m => m.type === 'user' && 
                      messages.indexOf(m) < messages.indexOf(message))?.content || ''}
                    preferences={preferences}
                    onRegenerateAnswer={handleRegenerateAnswer}
                    sessionId={sessionId}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input container */}
        <div className="border-t bg-white p-4">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="flex space-x-4">
              <div className="flex-1">
                <textarea
                  rows="1"
                  className="w-full rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 resize-none"
                  placeholder="Type your message..."
                  value={query}
                  onChange={handleQueryChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  disabled={loading || regenerating}
                />
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="submit"
                  disabled={loading || regenerating || !query.trim()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                >
                  {loading || regenerating ? (
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => generateQuizQuestions(query.trim() || 'this topic')}
                  disabled={loading || regenerating || !messages.some(m => m.type === 'assistant')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-secondary-600 hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500 disabled:opacity-50"
                >
                  <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Quiz Me
                </button>
              </div>
            </form>
            
            <div className="mt-2">
              <button
                type="button"
                className="text-sm text-primary-600 hover:text-primary-500"
                onClick={() => setShowPreferences(!showPreferences)}
              >
                {showPreferences ? 'Hide' : 'Show'} Learning Preferences
              </button>
              
              {showPreferences && (
                <div className="mt-4 p-4 bg-gray-50 rounded-md">
                  <h3 className="text-sm font-medium text-gray-700">Customize this explanation</h3>
                  
                  <div className="mt-4">
                    <label htmlFor="visualLearning" className="block text-xs font-medium text-gray-700">
                      Visual Learning
                    </label>
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-gray-500 w-24">Text-based</span>
                      <input
                        type="range"
                        id="visualLearning"
                        name="visualLearning"
                        min="0"
                        max="100"
                        value={preferences.visualLearning}
                        onChange={handlePreferenceChange}
                        className="flex-grow mx-4"
                      />
                      <span className="text-xs text-gray-500 w-24 text-right">Visual</span>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label htmlFor="practicalExamples" className="block text-xs font-medium text-gray-700">
                      Practical Examples
                    </label>
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-gray-500 w-24">Theoretical</span>
                      <input
                        type="range"
                        id="practicalExamples"
                        name="practicalExamples"
                        min="0"
                        max="100"
                        value={preferences.practicalExamples}
                        onChange={handlePreferenceChange}
                        className="flex-grow mx-4"
                      />
                      <span className="text-xs text-gray-500 w-24 text-right">Practical</span>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label htmlFor="technicalDepth" className="block text-xs font-medium text-gray-700">
                      Technical Depth
                    </label>
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-gray-500 w-24">Simplified</span>
                      <input
                        type="range"
                        id="technicalDepth"
                        name="technicalDepth"
                        min="0"
                        max="100"
                        value={preferences.technicalDepth}
                        onChange={handlePreferenceChange}
                        className="flex-grow mx-4"
                      />
                      <span className="text-xs text-gray-500 w-24 text-right">Technical</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add quiz UI */}
      {quizMode && quizQuestions.length > 0 && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 m-4">
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
            
            <p className="text-gray-800 mb-4">
              {quizQuestions[currentQuestionIndex].question}
            </p>
            
            <div className="space-y-3 mb-6">
              {quizQuestions[currentQuestionIndex].options.map((option, index) => (
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
                className="px-4 py-2 bg-primary-600 text-white rounded-md disabled:opacity-50"
              >
                {currentQuestionIndex < quizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QueryPage;