import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ConversationHistory from '../components/ConversationHistory';
import FeedbackForm from '../components/FeedbackForm';
import Chat from '../components/Chat';
import { supabase } from '../lib/supabaseClient';

// Add this utility function at the top of the file, after the imports
const isValidUUID = (uuid) => {
  // Regular expression to check if string is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

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
  const { 
    submitQuery, 
    loading, 
    error,
    setError,
    regenerateAnswer, 
    currentSession,
    loadConversationHistory,
    messageHistory,
    setMessageHistory,
    startNewSession,
    loadConversations
  } = useQuery();
  
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
  
  // Update the useEffect that loads conversations
  useEffect(() => {
    if (user) {
      const loadAndValidateConversations = async () => {
        try {
          // Load and validate conversations
          const validConversations = await loadConversations();
          setConversations(validConversations);

          // Handle active conversation
          const activeId = localStorage.getItem(`activeConversation_${user.id}`);
          if (activeId && validConversations.some(conv => conv.id === activeId)) {
            setActiveConversation(activeId);
            // Load the conversation history for the active conversation
            const activeConv = validConversations.find(conv => conv.id === activeId);
            if (activeConv) {
              await loadConversationHistory(activeConv.sessionId);
            }
          } else if (activeId) {
            // If active conversation was invalid, clear it
            localStorage.removeItem(`activeConversation_${user.id}`);
            setActiveConversation(null);
          }
        } catch (error) {
          console.error('Error loading conversations:', error);
          setError('Failed to load conversations. Please refresh the page.');
        }
      };

      loadAndValidateConversations();
    }
  }, [user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [query]);

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

  const handleNewConversation = async () => {
    try {
      // Start new session first and wait for it to complete
      const session = await startNewSession();
      if (!session?.id) {
        throw new Error('Failed to create new session');
      }

      // Create new conversation with the confirmed session ID
      const newConversation = {
        id: Date.now().toString(),
        title: 'New Conversation',
        messages: [],
        lastMessageTime: new Date().toISOString(),
        sessionId: session.id  // Now we have a guaranteed valid session ID
      };

      // Update state and localStorage atomically
      const updatedConversations = [newConversation, ...conversations];
      setConversations(updatedConversations);
      setActiveConversation(newConversation.id);
      setMessageHistory([]);

      if (user) {
        localStorage.setItem(`conversations_${user.id}`, JSON.stringify(updatedConversations));
        localStorage.setItem(`activeConversation_${user.id}`, newConversation.id);
      }
    } catch (error) {
      console.error('Error creating new conversation:', error);
      setError('Failed to create new conversation. Please try again.');
    }
  };

  const handleSelectConversation = async (conversationId) => {
    try {
      // Find the selected conversation
      const selectedConv = conversations.find(conv => conv.id === conversationId);
      if (!selectedConv) {
        throw new Error('Conversation not found');
      }
      
      // Set the active conversation first
      setActiveConversation(conversationId);
      
      // Clear current messages
      setMessageHistory([]);
      
      // Get the session ID from the conversation
      const sessionId = selectedConv.sessionId;
      
      if (!sessionId) {
        throw new Error('No session ID found for this conversation');
      }

      if (!isValidUUID(sessionId)) {
        throw new Error('Invalid session ID format');
      }

      // Load conversation history
      await loadConversationHistory(sessionId);
      
    } catch (err) {
      console.error('Error selecting conversation:', err);
      setError(err.message || 'Failed to load conversation history');
      setMessageHistory([]);
      
      // Remove invalid conversation from the list
      const updatedConversations = conversations.filter(conv => conv.id !== conversationId);
      setConversations(updatedConversations);
      
      if (user) {
        localStorage.setItem(`conversations_${user.id}`, JSON.stringify(updatedConversations));
      }
    }
  };

  const handleQueryChange = async (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // If this is the first message in a new conversation, create it
    if (!activeConversation && newQuery.trim()) {
      try {
        // Start new session first
        const session = await startNewSession();
        if (!session?.id) {
          throw new Error('Failed to create new session');
        }

        // Create new conversation with the confirmed session ID
        const newConversation = {
          id: Date.now().toString(),
          title: generateTitle(newQuery),
          messages: [],
          lastMessageTime: new Date().toISOString(),
          sessionId: session.id  // Now we have a guaranteed valid session ID
        };

        // Update state and localStorage atomically
        const updatedConversations = [newConversation, ...conversations];
        setConversations(updatedConversations);
        setActiveConversation(newConversation.id);

        if (user) {
          localStorage.setItem(`conversations_${user.id}`, JSON.stringify(updatedConversations));
          localStorage.setItem(`activeConversation_${user.id}`, newConversation.id);
        }
      } catch (error) {
        console.error('Error creating new conversation:', error);
        setError('Failed to create new conversation. Please try again.');
      }
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

    try {
      // Get the current conversation
      const currentConv = conversations.find(conv => conv.id === activeConversation);
      if (!currentConv) {
        throw new Error('No active conversation found');
      }

      // Only create a new session if the conversation doesn't have one
      if (!currentConv.sessionId) {
        const session = await startNewSession();
        if (!session?.id) {
          throw new Error('Failed to create new session');
        }
        
        // Update the conversation with the new session ID
        const updatedConversations = conversations.map(conv => {
          if (conv.id === activeConversation) {
            return { ...conv, sessionId: session.id };
          }
          return conv;
        });
        setConversations(updatedConversations);
        if (user) {
          localStorage.setItem(`conversations_${user.id}`, JSON.stringify(updatedConversations));
        }
      }

      // Submit the query
      await submitQuery(query.trim());
      setQuery('');
    } catch (error) {
      console.error('Error submitting query:', error);
      setError('Failed to submit query. Please try again.');
    }
  };

  // Handle feedback submission complete
  const handleFeedbackSubmitted = (messageId) => {
    console.log('Feedback submitted successfully for message:', messageId);
    // Clear the feedback form for this message
    setShowFeedbackFor(null);
  };

  // Handle regenerating an answer based on feedback
  const handleRegenerateAnswer = async (messageId, feedback) => {
    try {
      setRegenerating(true);
      await regenerateAnswer(messageId, feedback);
      setShowFeedbackFor(null);
    } catch (error) {
      console.error('Error regenerating answer:', error);
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
        <Chat />
        
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
                {loading ? 'Thinking...' : 'Send'}
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