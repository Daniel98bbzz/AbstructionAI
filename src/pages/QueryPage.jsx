import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ConversationHistory from '../components/ConversationHistory';

function QueryPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    visualLearning: 50,
    practicalExamples: 50,
    technicalDepth: 50,
  });
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const messagesEndRef = useRef(null);
  const { submitQuery, loading, error } = useQuery();

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
    const newConversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      lastMessageTime: new Date().toISOString(),
    };
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversation(newConversation.id);
    setMessages([]);
    setSessionId(null);
  };

  const handleSelectConversation = (conversationId) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
      setActiveConversation(conversationId);
      setMessages(conversation.messages);
      setSessionId(conversation.sessionId);
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
      
      // Get AI response using the existing session ID if available
      const response = await submitQuery(query, preferences, sessionId);
      
      // Store the session ID if this is the first message
      if (!sessionId && response.sessionId) {
        setSessionId(response.sessionId);
      }
      
      // Add AI response
      const aiMessage = {
        type: 'assistant',
        content: response.explanation,
        analogy: response.analogy,
        resources: response.resources,
        timestamp: new Date().toISOString()
      };
      
      const updatedMessages = [...messages, userMessage, aiMessage];
      setMessages(updatedMessages);
      
      // Update conversations
      setConversations(prev => prev.map(conv => {
        if (conv.id === activeConversation) {
          return {
            ...conv,
            messages: updatedMessages,
            lastMessageTime: new Date().toISOString(),
          };
        }
        return conv;
      }));
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
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-lg p-4 ${
                  message.type === 'user'
                    ? 'bg-primary-600 text-white'
                    : message.type === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-white shadow'
                }`}
              >
                {message.type === 'assistant' ? (
                  <div className="space-y-4">
                    <div className="prose max-w-none">
                      {message.content}
                    </div>
                    {message.analogy && (
                      <div>
                        <h4 className="font-medium text-gray-900 mt-4 mb-2">Real-World Analogy:</h4>
                        <div className="prose max-w-none">
                          {message.analogy}
                        </div>
                      </div>
                    )}
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
                  </div>
                ) : (
                  <div className="prose max-w-none">
                    {message.content}
                  </div>
                )}
              </div>
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
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loading ? (
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