import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '../contexts/QueryContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ConversationHistory from '../components/ConversationHistory';
// FeedbackForm removed - now using natural conversation analysis
import ResponseTabs from '../components/ResponseTabs';
import { supabase } from '../lib/supabaseClient';
import QueryToQuiz from '../components/QueryToQuiz';
import { generateQuizQuestions as generateQuizAPI } from '../api/quizApi';
import { toast } from 'react-hot-toast';
import ProjectPreferencesModal from '../components/ProjectPreferencesModal';
import { processUserMessage, calculateScore } from '../utils/secretFeedbackClassifier';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

function QueryPage() {
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [activeQuizMessage, setActiveQuizMessage] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Add state for code example and flash cards features
  const [showCodeExample, setShowCodeExample] = useState(false);
  const [codeExample, setCodeExample] = useState(null);
  const [showFlashCards, setShowFlashCards] = useState(false);
  const [flashCards, setFlashCards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

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
  const [projects, setProjects] = useState(() => {
    const key = user ? `projects_${user.id}` : 'projects';
    const savedProjects = localStorage.getItem(key);
    return savedProjects ? JSON.parse(savedProjects) : [];
  });
  const [activeProject, setActiveProject] = useState(null);
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
  
  // Persist projects whenever they change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`projects_${user.id}`, JSON.stringify(projects));
    }
  }, [projects, user]);
  
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
      
      // Load projects
      const savedProjects = localStorage.getItem(`projects_${user.id}`);
      if (savedProjects) {
        const projects = JSON.parse(savedProjects);
        setProjects(projects);
        
        // If we have an active project and conversation, load its messages
        const savedActiveProject = localStorage.getItem(`activeProject_${user.id}`);
        const savedActiveConversation = localStorage.getItem(`activeConversation_${user.id}`);
        
        if (savedActiveProject && savedActiveConversation) {
          const project = projects.find(p => p.id === savedActiveProject);
          const conversation = project?.conversations.find(c => c.id === savedActiveConversation);
          
          if (project && conversation) {
            setActiveProject(savedActiveProject);
            setActiveConversation(savedActiveConversation);
            setMessages(conversation.messages || []);
          }
        }
      } else {
        setProjects([]);
        setMessages([]);
      }
      
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

  // Migrate existing conversations to a default project if needed
  useEffect(() => {
    if (user && projects.length === 0) {
      const savedConversations = localStorage.getItem(`conversations_${user.id}`);
      if (savedConversations) {
        const conversations = JSON.parse(savedConversations);
        if (conversations.length > 0) {
          const defaultProject = {
            id: 'default',
            name: 'My Conversations',
            conversations: conversations,
            createdAt: Date.now(),
            lastModified: Date.now()
          };
          setProjects([defaultProject]);
          setActiveProject(defaultProject.id);
          if (conversations[0]) {
            setActiveConversation(conversations[0].id);
            setMessages(conversations[0].messages || []);
          }
        }
      }
    }
  }, [user]);

  // Add effect for persisting active project
  useEffect(() => {
    if (user) {
      if (activeProject) {
        localStorage.setItem(`activeProject_${user.id}`, activeProject);
      } else {
        localStorage.removeItem(`activeProject_${user.id}`);
      }
    }
  }, [activeProject, user]);

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
    if (!message || typeof message !== 'string' || message.trim() === '') {
      console.log('Empty or invalid message for title generation');
      return 'New Conversation';
    }
    
    // Get words from the message, removing punctuation
    const words = message.replace(/[^\w\s]/gi, '').trim().split(/\s+/);
    
    // Common words to skip
    const skipWords = new Set([
      'what', 'how', 'why', 'when', 'where', 'who', 'which',
      'explain', 'tell', 'me', 'about', 'can', 'you', 'please', 
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'will', 'would', 
      'can', 'could', 'should', 'to', 'and', 'or', 'but', 'if', 
      'then', 'that', 'this', 'these', 'those', 'for', 'with'
    ]);
    
    // Filter out short and common words
    let filteredWords = words.filter(word => 
      word.length > 2 && !skipWords.has(word.toLowerCase())
    );
    
    // If we don't have enough words after filtering, take the first few words
    if (filteredWords.length < 2) {
      filteredWords = words.filter(w => w.length > 1).slice(0, 3);
    }
    
    // If we still don't have words, just take the first 3 non-empty words
    if (filteredWords.length === 0) {
      filteredWords = words.filter(w => w.length > 0).slice(0, 3);
    }
    
    // If we have nothing at all, use a default
    if (filteredWords.length === 0) {
      console.log('No words found for title generation');
      return 'New Conversation';
    }
    
    // Take up to 3 words and capitalize each one
    const title = filteredWords
      .slice(0, 3)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    console.log(`Generated title "${title}" from message "${message.substring(0, 30)}..."`);
    return title || 'New Conversation'; // Final fallback
  };

  // Add state for project preferences modal
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [pendingProject, setPendingProject] = useState(null);

  const handleNewProject = (projectName) => {
    // Instead of creating the project immediately, store it as pending and show preferences modal
    setPendingProject({
      name: projectName,
      id: Date.now().toString(),
    });
    
    // Initialize default preferences with proper structure
    const defaultProjectPreferences = {
      interests: [],
      learning_style: 'Visual',
      technical_depth: 50,
      preferred_analogy_domains: []
    };
    
    setShowPreferencesModal(true);
  };

  const handleProjectPreferences = (projectPreferences) => {
    if (!pendingProject) return;

    console.log('Saving project preferences:', {
      projectName: pendingProject.name,
      preferences: projectPreferences
    });

    const initialConversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      lastMessageTime: Date.now()
    };

    // Create the new project with properly structured preferences
    const newProject = {
      ...pendingProject,
      preferences: {
        interests: projectPreferences.interests || [],
        learning_style: projectPreferences.learning_style || 'Visual',
        technical_depth: projectPreferences.technical_depth || 50,
        // If preferred_analogy_domains is empty but we have interests, use interests as analogy domains
        preferred_analogy_domains: projectPreferences.preferred_analogy_domains?.length ? 
          projectPreferences.preferred_analogy_domains : projectPreferences.interests || []
      },
      conversations: [initialConversation],
      createdAt: Date.now(),
      lastModified: Date.now()
    };
    
    console.log('Created new project with preferences:', {
      projectId: newProject.id,
      preferences: newProject.preferences
    });
    
    // Add new project at the start of the list
    setProjects(prev => [newProject, ...prev]);
    
    // Set active states
    setActiveProject(newProject.id);
    setActiveConversation(initialConversation.id);
    
    // Reset message-related states
    setMessages([]);
    setQuery('');
    setShowFeedbackFor(null);
    setActiveFeedbackMessage(null);
    
    // Clear pending project
    setPendingProject(null);
    setShowPreferencesModal(false);
  };

  const handleNewConversation = (projectId) => {
    const newConversation = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      lastMessageTime: Date.now()
    };
    
    setProjects(prev => prev.map(project => {
      if (project.id === projectId) {
        return {
          ...project,
          conversations: [newConversation, ...project.conversations],
          lastModified: Date.now()
        };
      }
      return project;
    }));
    
    setActiveConversation(newConversation.id);
    setActiveProject(projectId);
    
    // Reset message-related states
    setMessages([]);
    setQuery('');
    setShowFeedbackFor(null);
    setActiveFeedbackMessage(null);
  };

  const handleSelectConversation = (projectId, conversationId) => {
    setActiveProject(projectId);
    setActiveConversation(conversationId);
    
    // Find the conversation messages
    const project = projects.find(p => p.id === projectId);
    const conversation = project?.conversations.find(c => c.id === conversationId);
    if (conversation) {
      // Ensure we have a messages array
      const conversationMessages = conversation.messages || [];
      setMessages(conversationMessages);
      
      // Reset states
      setShowFeedbackFor(null);
      setActiveFeedbackMessage(null);
      setQuery('');
    }
  };

  const handleQueryChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // If this is the first message in a new conversation, create it
    if (!activeConversation && newQuery.trim()) {
      // Generate title once
      const title = generateTitle(newQuery);
      console.log('Creating new conversation with title:', title);
      
      const newConversation = {
        id: Date.now().toString(),
        title: title,
        messages: [],
        lastMessageTime: new Date().toISOString(),
      };
      setProjects(prev => prev.map(project => {
        if (project.id === activeProject) {
          return {
            ...project,
            conversations: [...project.conversations, newConversation],
            lastModified: Date.now()
          };
        }
        return project;
      }));
      setActiveConversation(newConversation.id);
    }
    // If we have an active conversation and it's still titled "New Conversation", update its title
    else if (activeConversation && newQuery.trim()) {
      const currentConversation = projects.find(p => p.id === activeProject)?.conversations.find(c => c.id === activeConversation);
      if (currentConversation && currentConversation.title === 'New Conversation') {
        // Generate title once
        const title = generateTitle(newQuery);
        console.log('Updating conversation title:', title);
        
        // Use a flag to prevent duplicate updates
        if (!currentConversation._titleUpdated) {
          setProjects(prev => prev.map(project => {
            if (project.id === activeProject) {
              return {
                ...project,
                conversations: project.conversations.map(conv => {
                  if (conv.id === activeConversation) {
                    return {
                      ...conv,
                      title: title,
                      _titleUpdated: true // Flag to prevent duplicate updates
                    };
                  }
                  return conv;
                }),
                lastModified: Date.now()
              };
            }
            return project;
          }));
        }
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Get the active project's preferences
    const activeProjectData = projects.find(p => p.id === activeProject);
    console.log('Active Project Data:', {
      projectId: activeProject,
      projectName: activeProjectData?.name,
      projectPreferences: activeProjectData?.preferences
    });

    // Merge project preferences with global preferences to ensure no values are empty
    const queryPreferences = {
      interests: activeProjectData?.preferences?.interests?.length ? 
        activeProjectData.preferences.interests : preferences.interests || [],
      learning_style: activeProjectData?.preferences?.learning_style || 
        preferences.visualLearning > 70 ? 'Visual' : 'Verbal',
      technical_depth: activeProjectData?.preferences?.technical_depth || 
        preferences.technicalDepth || 50,
      preferred_analogy_domains: activeProjectData?.preferences?.preferred_analogy_domains?.length ?
        activeProjectData.preferences.preferred_analogy_domains : [
          // Default to interests if no specific analogy domains are set
          ...(activeProjectData?.preferences?.interests || preferences.interests || [])
        ]
    };

    // Log the preferences being used for this query
    console.log('Using preferences for query:', {
      projectId: activeProject,
      preferences: queryPreferences,
      isUsingProjectPreferences: !!activeProjectData?.preferences
    });

    // Retrieve the current session ID for this conversation
    const currentConversation = activeProjectData?.conversations.find(c => c.id === activeConversation);
    const conversationSessionId = currentConversation?.sessionId || sessionId;
    
    console.log('[FRONTEND DEBUG] Using session ID for query:', conversationSessionId);

    const userMessage = {
      id: Date.now().toString(),
      content: query,
      role: 'user',
      timestamp: Date.now()
    };

    // Process the user message for secret feedback (non-blocking)
    if (user) {
      processUserMessage(user.id, query, conversationSessionId).then(result => {
        console.log('Secret feedback processed:', result);
        // Optionally, you could store the result or trigger analytics
      }).catch(error => {
        console.error('Error processing secret feedback:', error);
        // Fail silently to not interrupt the user experience
      });
    }

    // Update local messages state
    setMessages(prev => [...prev, userMessage]);

    // Add a temporary "thinking" message
    const thinkingMessage = {
      id: 'thinking-' + Date.now().toString(),
      content: 'Crafting an answer for you...',
      role: 'thinking',
      timestamp: Date.now()
    };
    
    // Add the thinking message
    setMessages(prev => [...prev, thinkingMessage]);

    // Update project conversation
    setProjects(prev => prev.map(project => {
      if (project.id === activeProject) {
        return {
          ...project,
          conversations: project.conversations.map(conv => {
            if (conv.id === activeConversation) {
              const updatedMessages = conv.messages || [];
              return {
                ...conv,
                messages: [...updatedMessages, userMessage],
                lastMessageTime: Date.now()
              };
            }
            return conv;
          }),
          lastModified: Date.now()
        };
      }
      return project;
    }));

    setQuery('');

    try {
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      // Call submitQuery with project-specific preferences
      console.log('Submitting query with preferences:', {
        query,
        preferences: queryPreferences,
        projectId: activeProject,
        sessionId: conversationSessionId  // Use the session ID from the conversation
      });
      
      const response = await submitQuery(query, queryPreferences, conversationSessionId);
      
      console.log('Received response with preferences:', {
        responseId: response.id,
        usedPreferences: queryPreferences,
        sessionId: response.sessionId || conversationSessionId
      });
      
      // Create a message object, treating all responses as conversational
      const aiMessage = {
        id: response.id || Date.now().toString(),
        content: response.explanation || response,
        role: 'assistant',
        timestamp: Date.now(),
        // Store preferences used for this response to maintain consistency
        preferences: queryPreferences,
        // Include tab content for immediate availability
        tab_content: response.tab_content || null,
        // Include quiz data if available
        quiz: response.quiz || null
      };
      
      // Remove the thinking message and add the AI response
      setMessages(prev => prev.filter(msg => msg.role !== 'thinking').concat(aiMessage));
      
      // Update project conversation
      setProjects(prev => prev.map(project => {
        if (project.id === activeProject) {
          return {
            ...project,
            conversations: project.conversations.map(conv => {
              if (conv.id === activeConversation) {
                const updatedMessages = conv.messages || [];
                return {
                  ...conv,
                  messages: [...updatedMessages, aiMessage],
                  lastMessageTime: Date.now(),
                  title: conv.title === 'New Conversation' ? generateTitle(query) : conv.title,
                  sessionId: response.sessionId || conv.sessionId || conversationSessionId,
                  // Store current preferences at the conversation level as well
                  currentPreferences: queryPreferences
                };
              }
              return conv;
            }),
            lastModified: Date.now()
          };
        }
        return project;
      }));
      
      // Also update the local sessionId state for future queries
      if (response.sessionId) {
        setSessionId(response.sessionId);
        // Save in localStorage
        if (user) {
          localStorage.setItem(`sessionId_${user.id}`, response.sessionId);
        }
      }
      
    } catch (error) {
      console.error('Error processing query:', error);
      toast.error('Failed to get response');
      
      // Remove the thinking message
      setMessages(prev => prev.filter(msg => msg.role !== 'thinking'));
      
      // Add error message to the conversation
      const errorMessage = {
        type: 'error',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Handle feedback submission complete
  const handleFeedbackSubmitted = (messageId) => {
    console.log('Feedback submitted successfully for message:', messageId);
    
    // Don't clear active feedback if there's an active quiz for a different message
    if (!activeQuizMessage || activeQuizMessage === messageId) {
      setShowFeedbackFor(null);
      setActiveFeedbackMessage(null);
      
      // Also clear from localStorage if stored
      if (user) {
        localStorage.removeItem(`showFeedbackFor_${user.id}`);
      }
    }
  };

  // Handle regenerating an answer based on feedback
  const handleRegenerateAnswer = async (feedbackData) => {
    // Save current quiz state
    const quizMessageId = activeQuizMessage;
    
    try {
      setRegenerating(true);
      
      // Find the most recent assistant message
      const lastAssistantMessage = messages.find(msg => msg.role === 'assistant');
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
        type: 'thinking',
        role: 'thinking',
        content: 'Crafting an improved answer based on your feedback...',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, regeneratingMsg]);

      // Get the active project's preferences
      const activeProjectData = projects.find(p => p.id === activeProject);
      
      // Get conversation-level preferences if available
      const activeConversationData = activeProjectData?.conversations?.find(c => c.id === activeConversation);
      
      // Use the original message preferences if available, or conversation preferences, or project preferences
      const originalPreferences = lastAssistantMessage.preferences || 
                                activeConversationData?.currentPreferences || 
                                activeProjectData?.preferences;
      
      console.log('Using preferences for regeneration:', {
        source: lastAssistantMessage.preferences ? 'original message' : 
                (activeConversationData?.currentPreferences ? 'conversation' : 'project'),
        preferences: originalPreferences
      });
      
      // Merge project preferences with global preferences to ensure no values are empty
      const queryPreferences = originalPreferences || {
        interests: activeProjectData?.preferences?.interests?.length ? 
          activeProjectData.preferences.interests : preferences.interests || [],
        learning_style: activeProjectData?.preferences?.learning_style || 
          preferences.visualLearning > 70 ? 'Visual' : 'Verbal',
        technical_depth: activeProjectData?.preferences?.technical_depth || 
          preferences.technicalDepth || 50,
        preferred_analogy_domains: activeProjectData?.preferences?.preferred_analogy_domains?.length ?
          activeProjectData.preferences.preferred_analogy_domains : [
            // Default to interests if no specific analogy domains are set
            ...(activeProjectData?.preferences?.interests || preferences.interests || [])
          ]
      };

      // If user requested a specific analogy topic in feedback, prioritize it
      if (feedbackData.analogyTopic) {
        queryPreferences.preferred_analogy_domains = [feedbackData.analogyTopic];
      }

      console.log('Regenerating with preferences:', queryPreferences);

      // Call the regenerateAnswer function with project-specific preferences
      const response = await regenerateAnswer(
        userQuery,
        lastAssistantMessage.id,
        feedbackData,
        queryPreferences
      );
      
      console.log('Received regenerated response:', response);

      // Remove the regenerating message
      setMessages(prev => prev.filter(m => m.role !== 'thinking' && m !== regeneratingMsg));

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
        content: response.explanation || response,
        role: 'assistant',
        timestamp: Date.now(),
        // Store the preferences used for this regenerated response
        preferences: queryPreferences,
        // Include tab content for immediate availability
        tab_content: response.tab_content || null,
        // Include quiz data if available
        quiz: response.quiz || null,
        isRegenerated: true
      };

      console.log('Adding regenerated message to conversation');
      setMessages(prev => [...prev, regeneratedMessage]);

      // Update the conversation
      setProjects(prev => prev.map(project => {
        if (project.id === activeProject) {
          // Only update title if not already processed
          if (!response._processed) {
            response._processed = true;
            
            // Keep the existing title unless we have a new one from the API
            const updatedTitle = response.suggested_title && response.suggested_title.length > 1
              ? response.suggested_title 
              : project.conversations.find(c => c.id === activeConversation)?.title || 'New Conversation';
              
            console.log('Updating regenerated conversation title:', {
              original: project.conversations.find(c => c.id === activeConversation)?.title || 'New Conversation',
              suggested: response.suggested_title,
              final: updatedTitle
            });
            
            return {
              ...project,
              conversations: project.conversations.map(conv => {
                if (conv.id === activeConversation) {
                  return {
                    ...conv,
                    title: updatedTitle,
                    messages: [...messages, regeneratedMessage],
                    lastMessageTime: new Date().toISOString(),
                    // Ensure preferences are maintained at conversation level
                    currentPreferences: queryPreferences
                  };
                }
                return conv;
              }),
              lastModified: Date.now()
            };
          }
          
          // If already processed, just update messages
          return {
            ...project,
            conversations: project.conversations.map(conv => {
              if (conv.id === activeConversation) {
                return {
                  ...conv,
                  messages: [...messages, regeneratedMessage],
                  lastMessageTime: new Date().toISOString(),
                  // Ensure preferences are maintained at conversation level
                  currentPreferences: queryPreferences
                };
              }
              return conv;
            }),
            lastModified: Date.now()
          };
        }
        return project;
      }));

      // Set a timer to show feedback for the regenerated message
      setTimeout(() => {
        setShowFeedbackFor(regeneratedResponseId);
        setActiveFeedbackMessage(regeneratedResponseId);
      }, 500);

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
      setIsGeneratingContent(true);
      
      // Get the active project's preferences
      const activeProjectData = projects.find(p => p.id === activeProject);
      const quizPreferences = activeProjectData?.preferences || {
        interests: [],
        learning_style: 'Visual',
        technical_depth: 50,
        preferred_analogy_domains: []
      };
      
      // Format options correctly for the API
      const quizOptions = {
        difficultyLevel: 'medium',
        userId: user?.id,
        content: messages.find(msg => msg.role === 'assistant')?.content || '',
        preferences: quizPreferences
      };
      
      // Generate quiz using project-specific preferences
      const quizData = await generateQuizAPI(topic, quizOptions);
      
      setQuizQuestions(quizData.questions || quizData);
      setCurrentQuestionIndex(0);
      setQuizMode(true);
      setSelectedAnswer(null);
      setQuizScore(0);
      
      // Close other features if they're open
      setShowCodeExample(false);
      setShowFlashCards(false);
      
    } catch (error) {
      console.error('Error generating quiz:', error);
      toast.error('Failed to generate quiz questions');
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Handler for generating code examples
  const handleGenerateCodeExample = async () => {
    try {
      setIsGeneratingContent(true);
      
      // Find the most recent assistant message to extract context
      const lastAssistantMessage = messages.find(msg => msg.role === 'assistant');
      if (!lastAssistantMessage) {
        throw new Error('No assistant message found to generate a code example from');
      }
      
      // Find the most recent user query before this response
      const userMessageIndex = messages.findIndex(msg => msg.id === lastAssistantMessage.id) - 1;
      const userQuery = userMessageIndex >= 0 ? messages[userMessageIndex].content : '';
      
      toast.promise(
        generateCodeExample(userQuery, lastAssistantMessage.content),
        {
          loading: 'Generating code example...',
          success: 'Code example generated!',
          error: 'Failed to generate code example'
        }
      );
      
      // Generate the code example
      const example = await generateCodeExample(userQuery, lastAssistantMessage.content);
      setCodeExample(example);
      setShowCodeExample(true);
      
      // Close other modals
      setQuizMode(false);
      setShowFlashCards(false);
      
    } catch (error) {
      console.error('Error generating code example:', error);
      toast.error('Failed to generate code example');
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Function to generate code example
  const generateCodeExample = async (query, explanation) => {
    try {
      // Create a prompt for the code example
      const prompt = `Based on this concept: "${query}", and this explanation: "${explanation.substring(0, 200)}...", 
      generate a simple code example that demonstrates this concept. Make it clear, concise, and well-commented.
      Include the programming language name at the top.`;
      
      // Get the active project's preferences
      const activeProjectData = projects.find(p => p.id === activeProject);
      const codePreferences = activeProjectData?.preferences || {
        technical_depth: 50
      };
      
      // Call the backend to generate the code example
      const response = await fetch('/api/generate-code-example', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          technical_depth: codePreferences.technical_depth
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate code example');
      }
      
      const data = await response.json();
      
      // If we can't fetch from the API, use a fallback
      if (!data.code) {
        return {
          language: 'javascript',
          code: `// Fallback code example for: ${query}
function demonstrateConcept() {
  // This is a placeholder example
  console.log("This would demonstrate the concept of: " + "${query}");
  // For real implementation, please refer to documentation
}

demonstrateConcept();`
        };
      }
      
      return {
        language: data.language || 'javascript',
        code: data.code
      };
      
    } catch (error) {
      console.error('Error in code example generation:', error);
      // Return a fallback example
      return {
        language: 'javascript',
        code: `// Example could not be generated
// Here's a placeholder for the concept: ${query}
function examplePlaceholder() {
  console.log("Concept demonstration would go here");
}

examplePlaceholder();`
      };
    }
  };

  // Handler for generating flash cards
  const handleGenerateFlashCards = async () => {
    try {
      setIsGeneratingContent(true);
      
      // Find the most recent assistant message to extract context
      const lastAssistantMessage = messages.find(msg => msg.role === 'assistant');
      if (!lastAssistantMessage) {
        throw new Error('No assistant message found to generate flash cards from');
      }
      
      // Find the most recent user query before this response
      const userMessageIndex = messages.findIndex(msg => msg.id === lastAssistantMessage.id) - 1;
      const userQuery = userMessageIndex >= 0 ? messages[userMessageIndex].content : '';
      
      toast.promise(
        generateFlashCards(userQuery, lastAssistantMessage.content),
        {
          loading: 'Generating flash cards...',
          success: 'Flash cards generated!',
          error: 'Failed to generate flash cards'
        }
      );
      
      // Generate the flash cards
      const cards = await generateFlashCards(userQuery, lastAssistantMessage.content);
      setFlashCards(cards);
      setCurrentCardIndex(0);
      setIsCardFlipped(false);
      setShowFlashCards(true);
      
      // Close other modals
      setQuizMode(false);
      setShowCodeExample(false);
      
    } catch (error) {
      console.error('Error generating flash cards:', error);
      toast.error('Failed to generate flash cards');
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // Function to generate flash cards
  const generateFlashCards = async (query, explanation) => {
    try {
      // Create a prompt for the flash cards
      const prompt = `Based on this concept: "${query}", and this explanation: "${explanation.substring(0, 200)}...", 
      generate 3 flash cards with questions on the front and answers on the back that reinforce key facts and definitions.
      Make them clear, concise, and focused on the most important points for understanding this concept.`;
      
      // Get the active project's preferences
      const activeProjectData = projects.find(p => p.id === activeProject);
      
      // Call the backend to generate the flash cards
      const response = await fetch('/api/generate-flash-cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          preferences: activeProjectData?.preferences
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate flash cards');
      }
      
      const data = await response.json();
      
      // If we can't fetch from the API, use fallback cards
      if (!data.cards || !data.cards.length) {
        return [
          { question: `What is ${query}?`, answer: "A key concept that helps organize and solve problems in this domain." },
          { question: "What are the main components of this concept?", answer: "The concept typically consists of several key elements that work together." },
          { question: "Why is this concept important?", answer: "It provides a fundamental framework for understanding this topic area." }
        ];
      }
      
      return data.cards;
      
    } catch (error) {
      console.error('Error in flash cards generation:', error);
      // Return fallback cards
      return [
        { question: `What is ${query}?`, answer: "A key concept that helps organize and solve problems in this domain." },
        { question: "What are the main components of this concept?", answer: "The concept typically consists of several key elements that work together." },
        { question: "Why is this concept important?", answer: "It provides a fundamental framework for understanding this topic area." }
      ];
    }
  };

  // Function to handle flash card flipping
  const flipCard = () => {
    setIsCardFlipped(!isCardFlipped);
  };

  // Function to move to the next flash card
  const nextCard = () => {
    if (currentCardIndex < flashCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsCardFlipped(false);
    }
  };

  // Function to move to the previous flash card
  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsCardFlipped(false);
    }
  };

  // Handler function to close code example modal
  const handleCloseCodeExample = () => {
    setShowCodeExample(false);
  };

  // Handler function to close flash cards modal
  const handleCloseFlashCards = () => {
    setShowFlashCards(false);
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
    <div className="flex h-screen">
      <ConversationHistory
        projects={projects}
        activeProject={activeProject}
        activeConversation={activeConversation}
        onNewProject={handleNewProject}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat container */}
        <div className="flex-1 overflow-y-auto p-2 lg:p-4 space-y-4">
          {messages.map((message, index) => (
            <div key={message.id || index} className={`message ${message.role}`}>
              <div
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`w-full rounded-lg p-4 lg:p-6 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : message.role === 'error'
                      ? 'bg-red-100 text-red-700'
                      : message.role === 'system'
                      ? 'bg-yellow-50 text-yellow-700'
                      : message.role === 'thinking'
                      ? 'bg-gray-100 text-gray-700 animate-pulse'
                      : 'bg-white shadow'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="space-y-4">
                      {/* Use ResponseTabs component for tabbed interface */}
                      <ResponseTabs
                        messageId={message.id}
                        mainContent={message.content}
                        originalQuery={messages.find(m => m.role === 'user' && m.timestamp < message.timestamp)?.content || ''}
                        sessionId={sessionId}
                        preferences={message.preferences || preferences}
                        userId={user?.id}
                        tabContent={message.tab_content}
                      />
                    </div>
                  ) : message.role === 'thinking' ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-pulse flex space-x-2">
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                      <p className="text-gray-500 font-medium">{message.content}</p>
                    </div>
                  ) : (
                    <div className="prose max-w-none">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>

              {/* Add quiz component for assistant messages */}
              {message.role === 'assistant' && (
                <div className="mt-4 relative" style={{ zIndex: activeQuizMessage === message.id ? 10 : 1 }}>
                  <QueryToQuiz 
                    key={`quiz-${message.id}`}
                    query={messages.find(m => m.role === 'user' && m.timestamp < message.timestamp)?.content || ''}
                    responseContent={message.content}
                    preGeneratedQuiz={message.quiz}
                    onQuizStart={() => {
                      console.log('Quiz started for message:', message.id);
                      // Store the current feedback state before starting quiz
                      if (showFeedbackFor === message.id) {
                        // Save that this message had feedback showing
                        message.hadFeedbackShowing = true;
                      }
                      setActiveQuizMessage(message.id);
                      // Temporarily hide feedback during quiz
                      if (showFeedbackFor === message.id) {
                        setShowFeedbackFor(null);
                      }
                    }}
                    onQuizEnd={() => {
                      console.log('Quiz ended for message:', message.id);
                      setActiveQuizMessage(null);
                      
                      // Force restore feedback state with a delay
                      if (message.hadFeedbackShowing) {
                        setTimeout(() => {
                          setShowFeedbackFor(message.id);
                          setActiveFeedbackMessage(message.id);
                          // Clear the flag
                          message.hadFeedbackShowing = false;
                        }, 300);
                      }
                    }}
                    isActive={activeQuizMessage === message.id}
                    alwaysVisible={true}
                  />
                </div>
              )}

              {/* FEEDBACK FORM REMOVED: Now using natural conversation analysis for crowd wisdom learning */}

              {/* Add feedback button for messages without feedback */}
              {message.role === 'assistant' && 
               !showFeedbackFor && 
               !activeQuizMessage &&
               !message.hadFeedbackSubmitted && (
                <div className="mt-2 flex justify-end">
                  {/* FEEDBACK REMOVED: Now using natural conversation analysis */}
                  <div className="text-xs text-gray-500 italic">
                    💬 System learns from your natural conversation
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input container */}
        <div className="border-t bg-white p-4 lg:p-6">
          <div className="w-full px-2">
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
                  disabled={loading || regenerating || !messages.some(m => m.role === 'assistant') || isGeneratingContent}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-secondary-600 hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500 disabled:opacity-50"
                >
                  <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Quiz Me
                </button>
                
                {/* Code Example Button */}
                <button
                  type="button"
                  onClick={handleGenerateCodeExample}
                  disabled={loading || regenerating || !messages.some(m => m.role === 'assistant') || isGeneratingContent}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Code Example
                </button>
                
                {/* Flash Cards Button */}
                <button
                  type="button"
                  onClick={handleGenerateFlashCards}
                  disabled={loading || regenerating || !messages.some(m => m.role === 'assistant') || isGeneratingContent}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  <svg className="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Flash Cards
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

      {/* Project Preferences Modal */}
      <ProjectPreferencesModal
        isOpen={showPreferencesModal}
        onClose={() => {
          setShowPreferencesModal(false);
          setPendingProject(null);
        }}
        onSave={handleProjectPreferences}
        defaultPreferences={preferences}
        projectName={pendingProject?.name || ''}
      />

      {/* Code Example Modal */}
      {showCodeExample && codeExample && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Code Example: {codeExample.language}
              </h3>
              <button 
                onClick={handleCloseCodeExample}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="bg-gray-900 rounded-md p-4 overflow-auto max-h-[60vh]">
              <pre className="text-white text-sm whitespace-pre-wrap">
                <code>{typeof codeExample.code === 'string' ? codeExample.code : JSON.stringify(codeExample.code, null, 2)}</code>
              </pre>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleCloseCodeExample}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flash Cards Modal */}
      {showFlashCards && flashCards.length > 0 && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 m-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Flash Cards ({currentCardIndex + 1}/{flashCards.length})
              </h3>
              <button 
                onClick={handleCloseFlashCards}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Flash Card */}
            <div 
              className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow p-6 min-h-[200px] flex items-center justify-center cursor-pointer transform transition-transform duration-300 hover:scale-105"
              onClick={flipCard}
            >
              <div className="text-center">
                {!isCardFlipped ? (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Question:</h4>
                    <p className="text-gray-700">{flashCards[currentCardIndex].question}</p>
                    <p className="text-sm text-gray-500 mt-4">(Click to see answer)</p>
                  </div>
                ) : (
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">Answer:</h4>
                    <p className="text-gray-700">{flashCards[currentCardIndex].answer}</p>
                    <p className="text-sm text-gray-500 mt-4">(Click to see question)</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Navigation buttons */}
            <div className="mt-6 flex justify-between">
              <button
                onClick={prevCard}
                disabled={currentCardIndex === 0}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md disabled:opacity-50 hover:bg-indigo-700"
              >
                Previous
              </button>
              <button
                onClick={handleCloseFlashCards}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
              <button
                onClick={nextCard}
                disabled={currentCardIndex === flashCards.length - 1}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md disabled:opacity-50 hover:bg-indigo-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QueryPage;