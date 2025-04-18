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

/**
 * Parse sections from the OpenAI response
 * @param {string} responseText - Raw response text from OpenAI
 * @returns {Object} - Parsed sections
 */
function parseResponse(responseText) {
  const sections = {
    suggested_title: '',
    introduction: '',
    explanation: '',
    analogy: '',
    additional_sources: [],
    recap: '',
    quiz: null
  };

  // Extract suggested title
  const titleMatch = responseText.match(/SUGGESTED_TITLE:([^\n]*)/);
  if (titleMatch && titleMatch[1]) {
    sections.suggested_title = titleMatch[1].trim();
  }

  // Extract introduction
  const introMatch = responseText.match(/Introduction:([\s\S]*?)(?=Explanation:|$)/);
  if (introMatch && introMatch[1]) {
    sections.introduction = introMatch[1].trim();
  }

  // Extract explanation
  const explanationMatch = responseText.match(/Explanation:([\s\S]*?)(?=Analogy:|$)/);
  if (explanationMatch && explanationMatch[1]) {
    sections.explanation = explanationMatch[1].trim();
  }

  // Extract analogy
  const analogyMatch = responseText.match(/Analogy:([\s\S]*?)(?=Additional Sources:|$)/);
  if (analogyMatch && analogyMatch[1]) {
    sections.analogy = analogyMatch[1].trim();
  }

  // Extract additional sources
  const sourcesMatch = responseText.match(/Additional Sources:([\s\S]*?)(?=Brief Recap:|$)/);
  if (sourcesMatch && sourcesMatch[1]) {
    const sourcesText = sourcesMatch[1].trim();
    // Parse sources into an array of objects
    const sources = sourcesText
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        // Try to extract URL from markdown link format [title](url)
        const urlMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (urlMatch) {
          return {
            title: urlMatch[1],
            url: urlMatch[2],
            description: line.replace(urlMatch[0], '').trim()
          };
        }
        // If no URL format found, just return the text
        return {
          title: line.trim(),
          url: '',
          description: ''
        };
      });
    sections.additional_sources = sources;
  }

  // Extract recap
  const recapMatch = responseText.match(/Brief Recap:([\s\S]*?)(?=Quiz:|$)/);
  if (recapMatch && recapMatch[1]) {
    sections.recap = recapMatch[1].trim();
  }

  return sections;
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

// Initialize managers
const userManager = new UserManager();
// const promptManager = new PromptManager();  // Comment out this line
const sessionManager = new SessionManager();
const feedbackProcessor = new FeedbackProcessor();
const supervisor = new Supervisor();

