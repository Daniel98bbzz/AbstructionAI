import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { supabase } from './lib/supabaseClient.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import setupQuizRoutes from './api/quizRoutes.js';
import setupClusterRoutes from './api/clusterRoutes.js';

/**
 * Parse sections from the OpenAI response
 * @param {string} responseText - Raw response text from OpenAI
 * @returns {Object} - Parsed sections
 */
function parseResponse(responseText) {
  try {
    // Always treat responses as natural conversation
    const trimmedResponse = responseText.trim();
    
    // Return conversational format - no forced structure
    return {
      suggested_title: '',
      is_structured: false,
      introduction: '',
      explanation: trimmedResponse, // Use entire response as natural conversation
      analogy: '',
      analogy_title: '',
      example: '',
      example_title: '',
      additional_sources: [],
      recap: '',
      key_takeaways: []
    };
  } catch (error) {
    console.error('Error in response parsing:', error);
    console.log('Raw response:', responseText);
    
    // Fallback - still conversational
    return {
      suggested_title: '',
      is_structured: false,
      introduction: '',
      explanation: responseText || 'Sorry, there was an error processing this response.',
      analogy: '',
      analogy_title: '',
      example: '',
      example_title: '',
      additional_sources: [],
      recap: '',
      key_takeaways: []
    };
  }
}

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to ensure a value is an array
function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [value];
    } catch (e) {
      return [value]; // If we can't parse it, wrap the string in an array
    }
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value]; // For any other type, wrap in array
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Load environment variables
dotenv.config();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Managers
import UserManager from './managers/UserManager.js';
import PromptManager from './managers/PromptManager.js';
import SessionManager from './managers/SessionManager.js';
import FeedbackProcessor from './managers/FeedbackProcessor.js';
import Supervisor from './managers/Supervisor.js';
import UserProfileManager from './managers/UserProfileManager.js';
import ResponseClusterManager from './managers/ResponseClusterManager.js';

// Initialize managers
const userManager = new UserManager();
const promptManager = PromptManager;
const sessionManager = new SessionManager();
const feedbackProcessor = new FeedbackProcessor();
const supervisor = new Supervisor();

