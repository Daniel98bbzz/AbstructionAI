import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ConversationHistory from '../components/ConversationHistory';
import FeedbackForm from '../components/FeedbackForm';

function QueryPage() {
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
      
      // Log the sessionId being used for the query
      console.log('Submitting query with sessionId:', sessionId || 'none (will create new)');
      
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
        timestamp: new Date().toISOString()
      };
      
      const updatedMessages = [...messages, userMessage, aiMessage];
      setMessages(updatedMessages);
      
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
      
      // Show feedback for this message
      setShowFeedbackFor(responseId);
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
    // Clear the feedback form for this message
    setShowFeedbackFor(null);
  };

  // Handle regenerating an answer based on feedback
  const handleRegenerateAnswer = async (messageId, feedbackData) => {
    try {
      setRegenerating(true);
      
      // Find the original query that generated this response
      const responseIndex = messages.findIndex(msg => msg.id === messageId);
      if (responseIndex === -1) {
        throw new Error('Could not find the original message to regenerate');
      }
      
      // Find the most recent user query before this response
      let userQuery = '';
      for (let i = responseIndex - 1; i >= 0; i--) {
        if (messages[i].type === 'user') {
          userQuery = messages[i].content;
          break;
        }
      }
      
      if (!userQuery) {
        throw new Error('Could not find the original query for this response');
      }
      
      console.log(`Regenerating answer for message ${messageId} with original query: "${userQuery}"`);
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
        messageId,
        feedbackData,
        preferences
      );
      
      console.log('Received regenerated response:', response);

      // Remove the regenerating message
      setMessages(prev => prev.filter(m => m !== regeneratingMsg));

      // Add the regenerated response
      const regeneratedResponseId = response.id || Date.now().toString();
      
      // Find the original message to preserve its explanation if we're only changing the analogy
      const originalMessage = messages.find(msg => msg.id === messageId);
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

    } catch (error) {
      console.error('Error regenerating answer:', error);
      // Add error message
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
              
              {/* Feedback form below AI responses */}
              {message.type === 'assistant' && showFeedbackFor === message.id && (
                <div className="mt-3 ml-4 mr-4">
                  <FeedbackForm 
                    responseId={message.id} 
                    onFeedbackSubmitted={() => handleFeedbackSubmitted(message.id)}
                    onRegenerateAnswer={(feedbackData) => handleRegenerateAnswer(message.id, feedbackData)}
                    originalQuery={
                      // Find the user query that preceded this message
                      messages.find((m, idx) => {
                        const msgIndex = messages.findIndex(msg => msg.id === message.id);
                        return idx < msgIndex && m.type === 'user';
                      })?.content || ''
                    }
                    preferences={preferences}
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
    </div>
  );
}

export default QueryPage;