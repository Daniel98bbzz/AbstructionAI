import React, { createContext, useContext, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import axios from 'axios';

const QueryContext = createContext();

export function useQuery() {
  return useContext(QueryContext);
}

export function QueryProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [currentResponse, setCurrentResponse] = useState(null);
  const [messageHistory, setMessageHistory] = useState([]);

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

  // Submit a new query to the AI
  const submitQuery = async (query, preferences = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      if (!user) {
        throw new Error('You must be logged in to submit a query');
      }
      
      // Ensure user exists in the database
      await ensureUserExists();
      
      // Use existing session ID if available
      const sessionId = currentSession?.id;
      
      // Process the query using the backend server
      let responseData;
      try {
        // Add query to message history immediately for UI feedback
        const newMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
        setMessageHistory(prev => [...prev, newMessage]);

        // Try to use the backend server if it's running
        const response = await axios.post('/api/query', {
          query,
          sessionId,
          preferences
        });
        responseData = response.data;
        
        // Update message history with AI response
        const aiMessage = {
          role: 'assistant',
          content: responseData.explanation,
          analogy: responseData.analogy,
          resources: responseData.resources,
          timestamp: new Date().toISOString()
        };
        setMessageHistory(prev => [...prev, aiMessage]);
        
        // Set current session if not already set
        if (responseData.sessionId && !currentSession) {
          setCurrentSession({ id: responseData.sessionId });
        }
      } catch (err) {
        console.error('Error calling backend API:', err);
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
      
      if (!user) {
        throw new Error('You must be logged in to submit feedback');
      }
      
      if (!currentSession) {
        throw new Error('No active session found');
      }
      
      try {
        // Direct insert to interactions table
        const { data, error: directFeedbackError } = await supabase
          .from('interactions')
          .insert([
            {
              session_id: currentSession.id,
              related_to: responseId,
              rating,
              comments,
              type: 'feedback'
            }
          ])
          .select();
          
        if (directFeedbackError) throw directFeedbackError;
        return data[0];
      } catch (err) {
        console.error('Error submitting feedback:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again.');
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
      
      if (!user) {
        throw new Error('You must be logged in to regenerate an answer');
      }
      
      if (!currentSession) {
        throw new Error('No active session found');
      }
      
      try {
        // Format the preferences to adapt based on feedback
        const updatedPreferences = { ...preferences };
        
        // Adjust technical depth based on explanation detail preference
        if (feedbackDetails.explanationDetail === 'more_detailed') {
          updatedPreferences.technicalDepth = Math.min(100, updatedPreferences.technicalDepth + 20);
          updatedPreferences.practicalExamples = Math.min(100, updatedPreferences.practicalExamples + 10);
        } else if (feedbackDetails.explanationDetail === 'simpler') {
          updatedPreferences.technicalDepth = Math.max(0, updatedPreferences.technicalDepth - 20);
        }
        
        // Adjust visual learning based on clarity feedback
        if (feedbackDetails.explanationClear === 'no') {
          updatedPreferences.visualLearning = Math.min(100, updatedPreferences.visualLearning + 15);
        }
        
        // Process the query with updated preferences
        let responseData;
        try {
          // Include feedback in the API call so the backend can adapt
          const response = await axios.post('/api/query', {
            query,
            sessionId: currentSession.id,
            preferences: updatedPreferences,
            feedback: feedbackDetails,
            originalResponseId,
            isRegeneration: true
          });
          responseData = response.data;
        } catch (err) {
          console.error('Error calling backend API for regeneration:', err);
          
          // Fall back to local processing
          responseData = await processQueryLocally(query, updatedPreferences);
          
          // Add regeneration context to the response
          responseData.explanation = `[Improved response based on your feedback]\n\n${responseData.explanation}`;
          
          if (feedbackDetails.explanationDetail === 'more_detailed') {
            responseData.explanation += '\n\nThis improved answer provides more details as requested in your feedback.';
          } else if (feedbackDetails.explanationDetail === 'simpler') {
            responseData.explanation += '\n\nThis improved answer uses simpler explanations as requested in your feedback.';
          }
          
          if (feedbackDetails.analogyHelpful === 'no' && responseData.analogy) {
            responseData.analogy = `I've revised this analogy based on your feedback: ${responseData.analogy}`;
          }
        }
        
        return responseData;
      } catch (err) {
        console.error('Error regenerating answer:', err);
        throw err;
      }
    } catch (err) {
      console.error('Error regenerating answer:', err);
      setError('Failed to regenerate answer. Please try again.');
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
    clearChat
  };

  return (
    <QueryContext.Provider value={value}>
      {children}
    </QueryContext.Provider>
  );
}