// Routes
app.post('/api/query', async (req, res) => {
  try {
    const { query, sessionId, preferences, feedback, isRegeneration, originalResponseId, abTestGroup } = req.body;
    
    console.log('Received query request:', { 
      query, 
      sessionId: sessionId || 'none', 
      preferencesProvided: !!preferences,
      isRegeneration: !!isRegeneration,
      hasFeedback: !!feedback,
      abTestGroup: abTestGroup || 'default'
    });
    
    const userId = req.user?.id || req.body.userId;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    let sessionData;
    if (sessionId) {
      sessionData = await sessionManager.getSession(sessionId);
      if (!sessionData) {
        const tempUserId = userId || `anon_${Date.now()}`;
        sessionData = await sessionManager.createSession(tempUserId, preferences);
      }
    } else {
      const tempUserId = userId || `anon_${Date.now()}`;
      sessionData = await sessionManager.createSession(tempUserId, preferences);
    }

    let enhancedQuery = query;
    let usedTemplate = null;
    let crowdWisdomTopic = null;
    let selectionMethod = 'none';
    const hasLimitedContext = !sessionData.interactions || sessionData.interactions.length < 2;

    if (hasLimitedContext && !isRegeneration) {
      try {
        console.log('[Crowd Wisdom] User has limited context, applying crowd wisdom enhancement to user query');
        let useCompositeScore = abTestGroup ? (abTestGroup === 'composite' || abTestGroup === 'new') : (Math.random() < 0.7);
        const explorationRate = useCompositeScore ? 0.15 : 0.1;
        const crowdWisdomResult = await supervisor.processQueryWithCrowdWisdom(
          query, 
          sessionData.id, 
          userId, 
          openai,
          useCompositeScore,
          explorationRate
        );
        enhancedQuery = crowdWisdomResult.enhancedQuery;
        usedTemplate = crowdWisdomResult.template;
        crowdWisdomTopic = crowdWisdomResult.topic;
        selectionMethod = crowdWisdomResult.selectionMethod;
        if (usedTemplate) {
          console.log(`[Crowd Wisdom] Enhanced user query with template ID: ${usedTemplate.id} using ${selectionMethod}`);
        }
      } catch (crowdWisdomError) {
        console.error('[Crowd Wisdom] Error enhancing user query:', crowdWisdomError);
        enhancedQuery = query;
      }
    }

    // Initialize historyMessages array ONCE here
    const historyMessages = []; 

    // Generate the simplified prompt using PromptManager
    const promptManagerMessages = (await promptManager.generatePrompt(enhancedQuery)).messages;
    const systemContext = promptManagerMessages.find(m => m.role === 'system');
    const userQueryForHistory = promptManagerMessages.find(m => m.role === 'user');

    if (systemContext) {
      historyMessages.push(systemContext);
    }

    // Add recent conversation history
    if (sessionData.interactions && sessionData.interactions.length > 0) {
      const recentInteractions = sessionData.interactions
        .filter(interaction => interaction.type === 'query')
        .slice(-5);
      for (const interaction of recentInteractions) {
        historyMessages.push(
          { role: "user", content: interaction.query },
          { 
            role: "assistant", 
            content: interaction.response.explanation || ''
          }
        );
      }
    }

    // Add current user query
    if (userQueryForHistory) {
      historyMessages.push(userQueryForHistory);
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: historyMessages,
      temperature: 0.8, 
      max_tokens: 6000, 
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });
    
    // Process the response
    const responseText = completion.choices[0].message.content;
    
    // Extract conversation title first
    const conversationTitleMatch = responseText.match(/CONVERSATION_TITLE:\s*([^\n]+)/);
    const conversationTitle = conversationTitleMatch ? conversationTitleMatch[1].trim() : '';

    // Extract quiz data and clean up response text before parsing sections
    const quizMatch = responseText.match(/Quiz:\s*(\{[\s\S]*\}\s*\}\s*\})/);
    let cleanedResponseText = responseText;
    let sections;

    // Store quiz data separately and remove from main response
    if (quizMatch && quizMatch[1]) {
      try {
        const quizData = JSON.parse(quizMatch[1]);
        // Remove the entire quiz section from the response text
        cleanedResponseText = responseText.replace(/Quiz:\s*\{[\s\S]*\}\s*\}\s*\}/, '').trim();
        
        // Parse sections from cleaned response text
        sections = parseResponse(cleanedResponseText);
        
        // Add quiz data as separate property
        sections.quiz = quizData;
      } catch (e) {
        console.error('Error parsing quiz data:', e);
        // Parse sections from original response if quiz parsing fails
        sections = parseResponse(responseText);
      }
    } else {
      // No quiz found, parse sections normally
      sections = parseResponse(responseText);
    }
    
    // Prepare final response with quiz included and conversation title
    const response = {
      id: uuidv4(),
      sessionId: sessionData.id,
      query,
      conversation_title: conversationTitle, // Add the conversation title here
      suggested_title: sections.suggested_title,
      is_structured: sections.is_structured || false,
      introduction: sections.introduction,
      explanation: sections.explanation,
      analogy: sections.analogy,
      analogy_title: sections.analogy_title,
      example: sections.example,
      example_title: sections.example_title,
      resources: sections.additional_sources,
      recap: sections.recap,
      key_takeaways: sections.key_takeaways,
      quiz: sections.quiz,
      timestamp: new Date().toISOString(),
      // Add Crowd Wisdom metadata
      crowd_wisdom: usedTemplate ? {
        applied: true,
        template_id: usedTemplate.id,
        topic: crowdWisdomTopic,
        selection_method: selectionMethod
      } : {
        applied: false
      }
    };

    // Topic Classification - Classify the conversation topic using OpenAI
    let secretTopic = null;
    try {
      console.log('[Topic Classification] Starting topic classification...');
      
      // Get existing topics from database
      const { data: existingTopics, error: topicsError } = await supabase
        .from('topics')
        .select('name, description')
        .eq('is_active', true);
      
      if (topicsError) {
        console.error('[Topic Classification] Error fetching topics:', topicsError);
      }
      
      const topicsList = existingTopics?.map(t => t.name) || [];
      const topicsContext = existingTopics?.map(t => `${t.name}: ${t.description}`).join('\n') || '';
      
      // Create topic classification prompt
      const topicClassificationPrompt = `You are a topic classifier for an educational AI tutoring system. 
Analyze the following query and conversation context to determine the most appropriate topic.

EXISTING TOPICS:
${topicsContext}

USER QUERY: ${query}

CONVERSATION CONTEXT: ${sections.explanation?.substring(0, 500) || ''}

INSTRUCTIONS:
1. If the query fits one of the existing topics above, respond with EXACTLY that topic name
2. If no existing topic fits well, create a new descriptive topic name (use underscores, lowercase)
3. Respond with ONLY the topic name, nothing else
4. Examples of good topic names: "linear_algebra", "organic_chemistry", "machine_learning", "calculus"

TOPIC:`;

      const topicCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: topicClassificationPrompt }],
        temperature: 0.1,
        max_tokens: 50
      });
      
      secretTopic = topicCompletion.choices[0].message.content.trim();
      console.log(`[Topic Classification] Classified topic: ${secretTopic}`);
      
      // If it's a new topic, add it to the topics table
      if (!topicsList.includes(secretTopic)) {
        console.log(`[Topic Classification] Adding new topic: ${secretTopic}`);
        const { error: insertError } = await supabase
          .from('topics')
          .insert({
            name: secretTopic,
            description: `Automatically generated topic for: ${secretTopic.replace(/_/g, ' ')}`
          });
        
        if (insertError) {
          console.error('[Topic Classification] Error adding new topic:', insertError);
        }
      }
      
      // Update topic usage count
      const { data: topicData } = await supabase
        .from('topics')
        .select('usage_count')
        .eq('name', secretTopic)
        .single();
      
      const currentCount = topicData?.usage_count || 0;
      const { error: updateError } = await supabase
        .from('topics')
        .update({ 
          usage_count: currentCount + 1,
          updated_at: new Date().toISOString()
        })
        .eq('name', secretTopic);
      
      if (updateError) {
        console.error('[Topic Classification] Error updating topic usage:', updateError);
      }
      
    } catch (topicError) {
      console.error('[Topic Classification] Error in topic classification:', topicError);
      secretTopic = 'general'; // Fallback topic
    }

    // Update session with secret_topic
    try {
      const { error: sessionUpdateError } = await supabase
        .from('sessions')
        .update({ secret_topic: secretTopic })
        .eq('id', sessionData.id);
      
      if (sessionUpdateError) {
        console.error('[Topic Classification] Error updating session with topic:', sessionUpdateError);
      } else {
        console.log(`[Topic Classification] Updated session ${sessionData.id} with topic: ${secretTopic}`);
      }
    } catch (sessionError) {
      console.error('[Topic Classification] Error updating session:', sessionError);
    }

    // Add secret_topic to response for frontend
    response.secret_topic = secretTopic;
    
    // Add AI response with unique ID for feedback
    const responseId = response.id || Date.now().toString();
    const aiMessage = {
      id: responseId,
      type: 'assistant',
      content: response.explanation,
      is_structured: response.is_structured,
      introduction: response.introduction,
      analogy: response.analogy,
      analogy_title: response.analogy_title,
      example: response.example,
      example_title: response.example_title,
      resources: response.resources,
      key_takeaways: response.key_takeaways,
      recap: response.recap,
      quiz: response.quiz, // Add the quiz to the message
      timestamp: new Date().toISOString(),
      messageId: responseId,
      secret_topic: secretTopic, // Add topic to message
      // Add Crowd Wisdom metadata to the message
      crowd_wisdom: response.crowd_wisdom
    };

    // Add interaction to session
    await sessionManager.addInteraction(sessionData.id, {
      type: 'query',
      query,
      response,
      aiMessage // Include the aiMessage in the interaction
    });
    
    // If Crowd Wisdom was applied, update template usage with the new responseId
    if (usedTemplate) {
      try {
        console.log(`[Crowd Wisdom] Updating template usage with response ID: ${responseId}`);
        await supervisor.responseClusterManager.logTemplateUsage(
          usedTemplate.id,
          sessionData.id,
          userId,
          query,
          responseId
        );
      } catch (updateError) {
        console.error('[Crowd Wisdom] Error updating template usage:', updateError);
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error processing query:', error);
    const errorMessage = error.message || 'Unknown server error';
    const errorDetails = process.env.NODE_ENV === 'development' ? 
      { stack: error.stack, details: error.toString() } : {};
    
    res.status(500).json({ 
      error: 'Failed to process query', 
      message: errorMessage,
      ...errorDetails
    });
  }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { responseId, rating, comments, sessionId, responseData, originalQuery } = req.body;
    
    if (!responseId || !rating || !sessionId) {
      return res.status(400).json({ error: 'Response ID, rating, and session ID are required' });
    }
    
    // Get the user ID
    const userId = req.user?.id || req.body.userId;
    
    // Process feedback with enhanced parameters for Crowd Wisdom
    const feedback = await feedbackProcessor.processFeedback(
      responseId,
      rating,
      comments,
      userId,
      responseData,
      originalQuery,
      openai // Pass the OpenAI client for quality evaluation
    );
    
    // Add feedback interaction to session
    await sessionManager.addInteraction(sessionId, {
      type: 'feedback',
      responseId,
      rating,
      comments,
      feedback
    });
    
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Error processing feedback:', error);
    res.status(500).json({ error: 'Failed to process feedback' });
  }
});