// Routes
app.post('/api/query', async (req, res) => {
  try {
    const { query, sessionId, preferences, feedback, isRegeneration, originalResponseId } = req.body;
    
    console.log('Received query request:', { 
      query, 
      sessionId: sessionId || 'none', 
      preferencesProvided: !!preferences,
      isRegeneration: !!isRegeneration,
      hasFeedback: !!feedback
    });
    
    // Identify the user
    const userId = req.user?.id || req.body.userId;  // Try to get the user ID from the request body as fallback
    let userProfile = null;
    
    // IMPORTANT DEBUG LOG
    console.log('Attempting to fetch user profile for ID:', userId);
    
    // Check memory cache first (fastest)
    if (userId && global.userProfiles && global.userProfiles[userId]) {
      userProfile = global.userProfiles[userId];
      console.log('✅ Using user profile from memory cache');
      
      // Ensure arrays are properly formatted
      userProfile.interests = ensureArray(userProfile.interests);
      userProfile.preferred_analogy_domains = ensureArray(userProfile.preferred_analogy_domains);
      
      console.log('User profile from memory cache has arrays:', {
        interests: userProfile.interests,
        preferred_analogy_domains: userProfile.preferred_analogy_domains
      });
      
      // Reload in background to keep memory cache fresh
      setTimeout(async () => {
        try {
          console.log('Background refresh of profile for user:', userId);
          const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
          if (!error && data) {
            // Process the data to ensure arrays are properly formatted
            const freshProfile = {
              ...data,
              interests: Array.isArray(data.interests) ? 
                data.interests : 
                (typeof data.interests === 'string' ? 
                  JSON.parse(data.interests) : 
                  ['Video Games', 'Art']),
              preferred_analogy_domains: Array.isArray(data.preferred_analogy_domains) ? 
                data.preferred_analogy_domains : 
                (typeof data.preferred_analogy_domains === 'string' ? 
                  JSON.parse(data.preferred_analogy_domains) : 
                  ['Gaming', 'Cooking'])
            };
            
            // Update the memory cache
            global.userProfiles[userId] = freshProfile;
            console.log('Background refresh completed - updated memory cache with fresh data');
            console.log('Updated preferences:', {
              interests: freshProfile.interests,
              preferred_analogy_domains: freshProfile.preferred_analogy_domains
            });
          }
        } catch (refreshError) {
          console.error('Error in background profile refresh:', refreshError);
        }
      }, 0);
    }
    // Fetch user profile if authenticated and not in memory cache
    else if (userId) {
      try {
        // First try with UserProfileManager
        try {
          userProfile = await UserProfileManager.getProfile(userId);
          console.log('User profile loaded from manager:', !!userProfile);
          
          // Store in memory cache for future requests
          if (userProfile) {
            global.userProfiles = global.userProfiles || {};
            global.userProfiles[userId] = userProfile;
            console.log('Stored profile in memory cache');
          }
        } catch (managerError) {
          console.error('Error using UserProfileManager:', managerError);
        }
        
        // Fallback to direct query if UserProfileManager fails
        if (!userProfile) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (!error && data) {
          userProfile = data;
            console.log('Using user profile from direct query');
          } else if (error) {
            console.error('Error in direct query for user profile:', error);
            
            // If the error is that no rows were found, create a default profile
            if (error.code === 'PGRST116') {
              console.log('No profile found - attempting to create default profile');
              
              try {
                // Create a default profile with dummy data for testing
                const { data: newProfile, error: createError } = await supabase
                  .from('user_profiles')
                  .insert([{
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
                  }])
                  .select();
                  
                if (createError) {
                  console.error('Failed to create default profile:', createError);
                } else {
                  console.log('Created default profile successfully');
                  userProfile = newProfile[0];
                }
              } catch (createProfileError) {
                console.error('Error creating default profile:', createProfileError);
              }
            }
          }
        }
        
        if (userProfile) {
          console.log('User profile loaded successfully. Preferences:', {
            interests: userProfile.interests || [],
            preferred_analogy_domains: userProfile.preferred_analogy_domains || []
          });
          
          // Fix JSON string issue - parse strings to arrays if needed
          if (userProfile.interests && typeof userProfile.interests === 'string') {
            try {
              userProfile.interests = JSON.parse(userProfile.interests);
            } catch (e) {
              console.error('Error parsing interests JSON:', e);
              userProfile.interests = ['Video Games', 'Art']; // Default fallback
            }
          }
          
          if (userProfile.preferred_analogy_domains && typeof userProfile.preferred_analogy_domains === 'string') {
            try {
              userProfile.preferred_analogy_domains = JSON.parse(userProfile.preferred_analogy_domains);
            } catch (e) {
              console.error('Error parsing preferred_analogy_domains JSON:', e);
              userProfile.preferred_analogy_domains = ['Gaming', 'Cooking']; // Default fallback
            }
          }
          
          // Ensure these are always arrays
          if (!Array.isArray(userProfile.interests)) {
            userProfile.interests = ['Video Games', 'Art']; // Default fallback
          }
          
          if (!Array.isArray(userProfile.preferred_analogy_domains)) {
            userProfile.preferred_analogy_domains = ['Gaming', 'Cooking']; // Default fallback
          }
        } else {
          console.error('No user profile found for ID:', userId);
        }
      } catch (profileError) {
        console.error('Error fetching user profile:', profileError);
      }
    } else {
      console.log('No user ID available, skipping profile lookup');
    }
    
    if (isRegeneration) {
      console.log('Processing regeneration request with feedback:', {
        originalResponseId: originalResponseId || 'unknown',
        feedbackRating: feedback?.rating,
        specificInstructions: feedback?.specificInstructions || [],
        analogyTopic: feedback?.analogyTopic || 'not specified',
        forceAnalogy: feedback?.forceAnalogy || false
      });
      
      // Log more detailed feedback info to help with debugging
      if (feedback?.analogyTopic) {
        console.log(`User explicitly requested a ${feedback.analogyTopic}-themed analogy. This will be enforced in the response.`);
      }
      
      if (feedback?.specificInstructions && feedback.specificInstructions.length > 0) {
        console.log('Specific instructions from feedback:', feedback.specificInstructions);
      }
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get or create session
    let sessionData;
    if (sessionId) {
      console.log(`Looking for existing session ${sessionId}`);
      sessionData = await sessionManager.getSession(sessionId);
      if (!sessionData) {
        console.log(`Session ${sessionId} not found, will create new`);
        // Instead of failing, create a new session if the requested one doesn't exist
        const tempUserId = userId || `anon_${Date.now()}`;
        sessionData = await sessionManager.createSession(tempUserId, preferences);
        console.log(`Created new session ${sessionData.id} for user ${tempUserId}`);
      }
    } else {
      // Create anonymous session if no user is authenticated
      const tempUserId = userId || `anon_${Date.now()}`;
      console.log(`No session provided, creating new session for user ${tempUserId}`);
      sessionData = await sessionManager.createSession(tempUserId, preferences);
      console.log(`Created new session ${sessionData.id}`);
    }
    
    // Get conversation summary and history for context
    const conversationSummary = sessionManager.getConversationSummary(sessionData.id);
    
    // Prepare conversation history messages with better context handling
    const historyMessages = [];
    
    // Add system context about the current conversation with user profile data
    console.log('=== PREFERENCES DEBUG START ===');
    console.log('Raw request preferences:', preferences);
    console.log('Raw user profile:', userProfile);
    
    // Ensure we're using project preferences when available
    const effectivePreferences = preferences || userProfile;
    
    // Detailed debug logging for preferences
    console.log('=== PREFERENCES ANALYSIS ===');
    console.log('Preference Source:', preferences ? 'PROJECT' : 'GLOBAL PROFILE');
    console.log('Effective Preferences:', {
      interests: effectivePreferences?.interests || [],
      preferred_analogy_domains: effectivePreferences?.preferred_analogy_domains || [],
      learning_style: effectivePreferences?.learning_style || 'Not specified',
      technical_depth: effectivePreferences?.technical_depth || 'Not specified',
      education_level: effectivePreferences?.education_level || 'Not specified',
      main_learning_goal: effectivePreferences?.main_learning_goal || 'Not specified'
    });
    
    // Log the actual values being used in the prompt
    console.log('=== PROMPT VALUES ===');
    console.log('Interests being used:', effectivePreferences?.interests?.join(', ') || 'None');
    console.log('Analogy domains being used:', effectivePreferences?.preferred_analogy_domains?.join(', ') || 'None');
    console.log('Learning style being used:', effectivePreferences?.learning_style || 'Not specified');
    console.log('Technical depth being used:', effectivePreferences?.technical_depth || 'Not specified');
    console.log('=== PREFERENCES DEBUG END ===');
    
    const systemContext = {
      role: "system",
      content: `You are a knowledgeable AI tutor specialized in explaining complex concepts clearly and thoroughly.

${conversationSummary.lastExplanation 
  ? `Previous topic: ${conversationSummary.currentTopic}
Last explanation: ${conversationSummary.lastExplanation}`
  : "This is the start of the conversation."}
${conversationSummary.lastAnalogy
  ? `\nLast analogy: ${conversationSummary.lastAnalogy}`
  : ""}

${effectivePreferences ? `
User Profile (${preferences ? 'Project-Specific' : 'Global'} Preferences):
- Education Level: ${effectivePreferences.education_level || 'Not specified'}
- Learning Style: ${effectivePreferences.learning_style || 'Not specified'}
- Technical Background: ${effectivePreferences.technical_background || effectivePreferences.technical_depth || 'Not specified'}
- Main Learning Goal: ${effectivePreferences.learning_goal || effectivePreferences.main_learning_goal || 'Not specified'}
- Preferred Analogy Domains: ${effectivePreferences.preferred_analogy_domains?.join(', ') || 'None specified'}
- Interests: ${effectivePreferences.interests?.join(', ') || 'None specified'}
` : ''}

${isRegeneration && feedback ? `
IMPORTANT: This is a request to improve a previous answer based on user feedback.

User Feedback:
- Overall Rating: ${feedback.rating || 'Not specified'}/5
- Was explanation clear? ${feedback.explanationClear || 'Not specified'}
- Was explanation detail level appropriate? ${feedback.explanationDetail || 'Not specified'}
- Was analogy helpful? ${feedback.analogyHelpful || 'Not specified'}
${feedback.analogyPreference ? `- Preferred analogy domain: ${feedback.analogyTopic || feedback.analogyPreference}` : ''}
${feedback.comments ? `- Additional comments: ${feedback.comments}` : ''}

Specific Instructions:
${feedback.specificInstructions?.map(instruction => `- ${instruction}`).join('\n') || 'None provided'}
` : ''}

Your responses must ALWAYS follow this format:

CONVERSATION_TITLE:
[A concise title for this conversation, exactly 3-5 words only]

SUGGESTED_TITLE:
[A brief, descriptive title for this conversation, maximum 5-7 words]

Introduction:
[A concise overview of the topic, 2-3 sentences]

Explanation:
[A detailed and comprehensive explanation of the concept, at least 3-4 paragraphs with examples]

Analogy:
${isRegeneration && feedback?.analogyTopic ? `[Provide a metaphor or real-world scenario related to ${feedback.analogyTopic}]` : `[Provide a metaphor or real-world scenario that helps explain the concept, using one of these domains: ${effectivePreferences?.preferred_analogy_domains?.join(', ') || 'general'}]`}

Additional Sources:
[Provide 3-5 relevant learning resources with URLs when possible]

Brief Recap:
[Summarize the key points in 3-5 bullet points]`
    };
    
    historyMessages.push(systemContext);

    // Add recent conversation history (last 5 interactions)
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

    // Add current query
    historyMessages.push({ role: "user", content: query });

    // Call OpenAI API with enhanced context
    const completion = await openai.chat.completions.create({
      model: "gpt-4",  // Use GPT-4 for more comprehensive responses
      messages: historyMessages,
      temperature: 0.7,
      max_tokens: 4000,  // Increased token limit for longer responses
      presence_penalty: 0.1,  // Slight penalty to avoid repetition
      frequency_penalty: 0.1  // Slight penalty to encourage diversity
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
      introduction: sections.introduction,
      explanation: sections.explanation,
      analogy: sections.analogy,
      resources: sections.additional_sources,
      recap: sections.recap,
      quiz: sections.quiz,
      timestamp: new Date().toISOString()
    };
    
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
      quiz: response.quiz, // Add the quiz to the message
      timestamp: new Date().toISOString(),
      messageId: responseId
    };

    // Add interaction to session
    await sessionManager.addInteraction(sessionData.id, {
      type: 'query',
      query,
      response,
      aiMessage // Include the aiMessage in the interaction
    });
    
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
    const { responseId, rating, comments, sessionId } = req.body;
    
    if (!responseId || !rating || !sessionId) {
      return res.status(400).json({ error: 'Response ID, rating, and session ID are required' });
    }
    
    // Process feedback
    const feedback = await feedbackProcessor.processFeedback(
      responseId,
      rating,
      comments,
      req.user.id
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

setupQuizRoutes(app, supabase, openai);

// Debug route to verify the quiz routes are registered
app.get('/api/debug/routes', (req, res) => {
  // List all registered routes for debugging
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      // Routes registered directly
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).join(', ')
      });
    } else if (middleware.name === 'router') {
      // Routes registered via router
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods).join(', ')
          });
        }
      });
    }
  });
  
  res.json({
    totalRoutes: routes.length,
    routes
  });
});

