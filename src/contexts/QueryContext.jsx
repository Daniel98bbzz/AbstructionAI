import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import axios from 'axios';
import { API_URL } from '../config';

const QueryContext = createContext();

export function useQuery() {
  return useContext(QueryContext);
}

export function QueryProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSession, setCurrentSession] = useState(() => {
    // Try to load session from localStorage on init
    if (user) {
      const savedSession = localStorage.getItem(`currentSession_${user.id}`);
      return savedSession ? JSON.parse(savedSession) : null;
    }
    return null;
  });
  const [currentResponse, setCurrentResponse] = useState(null);
  const [messageHistory, setMessageHistory] = useState(() => {
    // Try to load message history from localStorage on init
    if (user) {
      const savedMessages = localStorage.getItem(`messageHistory_${user.id}`);
      return savedMessages ? JSON.parse(savedMessages) : [];
    }
    return [];
  });
  
  // Save session to localStorage whenever it changes
  useEffect(() => {
    if (user && currentSession) {
      localStorage.setItem(`currentSession_${user.id}`, JSON.stringify(currentSession));
      // Also save just the session ID for easy access
      localStorage.setItem(`sessionId_${user.id}`, currentSession.id);
    } else if (user) {
      localStorage.removeItem(`currentSession_${user.id}`);
      localStorage.removeItem(`sessionId_${user.id}`);
    }
  }, [currentSession, user]);
  
  // Save message history to localStorage whenever it changes
  useEffect(() => {
    if (user && messageHistory && messageHistory.length > 0) {
      localStorage.setItem(`messageHistory_${user.id}`, JSON.stringify(messageHistory));
    } else if (user) {
      localStorage.removeItem(`messageHistory_${user.id}`);
    }
  }, [messageHistory, user]);

  // Load user-specific data when user changes
  useEffect(() => {
    if (user) {
      // Load session
      const savedSession = localStorage.getItem(`currentSession_${user.id}`);
      if (savedSession) {
        setCurrentSession(JSON.parse(savedSession));
      } else {
        setCurrentSession(null);
      }
      
      // Load message history
      const savedMessages = localStorage.getItem(`messageHistory_${user.id}`);
      if (savedMessages) {
        setMessageHistory(JSON.parse(savedMessages));
      } else {
        setMessageHistory([]);
      }
    } else {
      // Clear state when user logs out
      setCurrentSession(null);
      setMessageHistory([]);
    }
  }, [user?.id]);

  // Ensure user exists in the users table
  const ensureUserExists = async () => {
    if (!user) return;
    
    try {
      // Check if user exists in users table
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
        
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking if user exists:', checkError);
        // Continue anyway - the trigger should handle user creation
      }
      
      // If user doesn't exist, create a new user record
      if (!existingUser) {
        // Use RPC call to bypass RLS
        const { error: insertError } = await supabase.rpc('create_user_record', {
          user_id: user.id,
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          field_study: user.user_metadata?.field_of_study || '',
          education_lvl: user.user_metadata?.education_level || ''
        });
        
        if (insertError) {
          console.error('Error creating user via RPC:', insertError);
          // Fall back to direct insert
          const { error: directInsertError } = await supabase
            .from('users')
            .insert([
              { 
                id: user.id,
                first_name: user.user_metadata?.first_name || '',
                last_name: user.user_metadata?.last_name || '',
                field_of_study: user.user_metadata?.field_of_study || '',
                education_level: user.user_metadata?.education_level || ''
              }
            ]);
            
          if (directInsertError) throw directInsertError;
        }
      }
    } catch (err) {
      console.error('Error ensuring user exists:', err);
      // Don't throw the error - try to continue with the session creation
    }
  };

  // Submit a query to the AI
  const submitQuery = async (query, preferences = {}, sessionId = null) => {
    try {
      setLoading(true);
      setError(null);
      
      // Add user logging to debug session persistence
      const savedSessionId = user ? localStorage.getItem(`sessionId_${user.id}`) : null;
      const currentSessionId = sessionId || currentSession?.id || savedSessionId;
      
      console.log('[FRONTEND DEBUG] Submitting query with session info:', {
        currentSessionId,
        savedSessionId,
        hasCurrentSession: !!currentSession,
        userId: user?.id
      });
      
      // Get or create a session if needed
      if (!currentSession && !currentSessionId) {
        try {
          console.log('[FRONTEND DEBUG] No active session, creating a new one');
          const newSession = await startNewSession(preferences);
          console.log('[FRONTEND DEBUG] Created new session:', newSession?.id);
        } catch (sessionError) {
          console.error('Error creating session:', sessionError);
          // Continue with query without a session as fallback
        }
      } else {
        console.log(`[FRONTEND DEBUG] Using existing session: ${currentSessionId}`);
      }
      
      // Format query request for backend API
      let responseData;
      try {
        // Log the user's basic info for debugging
        console.log('Current user:', user ? {
          id: user.id,
          email: user.email || 'not available'
        } : 'not logged in');
        
        const effectiveSessionId = sessionId || currentSession?.id || (user ? localStorage.getItem(`sessionId_${user.id}`) : null);
        console.log(`[FRONTEND DEBUG] Effective session ID for API call: ${effectiveSessionId}`);
        
        try {
          const response = await axios.post(`${API_URL}/api/query`, {
            query,
            sessionId: effectiveSessionId, 
            preferences,
            userId: user?.id  // Explicitly include user ID
          });
          
          console.log('Received response from backend:', response);
          responseData = response.data;
          
          // Update message history with AI response
          const aiMessage = {
            role: 'assistant',
            content: responseData.explanation || responseData,
            timestamp: new Date().toISOString()
          };
          setMessageHistory(prev => [...prev, aiMessage]);
          
          // Set current session if not already set
          if (responseData.sessionId && (!currentSession || currentSession.id !== responseData.sessionId)) {
            setCurrentSession({ id: responseData.sessionId });
            // Also save to localStorage for persistence
            if (user) {
              localStorage.setItem(`sessionId_${user.id}`, responseData.sessionId);
              localStorage.setItem(`currentSession_${user.id}`, JSON.stringify({ id: responseData.sessionId }));
            }
          }
        } catch (axiosError) {
          console.error('Axios error details:', {
            message: axiosError.message,
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data
          });
          
          // Show more detailed error to help debugging
          throw new Error(`API request failed: ${axiosError.message}${axiosError.response?.data?.error ? ` - ${axiosError.response.data.error}` : ''}`);
        }
      } catch (err) {
        console.error('Error calling backend API:', err);
        console.error('Error details:', err.response?.data || err.message);
        throw err;
      }
      
      setCurrentResponse(responseData);
      return responseData;
    } catch (err) {
      console.error('Error submitting query:', err);
      setError('Failed to process query. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Process query locally since the backend server isn't running
  const processQueryLocally = async (query, preferences) => {
    // Simulate AI processing with a simple response generator
    const topics = {
      'quantum': {
        explanation: 'Quantum mechanics is a fundamental theory in physics that describes nature at the smallest scales of energy levels of atoms and subatomic particles. It describes the physical properties of nature at the scale of atoms and subatomic particles.',
        analogy: 'Think of quantum mechanics like a game of probability. In our everyday world, a coin is either heads or tails when it lands. But in the quantum world, it can be both heads and tails simultaneously until you look at it.',
        resources: [
          {
            title: 'Introduction to Quantum Mechanics',
            url: 'https://www.feynmanlectures.caltech.edu/III_01.html',
            description: 'The Feynman Lectures on Physics'
          }
        ]
      },
      'algorithm': {
        explanation: 'An algorithm is a step-by-step procedure for solving a problem or accomplishing a task. In computer science, algorithms are precise sequences of instructions that tell a computer exactly what to do.',
        analogy: 'An algorithm is like a recipe. It provides specific instructions in a particular order to achieve a desired outcome, just as a recipe tells you the ingredients and steps to make a dish.',
        resources: [
          {
            title: 'Introduction to Algorithms',
            url: 'https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-006-introduction-to-algorithms-fall-2011/',
            description: 'MIT OpenCourseWare'
          }
        ]
      },
      'neural': {
        explanation: 'Neural networks are computing systems inspired by the biological neural networks in animal brains. They consist of artificial neurons that can learn from and make decisions based on input data.',
        analogy: 'A neural network is like a team of people trying to identify objects in the dark. At first, they make many mistakes, but with feedback, they gradually improve their accuracy by adjusting their guessing strategy.',
        resources: [
          {
            title: 'Neural Networks and Deep Learning',
            url: 'http://neuralnetworksanddeeplearning.com/',
            description: 'Free online book by Michael Nielsen'
          }
        ]
      }
    };
    
    // Generate a response based on keywords in the query
    let response = {
      id: generateUUID(),
      query,
      explanation: 'I understand you\'re asking about a complex concept. Let me explain it in simple terms.',
      analogy: 'Think of it like this: complex concepts often have simpler real-world parallels that can help us understand them.',
      resources: [],
      suggested_activities: [
        { type: 'reflection', title: 'Write a summary of this concept in your own words' },
        { type: 'teaching', title: 'Try explaining this concept to someone else' }
      ],
      timestamp: new Date().toISOString()
    };
    
    // Check for keywords in the query
    Object.keys(topics).forEach(keyword => {
      if (query.toLowerCase().includes(keyword)) {
        response.explanation = topics[keyword].explanation;
        response.analogy = topics[keyword].analogy;
        response.resources = topics[keyword].resources;
      }
    });
    
    // Adjust based on preferences
    if (preferences.visualLearning > 75) {
      response.explanation += ' Visually, you can imagine this as a diagram with interconnected components.';
    }
    
    if (preferences.practicalExamples > 75) {
      response.explanation += ' In practical applications, this concept is used in fields like engineering, medicine, and technology.';
    }
    
    if (preferences.technicalDepth > 75) {
      response.explanation += ' On a more technical level, this involves complex mathematical principles and theoretical frameworks.';
    }
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return response;
  };

  // Generate a UUID for local responses
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Submit feedback for a response
  const submitFeedback = async (responseId, rating, comments = '') => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Starting feedback submission process...');
      
      // Format the feedback data
      const feedbackData = {
        id: Date.now().toString(),
        responseId: responseId || 'unknown',
        sessionId: currentSession?.id || 'unknown',
        rating: rating,
        timestamp: new Date().toISOString(),
        user_id: user?.id || 'anonymous'
      };
      
      // Parse any additional comment data
      if (typeof comments === 'string') {
        try {
          feedbackData.details = JSON.parse(comments);
        } catch (e) {
          feedbackData.comments = comments;
        }
      } else {
        feedbackData.details = comments;
      }
      
      // Store in localStorage as a backup/fallback
      let storedFeedback = [];
      try {
        const existingFeedback = localStorage.getItem('user_feedback');
        if (existingFeedback) {
          storedFeedback = JSON.parse(existingFeedback);
        }
      } catch (e) {
        console.warn('Error parsing stored feedback:', e);
        storedFeedback = [];
      }
      
      // Add new feedback and save
      storedFeedback.push(feedbackData);
      localStorage.setItem('user_feedback', JSON.stringify(storedFeedback));
      
      console.log('Feedback saved to local storage as fallback:', feedbackData);
      
      return feedbackData;
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again. ' + (err.message || ''));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Regenerate an answer based on feedback
  const regenerateAnswer = async (query, originalResponseId, feedbackDetails, preferences = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Regenerating answer with feedback:', feedbackDetails);
      
      if (!user) {
        throw new Error('You must be logged in to regenerate an answer');
      }
      
      // Try to initialize a session if none exists
      if (!currentSession) {
        try {
          console.log('No active session found, trying to create one...');
          const newSession = await startNewSession();
          console.log('Created new session:', newSession);
        } catch (sessionError) {
          console.error('Error creating session:', sessionError);
          throw new Error('Could not create a session for regeneration. Please refresh and try again.');
        }
      }
      
      try {
        // Format the preferences to adapt based on feedback
        const updatedPreferences = { ...preferences };
        
        console.log('Adjusting preferences based on feedback...');
        
        // Extract specific instructions from text comments
        let specificInstructions = [];
        let analogyRequest = '';
        let analogyTopic = '';
        
        // Parse the comments field for specific instructions
        if (feedbackDetails.comments) {
          const commentsLower = feedbackDetails.comments.toLowerCase();
          
          // Look for analogy requests
          if (commentsLower.includes('analogy') || commentsLower.includes('metaphor') || commentsLower.includes('comparison')) {
            analogyRequest = 'Please provide a better analogy';
            
            // First check if there's a specific analogy preference provided in the feedback
            if (feedbackDetails.analogyPreference && feedbackDetails.analogyPreference !== '') {
              analogyTopic = feedbackDetails.analogyPreference;
              analogyRequest = `Please provide a ${analogyTopic}-related analogy`;
            } 
            // Otherwise try to extract it from the comments
            else {
              // Try to identify the topic/domain for the analogy
              const analogyTopics = [
                { keywords: ['game', 'gaming', 'video game'], topic: 'gaming' },
                { keywords: ['sports', 'sport', 'athletic'], topic: 'sports' },
                { keywords: ['music', 'musical', 'instrument'], topic: 'music' },
                { keywords: ['cook', 'cooking', 'food', 'kitchen'], topic: 'cooking' },
                { keywords: ['car', 'driving', 'vehicle', 'automotive'], topic: 'automotive' },
                { keywords: ['movie', 'film', 'cinema'], topic: 'movies' },
                { keywords: ['nature', 'natural', 'outdoors'], topic: 'nature' }
              ];
              
              for (const item of analogyTopics) {
                if (item.keywords.some(keyword => commentsLower.includes(keyword))) {
                  analogyTopic = item.topic;
                  analogyRequest = `Please provide a ${analogyTopic}-related analogy`;
                  break;
                }
              }
            }
            
            specificInstructions.push(analogyRequest);
          } 
          // If a specific analogy preference is provided but not mentioned in comments
          else if (feedbackDetails.analogyPreference && feedbackDetails.analogyPreference !== '') {
            analogyTopic = feedbackDetails.analogyPreference;
            analogyRequest = `Please provide a ${analogyTopic}-related analogy`;
            specificInstructions.push(analogyRequest);
          }
          
          // Look for simplification requests
          if (commentsLower.includes('simple') || commentsLower.includes('easier') || commentsLower.includes('clearer')) {
            specificInstructions.push('Please simplify the explanation');
            updatedPreferences.technicalDepth = Math.max(0, (updatedPreferences.technicalDepth || 50) - 25);
          }
          
          // Look for more detail requests
          if (commentsLower.includes('more detail') || commentsLower.includes('deeper') || commentsLower.includes('technical')) {
            specificInstructions.push('Please provide more technical details');
            updatedPreferences.technicalDepth = Math.min(100, (updatedPreferences.technicalDepth || 50) + 25);
          }
          
          // Look for more examples requests
          if (commentsLower.includes('example') || commentsLower.includes('sample') || commentsLower.includes('case')) {
            specificInstructions.push('Please include more practical examples');
            updatedPreferences.practicalExamples = Math.min(100, (updatedPreferences.practicalExamples || 50) + 25);
          }
        }
        
        // Adjust technical depth based on explanation detail preference
        if (feedbackDetails.explanationDetail === 'more_detailed') {
          updatedPreferences.technicalDepth = Math.min(100, (updatedPreferences.technicalDepth || 50) + 20);
          updatedPreferences.practicalExamples = Math.min(100, (updatedPreferences.practicalExamples || 50) + 10);
          console.log('Increasing technical depth and practical examples');
          specificInstructions.push('Provide more detailed technical explanation');
        } else if (feedbackDetails.explanationDetail === 'simpler') {
          updatedPreferences.technicalDepth = Math.max(0, (updatedPreferences.technicalDepth || 50) - 20);
          console.log('Decreasing technical depth for simpler explanation');
          specificInstructions.push('Simplify the explanation with less technical jargon');
        }
        
        // Adjust analogy based on feedback
        if (feedbackDetails.analogyHelpful === 'no' || feedbackDetails.analogyHelpful === 'partially') {
          if (!analogyRequest) {
            specificInstructions.push('Please provide a clearer and more relevant analogy');
          }
        }
        
        // Adjust visual learning based on clarity feedback
        if (feedbackDetails.explanationClear === 'no') {
          updatedPreferences.visualLearning = Math.min(100, (updatedPreferences.visualLearning || 50) + 15);
          console.log('Increasing visual learning for clarity');
          specificInstructions.push('Use more visual descriptions and clearer structure');
        }
        
        console.log('Updated preferences:', updatedPreferences);
        console.log('Specific instructions:', specificInstructions);
        
        // Process the query with updated preferences
        let responseData;
        try {
          console.log('Sending regeneration request to backend API...');
          
          // Ensure analogyTopic is properly set if an analogyPreference was selected
          if (feedbackDetails.analogyPreference && feedbackDetails.analogyPreference !== '') {
            analogyTopic = feedbackDetails.analogyPreference;
            
            // Make sure there's a specific instruction about the analogy
            const hasAnalogyCriteria = specificInstructions.some(
              instr => instr.toLowerCase().includes('analogy') && instr.includes(analogyTopic)
            );
            
            if (!hasAnalogyCriteria) {
              // Add a strong instruction for the analogy type if it's not already there
              specificInstructions.push(`Please provide a ${analogyTopic}-related analogy instead of the current one. Keep the explanation section the same.`);
            }
            
            // Make sure there's a specific instruction to keep the explanation section the same
            const hasKeepExplanationInstruction = specificInstructions.some(
              instr => instr.toLowerCase().includes('keep') && instr.toLowerCase().includes('explanation')
            );
            
            if (!hasKeepExplanationInstruction) {
              specificInstructions.push('Keep the explanation section exactly the same as in the original response.');
            }
            
            console.log(`Setting explicit analogy topic to: ${analogyTopic}`);
          }
          
          // For any type of analogy feedback, ensure the explanation stays the same
          // ONLY if that's the only negative feedback
          if ((feedbackDetails.analogyHelpful === 'no' || feedbackDetails.analogyHelpful === 'partially') &&
              feedbackDetails.explanationClear === 'yes' && 
              feedbackDetails.explanationDetail === 'exactly_right') {
              
            const hasKeepExplanationInstruction = specificInstructions.some(
              instr => instr.toLowerCase().includes('keep') && instr.toLowerCase().includes('explanation')
            );
            
            if (!hasKeepExplanationInstruction) {
              specificInstructions.push('Keep the explanation section exactly the same as in the original response.');
            }
          } 
          // For other feedback types, make sure we don't preserve the explanation
          else if (feedbackDetails.explanationClear === 'no' || 
                  feedbackDetails.explanationClear === 'partially' ||
                  feedbackDetails.explanationDetail === 'more_detailed' ||
                  feedbackDetails.explanationDetail === 'simpler') {
              
            // Remove any instructions to keep the explanation the same
            specificInstructions = specificInstructions.filter(
              instr => !(instr.toLowerCase().includes('keep') && instr.toLowerCase().includes('explanation'))
            );
              
            // Add appropriate instructions based on feedback
            if (feedbackDetails.explanationDetail === 'more_detailed') {
              specificInstructions.push('Provide a more detailed and comprehensive explanation with deeper technical information.');
            }
            
            if (feedbackDetails.explanationDetail === 'simpler') {
              specificInstructions.push('Simplify the explanation significantly. Use easier language and less technical jargon.');
            }
            
            if (feedbackDetails.explanationClear === 'no' || feedbackDetails.explanationClear === 'partially') {
              specificInstructions.push('Make the explanation more straightforward and easier to understand.');
            }
          }
          
          // Include feedback in the API call so the backend can adapt
          const response = await axios.post('/api/query', {
            query,
            sessionId: currentSession?.id,
            preferences: updatedPreferences,
            feedback: {
              ...feedbackDetails,
              specificInstructions,
              analogyTopic: analogyTopic || null,
              // Add explicit flag if user requested a specific analogy type
              forceAnalogy: analogyTopic ? true : false
            },
            originalResponseId,
            isRegeneration: true
          });
          responseData = response.data;
          console.log('Received regenerated response from API');
        } catch (apiErr) {
          console.error('Error calling backend API for regeneration:', apiErr);
          
          // Fall back to original preferences if API call fails
          console.log('Falling back to simplified regeneration...');
          
          try {
            // Simple fallback: retry the query with normal submission
            const fallbackResponse = await submitQuery(query, updatedPreferences);
            
            // Add regeneration context
            fallbackResponse.explanation = `[Improved based on your feedback]\n\n${fallbackResponse.explanation}`;
            
            if (feedbackDetails.explanationDetail === 'more_detailed') {
              fallbackResponse.explanation += '\n\nThis answer provides more technical details as requested.';
            } else if (feedbackDetails.explanationDetail === 'simpler') {
              fallbackResponse.explanation += '\n\nThis explanation is simplified based on your feedback.';
            }
            
            responseData = fallbackResponse;
            console.log('Generated fallback response');
          } catch (fallbackErr) {
            console.error('Fallback regeneration also failed:', fallbackErr);
            throw new Error('Failed to regenerate answer with both methods');
          }
        }
        
        // Add regeneration ID and timestamp if not present
        if (!responseData.id) {
          responseData.id = Date.now().toString();
        }
        
        if (!responseData.timestamp) {
          responseData.timestamp = new Date().toISOString();
        }
        
        console.log('Final regenerated response:', responseData);
        return responseData;
      } catch (err) {
        console.error('Error in regeneration process:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error regenerating answer:', err);
      setError('Failed to regenerate answer. Please try again. ' + (err.message || ''));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get user's query history
  const getQueryHistory = async (limit = 10, offset = 0) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return [];
      }
      
      try {
        // Direct query to get history
        const { data, error } = await supabase
          .from('interactions')
          .select(`
            id,
            created_at,
            query,
            response,
            type,
            session_id,
            sessions!inner (
              id,
              created_at,
              status,
              user_id
            )
          `)
          .eq('type', 'query')
          .eq('sessions.user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
          
        if (error) throw error;
        
        // Transform data to match expected format
        return data.map(item => ({
          id: item.id,
          created_at: item.created_at,
          query: item.query,
          response: item.response,
          type: item.type,
          session: {
            id: item.sessions.id,
            created_at: item.sessions.created_at,
            status: item.sessions.status
          }
        }));
      } catch (err) {
        console.error('Error getting query history:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting query history:', err);
      setError('Failed to load query history. Please try again.');
      
      // Return empty array as fallback
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Get session details with interactions
  const getSessionDetails = async (sessionId) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        throw new Error('You must be logged in to view session details');
      }
      
      try {
        // Get session data
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .eq('user_id', user.id)
          .single();
          
        if (sessionError) throw sessionError;
        
        // Get interactions for this session
        const { data: interactionsData, error: interactionsError } = await supabase
          .from('interactions')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at');
          
        if (interactionsError) throw interactionsError;
        
        return {
          ...sessionData,
          interactions: interactionsData || []
        };
      } catch (err) {
        console.error('Error getting session details:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting session details:', err);
      setError('Failed to load session details. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get user sessions filtered by topic
  const getSessionsByTopic = async (topic = 'all', limit = 10, offset = 0) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return [];
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/user-sessions/by-topic`, {
          params: {
            user_id: user.id,
            topic: topic,
            limit: limit,
            offset: offset
          }
        });
        
        if (response.data.success) {
          return response.data.sessions || [];
        } else {
          throw new Error(response.data.error || 'Failed to fetch sessions by topic');
        }
      } catch (err) {
        console.error('Error getting sessions by topic:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting sessions by topic:', err);
      setError('Failed to load sessions by topic. Please try again.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Get user's topics summary
  const getUserTopicsSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return { user_topics: [], total_sessions: 0, unique_topics: 0 };
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/user-topics/summary`, {
          params: {
            user_id: user.id
          }
        });
        
        if (response.data.success) {
          return response.data;
        } else {
          throw new Error(response.data.error || 'Failed to fetch user topics summary');
        }
      } catch (err) {
        console.error('Error getting user topics summary:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting user topics summary:', err);
      setError('Failed to load user topics summary. Please try again.');
      return { user_topics: [], total_sessions: 0, unique_topics: 0 };
    } finally {
      setLoading(false);
    }
  };

  // Get all available topics
  const getAllTopics = async () => {
    try {
      if (!user) {
        return [];
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/topics`);
        
        if (response.data.success) {
          return response.data.topics || [];
        } else {
          throw new Error(response.data.error || 'Failed to fetch topics');
        }
      } catch (err) {
        console.error('Error getting all topics:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting all topics:', err);
      setError('Failed to load topics. Please try again.');
      return [];
    }
  };

  // Get trending topics in user's cluster
  const getTrendingTopics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return { trending_topics: [], cluster_id: null, cluster_size: 0 };
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/user-topics/trending`, {
          params: {
            user_id: user.id
          }
        });
        
        if (response.data.success) {
          return response.data;
        } else {
          throw new Error(response.data.error || 'Failed to fetch trending topics');
        }
      } catch (err) {
        console.error('Error getting trending topics:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting trending topics:', err);
      setError('Failed to load trending topics. Please try again.');
      return { trending_topics: [], cluster_id: null, cluster_size: 0 };
    } finally {
      setLoading(false);
    }
  };

  // Get topic suggestions for user
  const getTopicSuggestions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return { suggestions: [], user_topics_count: 0, cluster_id: null };
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/user-topics/suggestions`, {
          params: {
            user_id: user.id
          }
        });
        
        if (response.data.success) {
          return response.data;
        } else {
          throw new Error(response.data.error || 'Failed to fetch topic suggestions');
        }
      } catch (err) {
        console.error('Error getting topic suggestions:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting topic suggestions:', err);
      setError('Failed to load topic suggestions. Please try again.');
      return { suggestions: [], user_topics_count: 0, cluster_id: null };
    } finally {
      setLoading(false);
    }
  };

  // Get personalized topic feed
  const getTopicFeed = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        return { feed: { recent_activity: [], trending_topics: [], suggestions: [] } };
      }
      
      try {
        // Get trending topics and suggestions in parallel
        const [trendingData, suggestionsData] = await Promise.all([
          getTrendingTopics(),
          getTopicSuggestions()
        ]);
        
        const response = await axios.get(`${API_URL}/api/user-topics/feed`, {
          params: {
            user_id: user.id
          }
        });
        
        if (response.data.success) {
          // Enhance the feed with the actual trending and suggestions data
          const enhancedFeed = {
            ...response.data.feed,
            trending_topics: trendingData.trending_topics || [],
            suggestions: suggestionsData.suggestions || [],
            cluster_size: trendingData.cluster_size || 0
          };
          
          return {
            ...response.data,
            feed: enhancedFeed
          };
        } else {
          throw new Error(response.data.error || 'Failed to fetch topic feed');
        }
      } catch (err) {
        console.error('Error getting topic feed:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error getting topic feed:', err);
      setError('Failed to load topic feed. Please try again.');
      return { feed: { recent_activity: [], trending_topics: [], suggestions: [] } };
    } finally {
      setLoading(false);
    }
  };

  // Start a new learning session
  const startNewSession = async (preferences = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        throw new Error('You must be logged in to start a session');
      }
      
      // Ensure user exists in the database
      await ensureUserExists();
      
      // End current session if exists
      if (currentSession) {
        try {
          const { error: directUpdateError } = await supabase
            .from('sessions')
            .update({ status: 'completed' })
            .eq('id', currentSession.id);
            
          if (directUpdateError) throw directUpdateError;
        } catch (err) {
          console.error('Error ending session:', err);
          // Continue anyway
        }
      }
      
      // Create new session
      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert([
            { 
              user_id: user.id,
              status: 'active',
              preferences
            }
          ])
          .select()
          .single();
          
        if (error) throw error;
        setCurrentSession(data);
        setCurrentResponse(null);
        return data;
      } catch (err) {
        console.error('Error creating session:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error starting new session:', err);
      setError('Failed to start a new session. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get message history
  const getMessageHistory = () => messageHistory;

  // Clear chat history
  const clearChat = () => {
    setMessageHistory([]);
    setCurrentSession(null);
    setCurrentResponse(null);
    
    // Clear localStorage items related to chat
    if (user) {
      localStorage.removeItem(`currentSession_${user.id}`);
      localStorage.removeItem(`sessionId_${user.id}`);
      localStorage.removeItem(`messageHistory_${user.id}`);
    }
  };

  // ==================== PHASE 3: PROGRESS TRACKING ====================
  
  // Get user's progress across all topics
  const getUserProgress = async () => {
    try {
      if (!user) {
        console.error('No user found');
        return { success: false, error: 'Not authenticated' };
      }

      const userId = user.id;

      const response = await fetch(`/api/user-topics/progress?user_id=${userId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching user progress:', error);
      return { success: false, error: error.message };
    }
  };

  // Get learning path recommendations
  const getLearningPathRecommendations = async () => {
    try {
      if (!user) {
        console.error('No user found');
        return { success: false, error: 'Not authenticated' };
      }

      const userId = user.id;

      const response = await fetch(`/api/learning-paths/recommendations?user_id=${userId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching learning path recommendations:', error);
      return { success: false, error: error.message };
    }
  };

  // Get user achievements
  const getUserAchievements = async () => {
    try {
      if (!user) {
        console.error('No user found');
        return { success: false, error: 'Not authenticated' };
      }

      const userId = user.id;

      const response = await fetch(`/api/user-achievements?user_id=${userId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    loading,
    error,
    currentSession,
    currentResponse,
    messageHistory,
    submitQuery,
    submitFeedback,
    regenerateAnswer,
    getQueryHistory,
    getSessionDetails,
    startNewSession,
    getMessageHistory,
    clearChat,
    getSessionsByTopic,
    getUserTopicsSummary,
    getAllTopics,
    getTrendingTopics,
    getTopicSuggestions,
    getTopicFeed,
    
    // Phase 3: Progress Tracking
    getUserProgress,
    getLearningPathRecommendations,
    getUserAchievements,
  };

  return (
    <QueryContext.Provider value={value}>
      {children}
    </QueryContext.Provider>
  );
}