// Add component-level feedback endpoint
app.post('/api/component-feedback', async (req, res) => {
  try {
    const { 
      usageId, 
      analogyRating, 
      explanationRating, 
      clarityRating, 
      relevanceRating,
      sessionId 
    } = req.body;
    
    if (!usageId) {
      return res.status(400).json({ error: 'Usage ID is required' });
    }
    
    // Get the user ID
    const userId = req.user?.id || req.body.userId;
    
    console.log(`[Crowd Wisdom] Received component feedback for usage ${usageId}`);
    
    // Store component-level feedback
    const { data, error } = await supabase
      .from('template_component_feedback')
      .insert({
        template_usage_id: usageId,
        analogy_rating: analogyRating || null,
        explanation_rating: explanationRating || null,
        clarity_rating: clarityRating || null,
        relevance_rating: relevanceRating || null
      });
    
    if (error) {
      console.error('[Crowd Wisdom] Error storing component feedback:', error);
      throw error;
    }
    
    // Also update the component_rating JSONB field with averages
    // Get the template_id from usage
    const { data: usage } = await supabase
      .from('prompt_template_usage')
      .select('template_id')
      .eq('id', usageId)
      .single();
      
    if (usage && usage.template_id) {
      // Get all component ratings for this template
      const { data: allComponentFeedback } = await supabase
        .from('template_component_feedback')
        .select('*')
        .eq('template_usage_id', usageId);
        
      // Calculate averages
      const componentAverages = {
        analogy: calculateAverage(allComponentFeedback, 'analogy_rating'),
        explanation: calculateAverage(allComponentFeedback, 'explanation_rating'),
        clarity: calculateAverage(allComponentFeedback, 'clarity_rating'),
        relevance: calculateAverage(allComponentFeedback, 'relevance_rating')
      };
      
      // Update template with component averages
      await supabase
        .from('prompt_templates')
        .update({ component_rating: componentAverages })
        .eq('id', usage.template_id);
        
      console.log(`[Crowd Wisdom] Updated component ratings for template ${usage.template_id}`);
    }
    
    // If sessionId provided, add an interaction for this component feedback
    if (sessionId) {
      await sessionManager.addInteraction(sessionId, {
        type: 'component_feedback',
        usageId,
        analogyRating,
        explanationRating,
        clarityRating,
        relevanceRating
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing component feedback:', error);
    res.status(500).json({ error: 'Failed to process component feedback' });
  }
});

// Helper function to calculate average
function calculateAverage(items, field) {
  const validItems = items.filter(item => item[field] !== null);
  if (validItems.length === 0) return null;
  return validItems.reduce((sum, item) => sum + item[field], 0) / validItems.length;
}

// Add context endpoint
app.get('/api/context/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get conversation summary
    const summary = sessionManager.getConversationSummary(sessionId);
    
    res.json(summary);
  } catch (error) {
    console.error('Error getting context:', error);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// User Profile Routes
app.get('/api/user/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await UserProfileManager.getProfile(userId);
    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.put('/api/user/profile', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const profileData = req.body;
    console.log('Updating profile for user:', userId);
    console.log('New profile data:', profileData);
    
    // Update in database
    const updatedProfile = await UserProfileManager.updateProfile(userId, profileData);
    
    // Also update in memory cache
    global.userProfiles = global.userProfiles || {};
    
    // Format arrays properly
    const formattedProfile = {
      ...updatedProfile,
      interests: Array.isArray(updatedProfile.interests) ? 
        updatedProfile.interests : 
        (typeof updatedProfile.interests === 'string' ? 
          JSON.parse(updatedProfile.interests) : 
          ['Video Games', 'Art']),
      preferred_analogy_domains: Array.isArray(updatedProfile.preferred_analogy_domains) ? 
        updatedProfile.preferred_analogy_domains : 
        (typeof updatedProfile.preferred_analogy_domains === 'string' ? 
          JSON.parse(updatedProfile.preferred_analogy_domains) : 
          ['Gaming', 'Cooking'])
    };
    
    // Update in memory cache
    global.userProfiles[userId] = formattedProfile;
    
    console.log('Profile updated. New preferences:', {
      interests: formattedProfile.interests,
      preferred_analogy_domains: formattedProfile.preferred_analogy_domains
    });
    
    res.json(formattedProfile);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile', details: error.message });
  }
});

app.get('/api/user/learning-preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await UserProfileManager.getLearningPreferences(userId);
    res.json(preferences);
  } catch (error) {
    console.error('Error fetching learning preferences:', error);
    res.status(500).json({ error: 'Failed to fetch learning preferences' });
  }
});

app.get('/api/user/interests', async (req, res) => {
  try {
    const userId = req.user.id;
    const interests = await UserProfileManager.getInterests(userId);
    res.json(interests);
  } catch (error) {
    console.error('Error fetching user interests:', error);
    res.status(500).json({ error: 'Failed to fetch user interests' });
  }
});

app.get('/api/user/demographics', async (req, res) => {
  try {
    const userId = req.user.id;
    const demographics = await UserProfileManager.getDemographics(userId);
    res.json(demographics);
  } catch (error) {
    console.error('Error fetching user demographics:', error);
    res.status(500).json({ error: 'Failed to fetch user demographics' });
  }
});

// Add debug endpoint
app.get('/api/debug/user-profile', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Debug: Fetching user profile for ID:', userId);
    
    let userProfile = null;
    
    // Try UserProfileManager first
    try {
      userProfile = await UserProfileManager.getProfile(userId);
      console.log('Debug: UserProfileManager result:', !!userProfile);
    } catch (managerError) {
      console.error('Debug: UserProfileManager error:', managerError);
    }
    
    // Fallback to direct query
    if (!userProfile) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (!error && data) {
        userProfile = data;
        console.log('Debug: Direct query successful');
      } else if (error) {
        console.error('Debug: Direct query error:', error);
      }
    }
    
    if (userProfile) {
      res.json({
        success: true,
        profile: userProfile
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }
  } catch (error) {
    console.error('Debug: Error in profile debug endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add test route to create a new profile
app.post('/api/test/create-profile', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Creating test profile for user ID:', userId);
    
    // Try to create a profile with the specified preferences
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert([{
          id: userId,
          username: 'user_' + userId.substring(0, 8),
          occupation: 'Software Developer',
          age: 28,
          education_level: 'Undergraduate',
          interests: ['Video Games', 'Art', 'Technology'],
          learning_style: 'Visual',
          technical_depth: 70,
          preferred_analogy_domains: ['Gaming', 'Cooking'],
          main_learning_goal: 'Professional Development'
        }])
        .select();
        
      if (error) {
        console.error('Error creating test profile:', error);
        
        // Try direct SQL
        try {
          console.log('Attempting direct SQL for profile creation');
          const { data: sqlData, error: sqlError } = await supabase.rpc('create_user_profile', {
            user_id: userId,
            username: 'user_' + userId.substring(0, 8),
            occupation: 'Software Developer',
            age: 28,
            education_level: 'Undergraduate',
            interests: ['Video Games', 'Art', 'Technology'],
            learning_style: 'Visual',
            technical_depth: 70,
            preferred_analogy_domains: ['Gaming', 'Cooking'],
            main_learning_goal: 'Professional Development'
          });
          
          if (sqlError) {
            console.error('RPC create profile failed:', sqlError);
            res.status(500).json({
              success: false,
              error: 'Both methods failed: ' + error.message + ' & ' + sqlError.message,
              suggestion: 'Please ask admin to run the SQL function creation script'
            });
          } else {
            console.log('Profile created successfully via RPC');
            res.json({
              success: true,
              profile: sqlData,
              method: 'rpc'
            });
          }
        } catch (rpcError) {
          console.error('RPC error:', rpcError);
          res.status(500).json({
            success: false,
            error: 'Both methods failed: ' + error.message + ' & ' + rpcError.message
          });
        }
      } else {
        console.log('Test profile created successfully:', data);
        res.json({
          success: true,
          profile: data[0],
          method: 'upsert'
        });
      }
    } catch (createError) {
      console.error('Exception creating test profile:', createError);
      res.status(500).json({
        success: false,
        error: createError.message
      });
    }
  } catch (error) {
    console.error('Test profile creation route error:', error);
    res.status(500).json({
      success: false, 
      error: error.message
    });
  }
});

// Add a special route to force a user profile with memory-only data
app.post('/api/force-user-profile', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Initialize global cache if needed
    global.userProfiles = global.userProfiles || {};
    let forcedProfile;
    
    // First check if we already have this profile in memory cache
    if (global.userProfiles[userId]) {
      console.log('Using existing profile from memory cache for user:', userId);
      forcedProfile = global.userProfiles[userId];
      
      console.log('Using existing memory cache profile with preferences:', {
        interests: forcedProfile.interests,
        preferred_analogy_domains: forcedProfile.preferred_analogy_domains
      });
      
      // Don't overwrite - just return the existing memory cache entry
      return res.json({
        success: true,
        profile: forcedProfile,
        source: 'memory-cache',
        note: 'Using existing profile from memory cache'
      });
    }
    
    // If not in memory, try to load from database
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (!error && data) {
      console.log('Found existing profile in database for user:', userId);
      
      // Parse arrays if necessary
      const ensureArray = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch (e) {
            return [value]; // If we can't parse it, wrap the string in an array
          }
        }
        if (value === null || value === undefined) {
          return [];
        }
        return [value]; // For any other type, wrap in array
      };
      
      // Create a properly formatted profile using the database data
      forcedProfile = {
        ...data,
        interests: ensureArray(data.interests),
        preferred_analogy_domains: ensureArray(data.preferred_analogy_domains)
      };
      
      console.log('Loaded profile preferences from database:', {
        interests: forcedProfile.interests,
        preferred_analogy_domains: forcedProfile.preferred_analogy_domains
      });
    } else {
      console.log('No profile found in database, creating memory-only default for user:', userId);
      
      // Create a memory representation of a profile
      forcedProfile = {
        id: userId,
        username: 'user_' + userId.substring(0, 8),
        occupation: 'Student',
        age: 25,
        education_level: 'Undergraduate',
        interests: ['Video Games', 'Art'],
        learning_style: 'Visual',
        technical_depth: 50,
        preferred_analogy_domains: ['Gaming', 'Cooking'],
        main_learning_goal: 'Personal Interest'
      };
    }
    
    // Store this in the global memory cache
    global.userProfiles[userId] = forcedProfile;
    
    console.log('Updated memory profile for:', userId);
    console.log('Current memory profile contains preferences:', {
      interests: global.userProfiles[userId].interests,
      preferred_analogy_domains: global.userProfiles[userId].preferred_analogy_domains
    });
    
    res.json({
      success: true,
      profile: forcedProfile,
      source: data ? 'database' : 'memory-only',
      note: 'Profile has been loaded into memory cache'
    });
  } catch (error) {
    console.error('Force profile error:', error);
    res.status(500).json({
      success: false, 
      error: error.message
    });
  }
});