// Emergency fix endpoint to correctly check user profile in database
app.get('/api/debug/actual-profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log('Retrieving ACTUAL profile from database for user:', userId);
    
    // Direct database query bypassing UserProfileManager
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) {
      console.error('Error retrieving actual profile:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
    
    // Debug raw values
    console.log('RAW DATABASE VALUES:');
    console.log('interests:', data.interests);
    console.log('preferred_analogy_domains:', data.preferred_analogy_domains);
    console.log('typeof interests:', typeof data.interests);
    console.log('typeof preferred_analogy_domains:', typeof data.preferred_analogy_domains);
    
    // Parse if needed
    let interests = data.interests;
    let analogyDomains = data.preferred_analogy_domains;
    
    if (typeof interests === 'string') {
      try {
        interests = JSON.parse(interests);
        console.log('Parsed interests from string:', interests);
      } catch (e) {
        console.error('Failed to parse interests:', e);
      }
    }
    
    if (typeof analogyDomains === 'string') {
      try {
        analogyDomains = JSON.parse(analogyDomains);
        console.log('Parsed analogy domains from string:', analogyDomains);
      } catch (e) {
        console.error('Failed to parse analogy domains:', e);
      }
    }
    
    // Return both raw and parsed data
    res.json({
      success: true,
      raw: data,
      parsed: {
        ...data,
        interests: interests,
        preferred_analogy_domains: analogyDomains
      }
    });
  } catch (error) {
    console.error('Error in debug profile endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Quiz API should be available at http://localhost:${PORT}/api/generate-quiz`);
  
  // Initialize global memory cache from database
  try {
    console.log('Initializing user profiles cache from database...');
    global.userProfiles = global.userProfiles || {};
    
    // Get all user profiles from database
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*');
      
    if (error) {
      console.error('Error loading profiles on startup:', error);
    } else if (data && data.length) {
      console.log(`Found ${data.length} user profiles to cache`);
      
      // Process each profile
      data.forEach(profile => {
        if (!profile || !profile.id) return;
        
        try {
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
                console.error(`Error parsing array for user ${profile.id}:`, e);
                return [value]; 
              }
            }
            if (value === null || value === undefined) {
              return [];
            }
            return [value];
          };
          
          // Format the profile with proper arrays
          const formattedProfile = {
            ...profile,
            interests: ensureArray(profile.interests),
            preferred_analogy_domains: ensureArray(profile.preferred_analogy_domains)
          };
          
          // Add to cache
          global.userProfiles[profile.id] = formattedProfile;
          
          console.log(`Cached profile for user ${profile.id} with preferences:`, {
            interests: formattedProfile.interests,
            preferred_analogy_domains: formattedProfile.preferred_analogy_domains
          });
        } catch (e) {
          console.error(`Error processing profile for user ${profile.id}:`, e);
        }
      });
      
      console.log(`Successfully cached ${Object.keys(global.userProfiles).length} user profiles`);
    } else {
      console.log('No user profiles found in database');
    }
  } catch (e) {
    console.error('Error initializing profiles cache:', e);
  }
});