// Add route to use a global memory cache for profiles
app.get('/api/memory-profiles', (req, res) => {
  const profiles = global.userProfiles || {};
  res.json({
    count: Object.keys(profiles).length,
    profiles: Object.keys(profiles).map(key => ({
      id: profiles[key].id,
      username: profiles[key].username,
      preferred_analogy_domains: profiles[key].preferred_analogy_domains
    }))
  });
});

// Add route to view and update a memory profile
app.post('/api/update-memory-profile', async (req, res) => {
  try {
    const { userId, interests, preferred_analogy_domains, occupation, age, education_level, learning_style, technical_depth, main_learning_goal } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Get existing profile or create new one
    global.userProfiles = global.userProfiles || {};
    const existingProfile = global.userProfiles[userId] || {
      id: userId,
      username: 'user_' + userId.substring(0, 8),
      occupation: 'Student',
      age: 25,
      education_level: 'Undergraduate',
      interests: ['Video Games', 'Art'],
      learning_style: 'Visual',
      technical_depth: 50,
      preferred_analogy_domains: ['Gaming', 'Cooking'],
      main_learning_goal: 'Personal Interest'
    };
    
    // Update with new values if provided
    const updatedProfile = {
      ...existingProfile,
      occupation: occupation || existingProfile.occupation,
      age: age || existingProfile.age,
      education_level: education_level || existingProfile.education_level,
      interests: interests || existingProfile.interests,
      learning_style: learning_style || existingProfile.learning_style,
      technical_depth: technical_depth || existingProfile.technical_depth,
      preferred_analogy_domains: preferred_analogy_domains || existingProfile.preferred_analogy_domains,
      main_learning_goal: main_learning_goal || existingProfile.main_learning_goal
    };
    
    // Store updated profile in memory
    global.userProfiles[userId] = updatedProfile;
    
    console.log('Updated memory profile for user:', userId);
    console.log('New preferences:', {
      interests: updatedProfile.interests,
      preferred_analogy_domains: updatedProfile.preferred_analogy_domains
    });
    
    res.json({
      success: true,
      profile: updatedProfile
    });
  } catch (error) {
    console.error('Error updating memory profile:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// Add a route to view the current memory profile
app.get('/api/view-memory-profile', (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    global.userProfiles = global.userProfiles || {};
    const profile = global.userProfiles[userId];
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'No memory profile found for this user ID'
      });
    }
    
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error fetching memory profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a profile editor UI
app.get('/profile-editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'profileEditor.html'));
});

// Add an emergency profile override UI
app.get('/profile-override', (req, res) => {
  res.sendFile(path.join(__dirname, 'profileOverride.html'));
});

// Add Crowd Wisdom admin UI
app.get('/crowd-wisdom-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'crowdWisdomAdmin.html'));
});

// Add a webhook to listen for profile updates from Supabase
app.post('/api/hooks/profile-updated', async (req, res) => {
  try {
    const { record, table } = req.body;
    
    if (table === 'user_profiles' && record && record.id) {
      console.log('Profile update webhook triggered for user:', record.id);
      
      // Update memory cache with the new profile data
      global.userProfiles = global.userProfiles || {};
      
      // Helper function to ensure array format
      const ensureArray = (value) => {
        if (Array.isArray(value)) {
          return value;
        }
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch (e) {
            return [value]; // If we can't parse it, wrap the string in an array
          }
        }
        if (value === null || value === undefined) {
          return [];
        }
        return [value]; // For any other type, wrap in array
      };
      
      // Ensure arrays are properly formatted
      const formattedProfile = {
        ...record,
        interests: ensureArray(record.interests),
        preferred_analogy_domains: ensureArray(record.preferred_analogy_domains)
      };
      
      global.userProfiles[record.id] = formattedProfile;
      
      console.log('Memory cache updated from webhook for user:', record.id);
      console.log('New preferences:', {
        interests: formattedProfile.interests,
        preferred_analogy_domains: formattedProfile.preferred_analogy_domains
      });
      
      // Double-check arrays format and structure before responding
      console.log('Current memory cache arrays for verification:');
      if (global.userProfiles[record.id]) {
        const currentInterests = global.userProfiles[record.id].interests || [];
        const currentDomains = global.userProfiles[record.id].preferred_analogy_domains || [];
        
        console.log('Interests:', Array.isArray(currentInterests) ? 
          currentInterests : 'NOT AN ARRAY: ' + typeof currentInterests);
          
        console.log('Analogy domains:', Array.isArray(currentDomains) ? 
          currentDomains : 'NOT AN ARRAY: ' + typeof currentDomains);
      }
      
      res.json({ success: true, message: 'Profile updated in memory cache' });
    } else {
      res.json({ success: false, message: 'Not a profile update or missing ID' });
    }
  } catch (error) {
    console.error('Error in profile update webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook', details: error.message });
  }
});

// Add a route to clear memory cache for a specific user
app.delete('/api/clear-profile-cache', (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    global.userProfiles = global.userProfiles || {};
    
    if (global.userProfiles[userId]) {
      delete global.userProfiles[userId];
      console.log(`Memory cache cleared for user: ${userId}`);
      
      res.json({
        success: true,
        message: `Memory cache cleared for user: ${userId}`
      });
    } else {
      res.json({
        success: false,
        message: `No cache found for user: ${userId}`
      });
    }
  } catch (error) {
    console.error('Error clearing memory cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add an emergency fix route to override a user profile with specific values
app.post('/api/emergency-profile-override', async (req, res) => {
  try {
    const { userId, preferredDomains, interests, otherFields } = req.body;
    
    if (!userId || !preferredDomains || !interests) {
      return res.status(400).json({ error: 'userId, preferredDomains, and interests are required' });
    }
    
    console.log('EMERGENCY OVERRIDE for user:', userId);
    console.log('Setting domains to:', preferredDomains);
    console.log('Setting interests to:', interests);
    
    // Force the in-memory profile to use exact values
    global.userProfiles = global.userProfiles || {};
    
    // Start with any existing profile or create new
    const existingProfile = global.userProfiles[userId] || {
      id: userId,
      username: 'user_' + userId.substring(0, 8),
      occupation: otherFields?.occupation || 'Student',
      age: otherFields?.age || 25,
      education_level: otherFields?.education_level || 'Undergraduate',
      learning_style: otherFields?.learning_style || 'Visual',
      technical_depth: otherFields?.technical_depth || 50,
      main_learning_goal: otherFields?.main_learning_goal || 'Personal Interest'
    };
    
    // Override with the specified arrays (ensure they're arrays)
    const domainArray = Array.isArray(preferredDomains) ? 
      preferredDomains : [preferredDomains];
      
    const interestsArray = Array.isArray(interests) ? 
      interests : [interests];
    
    // Create the override profile
    const overrideProfile = {
      ...existingProfile,
      ...otherFields, // Add any other fields
      preferred_analogy_domains: domainArray,
      interests: interestsArray
    };
    
    // FORCE save to memory
    global.userProfiles[userId] = overrideProfile;
    
    // Try to update database too
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert([{
          id: userId,
          username: overrideProfile.username,
          occupation: overrideProfile.occupation,
          age: overrideProfile.age,
          education_level: overrideProfile.education_level,
          interests: interestsArray,
          learning_style: overrideProfile.learning_style,
          technical_depth: overrideProfile.technical_depth,
          preferred_analogy_domains: domainArray,
          main_learning_goal: overrideProfile.main_learning_goal,
          updated_at: new Date().toISOString()
        }])
        .select();
      
      if (error) {
        console.error('Database update failed during emergency override:', error);
      } else {
        console.log('Database updated with emergency override');
      }
    } catch (dbError) {
      console.error('Database exception in emergency override:', dbError);
    }
    
    console.log('EMERGENCY OVERRIDE COMPLETE - memory cache updated');
    res.json({
      success: true,
      message: 'Profile forcefully overridden',
      profile: global.userProfiles[userId]
    });
  } catch (error) {
    console.error('Error in emergency profile override:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add an admin route to run the SQL migration script
app.post('/api/admin/run-array-migration', async (req, res) => {
  try {
    const { adminKey } = req.body;
    // Simple security check - in production, use proper authentication
    if (adminKey !== 'fix-arrays-migration') {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized - incorrect admin key' 
      });
    }

    // Read the SQL migration script
    const migrationScript = await fs.readFile(
      path.join(__dirname, 'db', 'fix_arrays_migration.sql'), 
      'utf8'
    );
    
    // Execute the script directly on the database
    const { error } = await supabase.rpc('exec_sql', { sql: migrationScript });
    
    if (error) {
      console.error('Error running array migration:', error);
      return res.status(500).json({
        success: false,
        message: 'Migration failed',
        error: error.message
      });
    }
    
    console.log('Array migration completed successfully');
    res.json({
      success: true,
      message: 'Array migration completed successfully'
    });
  } catch (error) {
    console.error('Error in array migration route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a route to run the Crowd Wisdom migration
app.post('/api/admin/run-crowd-wisdom-migration', async (req, res) => {
  try {
    const { adminKey } = req.body;
    // Simple security check - in production, use proper authentication
    if (adminKey !== 'setup-crowd-wisdom') {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized - incorrect admin key' 
      });
    }

    // Read the SQL migration script
    const migrationScript = await fs.readFile(
      path.join(__dirname, 'db', 'crowd_wisdom_migration.sql'), 
      'utf8'
    );
    
    console.log('Running Crowd Wisdom migration script...');
    
    // Execute the script directly on the database
    const { error } = await supabase.rpc('exec_sql', { sql: migrationScript });
    
    if (error) {
      console.error('Error running Crowd Wisdom migration:', error);
      return res.status(500).json({
        success: false,
        message: 'Migration failed',
        error: error.message
      });
    }
    
    console.log('Crowd Wisdom migration completed successfully');
    res.json({
      success: true,
      message: 'Crowd Wisdom migration completed successfully'
    });
  } catch (error) {
    console.error('Error in Crowd Wisdom migration route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Quiz submission endpoint
app.post('/api/submit-quiz', async (req, res) => {
  try {
    const { quizId, answers, userId } = req.body;
    
    if (!quizId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Quiz ID and answers array are required' });
    }
    
    // Get the quiz data
    const { data: quizData, error: quizError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .single();
      
    if (quizError) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Calculate score
    let correctAnswers = 0;
    const results = quizData.questions.map((question, index) => {
      const userAnswer = answers[index];
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
    
    const score = (correctAnswers / quizData.questions.length) * 100;
    
    // Store results if user is logged in
    if (userId) {
      const { error: resultError } = await supabase
        .from('quiz_results')
        .insert([{
          user_id: userId,
          quiz_id: quizId,
          score,
          answers: answers,
          results: results
        }]);
        
      if (resultError) {
        console.error('Error storing quiz results:', resultError);
      }
    }
    
    res.json({
      quizId,
      score,
      correctAnswers,
      totalQuestions: quizData.questions.length,
      results
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to process quiz submission' });
  }
});

// Crowd Wisdom API routes
app.get('/api/admin/crowd-wisdom/templates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, templates: data });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/crowd-wisdom/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/crowd-wisdom/templates', async (req, res) => {
  try {
    const { topic, source, efficacy_score, template_text, metadata } = req.body;
    
    const { data, error } = await supabase
      .from('prompt_templates')
      .insert([{
        topic,
        source,
        efficacy_score,
        template_text,
        metadata
      }])
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, template: data[0] });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/crowd-wisdom/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { topic, source, efficacy_score, template_text } = req.body;
    
    const { data, error } = await supabase
      .from('prompt_templates')
      .update({
        topic,
        source,
        efficacy_score,
        template_text
      })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    res.json({ success: true, template: data[0] });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/crowd-wisdom/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('prompt_templates')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/crowd-wisdom/usage', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prompt_template_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    res.json({ success: true, usage: data });
  } catch (error) {
    console.error('Error fetching usage logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/crowd-wisdom/stats', async (req, res) => {
  try {
    // Get template statistics
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('id, topic, source, efficacy_score, usage_count');
    
    if (templatesError) throw templatesError;
    
    // Get usage statistics
    const { data: usage, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('id, template_id, feedback_score');
    
    if (usageError) throw usageError;
    
    // Calculate statistics
    const totalTemplates = templates.length;
    const totalUsage = usage.length;
    
    // Calculate average efficacy
    const totalEfficacy = templates.reduce((sum, template) => sum + (template.efficacy_score || 0), 0);
    const avgEfficacy = totalTemplates > 0 ? totalEfficacy / totalTemplates : 0;
    
    // Count templates by source
    const templatesBySource = templates.reduce((counts, template) => {
      counts[template.source] = (counts[template.source] || 0) + 1;
      return counts;
    }, {});
    
    // Count templates by topic
    const templatesByTopic = templates.reduce((counts, template) => {
      counts[template.topic] = (counts[template.topic] || 0) + 1;
      return counts;
    }, {});
    
    // Calculate average feedback score
    const feedbackScores = usage.filter(u => u.feedback_score !== null).map(u => u.feedback_score);
    const avgFeedbackScore = feedbackScores.length > 0 ? 
      feedbackScores.reduce((sum, score) => sum + score, 0) / feedbackScores.length : 0;
    
    // Find most used template
    const templateUsageCounts = usage.reduce((counts, u) => {
      counts[u.template_id] = (counts[u.template_id] || 0) + 1;
      return counts;
    }, {});
    
    let mostUsedTemplateId = null;
    let mostUsageCount = 0;
    
    Object.entries(templateUsageCounts).forEach(([id, count]) => {
      if (count > mostUsageCount) {
        mostUsedTemplateId = id;
        mostUsageCount = count;
      }
    });
    
    const mostUsedTemplate = mostUsedTemplateId ? 
      templates.find(t => t.id === mostUsedTemplateId)?.topic || 'Unknown' : 'None';
    
    // Find highest efficacy template
    let highestEfficacyTemplate = 'None';
    let highestEfficacyScore = 0;
    
    templates.forEach(template => {
      if (template.efficacy_score > highestEfficacyScore) {
        highestEfficacyScore = template.efficacy_score;
        highestEfficacyTemplate = template.topic;
      }
    });
    
    res.json({
      success: true,
      totalTemplates,
      avgEfficacy,
      templatesBySource,
      templatesByTopic,
      totalUsage,
      avgFeedbackScore,
      mostUsedTemplate,
      highestEfficacyTemplate
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/crowd-wisdom/metrics', async (req, res) => {
  try {
    // Get template statistics
    const { data: templates, error: templatesError } = await supabase
      .from('prompt_templates')
      .select('id, topic, efficacy_score');
    
    if (templatesError) throw templatesError;
    
    // Get usage statistics
    const { count: usageCount, error: usageError } = await supabase
      .from('prompt_template_usage')
      .select('id', { count: 'exact' });
    
    if (usageError) throw usageError;
    
    // Calculate metrics
    const totalTemplates = templates.length;
    const totalEfficacy = templates.reduce((sum, template) => sum + (template.efficacy_score || 0), 0);
    const avgEfficacy = totalTemplates > 0 ? totalEfficacy / totalTemplates : 0;
    
    // Count unique topics
    const uniqueTopics = new Set(templates.map(t => t.topic));
    const topicsCount = uniqueTopics.size;
    
    res.json({
      success: true,
      totalTemplates,
      avgEfficacy,
      totalUsage: usageCount,
      topicsCount
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Topic Management API Endpoints
app.get('/api/topics', async (req, res) => {
  try {
    const { data: topics, error } = await supabase
      .from('topics')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });
    
    if (error) throw error;
    
    res.json({ success: true, topics });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// User feedback endpoint - returns empty feedback for visualization
app.get('/api/user-feedback/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // For now, return empty feedback to avoid errors in visualization
    // This can be enhanced later to fetch actual feedback data
    res.json({
      success: true,
      feedback: [],
      message: 'No feedback data available for this user'
    });
  } catch (error) {
    console.error('Error fetching user feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/topics/stats', async (req, res) => {
  try {
    // Get topic statistics
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('name, usage_count, created_at')
      .eq('is_active', true);
    
    if (topicsError) throw topicsError;
    
    // Get session counts by topic
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('secret_topic')
      .not('secret_topic', 'is', null);
    
    if (sessionsError) throw sessionsError;
    
    // Count sessions by topic
    const sessionsByTopic = sessions.reduce((counts, session) => {
      counts[session.secret_topic] = (counts[session.secret_topic] || 0) + 1;
      return counts;
    }, {});
    
    // Combine topic data with session counts
    const topicStats = topics.map(topic => ({
      ...topic,
      session_count: sessionsByTopic[topic.name] || 0
    }));
    
    const totalTopics = topics.length;
    const totalSessions = sessions.length;
    const mostUsedTopic = topicStats.reduce((max, topic) => 
      topic.session_count > (max?.session_count || 0) ? topic : max, null);
    
    res.json({
      success: true,
      totalTopics,
      totalSessions,
      mostUsedTopic: mostUsedTopic?.name || 'None',
      topicStats
    });
  } catch (error) {
    console.error('Error fetching topic statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sessions/:sessionId/topic', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const { data: session, error } = await supabase
      .from('sessions')
      .select('secret_topic')
      .eq('id', sessionId)
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, topic: session.secret_topic });
  } catch (error) {
    console.error('Error fetching session topic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/topics', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Topic name is required' });
    }
    
    const { data: topic, error } = await supabase
      .from('topics')
      .insert({
        name: name.toLowerCase().replace(/\s+/g, '_'),
        description
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, topic });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

setupQuizRoutes(app, supabase, openai);
setupClusterRoutes(app, supabase);

// Add a route to fix existing structured templates
app.post('/api/admin/fix-structured-templates', async (req, res) => {
  try {
    const { adminKey } = req.body;
    // Simple security check - in production, use proper authentication
    if (adminKey !== 'fix-structured-templates') {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized - incorrect admin key' 
      });
    }

    console.log('Fixing existing structured templates...');
    
    // Update templates to use conversational format
    const { data: updateResult, error: updateError } = await supabase
      .from('prompt_templates')
      .select('id, template_text')
      .like('template_text', '%"is_structured":true%');
    
    if (updateError) {
      console.error('Error finding structured templates:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to find structured templates',
        error: updateError.message
      });
    }
    
    let updatedCount = 0;
    
    if (updateResult && updateResult.length > 0) {
      for (const template of updateResult) {
        try {
          const updatedText = template.template_text
            .replace('"is_structured":true', '"is_structured":false')
            .replace('"is_structured": true', '"is_structured": false');
          
          const { error: individualUpdateError } = await supabase
            .from('prompt_templates')
            .update({ template_text: updatedText })
            .eq('id', template.id);
          
          if (individualUpdateError) {
            console.error(`Error updating template ${template.id}:`, individualUpdateError);
          } else {
            updatedCount++;
          }
        } catch (templateError) {
          console.error(`Error processing template ${template.id}:`, templateError);
        }
      }
    }
    
    console.log(`Fixed ${updatedCount} structured templates`);
    res.json({
      success: true,
      message: `Successfully fixed ${updatedCount} structured templates to use conversational format`,
      updatedCount
    });
  } catch (error) {
    console.error('Error in fix structured templates route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Cluster routes successfully initialized');
});
