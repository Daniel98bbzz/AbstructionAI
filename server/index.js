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
    // First, check if the response looks like JSON (starts with '{' after trimming)
    const trimmedResponse = responseText.trim();
    const looksLikeJson = trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}');
    
    // If it looks like JSON, try to parse it as structured content
    if (looksLikeJson) {
      try {
        const parsedJson = JSON.parse(trimmedResponse);
        
        // Basic validation
        if (!parsedJson || typeof parsedJson !== 'object') {
          throw new Error('Parsed response is not a valid object');
        }
        
        // Extract information from the JSON structure
        const introduction = parsedJson.introduction || '';
        const explanation = parsedJson.concept_explanation || '';
        const analogy = parsedJson.analogy?.text || '';
        const analogyTitle = parsedJson.analogy?.title || '';
        const example = parsedJson.example?.text || '';
        const exampleTitle = parsedJson.example?.title || '';
        const keyTakeaways = Array.isArray(parsedJson.key_takeaways) ? parsedJson.key_takeaways : [];
        const resources = Array.isArray(parsedJson.resources) ? parsedJson.resources : [];
        
        // Format key takeaways as a string if they exist
        const recap = keyTakeaways.length > 0 ? 
          keyTakeaways.join('\n- ') : '';
        
        // Return the structured response
        return {
          suggested_title: '',
          is_structured: true,
          introduction: introduction,
          explanation: explanation,
          analogy: analogy,
          analogy_title: analogyTitle,
          example: example,
          example_title: exampleTitle,
          additional_sources: resources,
          recap: recap,
          key_takeaways: keyTakeaways
        };
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        // Fall through to the conversational text handling
      }
    }
    
    // Handle as conversational text if it's not valid JSON or doesn't look like JSON
    console.log('Handling as conversational response');
    
    // Check if the response contains paragraphs
    const paragraphs = trimmedResponse.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length > 1) {
      // If we have multiple paragraphs, use the first as introduction and the rest as explanation
      return {
        suggested_title: '',
        is_structured: false,
        introduction: paragraphs[0],
        explanation: paragraphs.slice(1).join('\n\n'),
        analogy: '',
        analogy_title: '',
        example: '',
        example_title: '',
        additional_sources: [],
        recap: '',
        key_takeaways: []
      };
    } else {
      // For a simple response, just use the entire text as explanation
      return {
        suggested_title: '',
        is_structured: false,
        introduction: '',
        explanation: trimmedResponse,
        analogy: '',
        analogy_title: '',
        example: '',
        example_title: '',
        additional_sources: [],
        recap: '',
        key_takeaways: []
      };
    }
  } catch (error) {
    console.error('Error in overall response parsing:', error);
    console.log('Raw response:', responseText);
    
    // Final fallback
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
// const promptManager = new PromptManager();  // Comment out this line
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

    // Add debug logging for session tracking
    if (sessionId) {
      console.log(`[SESSION DEBUG] Processing query for session: ${sessionId}`);
      
      // Check if session exists in database
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('sessions')
            .select('id, status, created_at')
            .eq('id', sessionId)
            .single();
          
          if (error) {
            console.error(`[SESSION DEBUG] Error checking session: ${error.message}`);
          } else if (data) {
            console.log(`[SESSION DEBUG] Found session in database: ${data.id}, created: ${data.created_at}, status: ${data.status}`);
            
            // Check for existing interactions
            const { data: interactions, error: interactionsError } = await supabase
              .from('interactions')
              .select('id, query, type')
              .eq('session_id', sessionId)
              .order('created_at', { ascending: false })
              .limit(5);
            
            if (interactionsError) {
              console.error(`[SESSION DEBUG] Error checking interactions: ${interactionsError.message}`);
            } else if (interactions && interactions.length > 0) {
              console.log(`[SESSION DEBUG] Found ${interactions.length} previous interactions:`);
              interactions.forEach((i, idx) => {
                console.log(`[SESSION DEBUG] Interaction ${idx+1}: ${i.type} - ${i.query?.substring(0, 30)}...`);
              });
            } else {
              console.log(`[SESSION DEBUG] No previous interactions found for session: ${sessionId}`);
            }
          } else {
            console.log(`[SESSION DEBUG] Session not found in database: ${sessionId}. Will create new.`);
          }
        } catch (e) {
          console.error(`[SESSION DEBUG] Exception checking session: ${e.message}`);
        }
      }
    } else {
      console.log('[SESSION DEBUG] No session ID provided with query request');
    }
    
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
    
    // Add conversation context about the current conversation with user profile data
    console.log('=== PREFERENCES DEBUG START ===');
    console.log('Raw request preferences:', preferences);
    console.log('Raw user profile:', userProfile);
    
    // Ensure we're using project preferences when available
    const effectivePreferences = preferences ? 
      {
        // Merge project preferences with user profile, using user profile as fallback
        interests: preferences.interests?.length ? preferences.interests : userProfile?.interests || [],
        preferred_analogy_domains: preferences.preferred_analogy_domains?.length ? 
          preferences.preferred_analogy_domains : userProfile?.preferred_analogy_domains || [],
        learning_style: preferences.learning_style || userProfile?.learning_style || 'Visual',
        technical_depth: preferences.technical_depth || userProfile?.technical_depth || 50,
        education_level: preferences.education_level || userProfile?.education_level || 'Not specified',
        main_learning_goal: preferences.main_learning_goal || userProfile?.main_learning_goal || 'Not specified'
      } : userProfile;
    
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
    
    // NEW: Apply Crowd Wisdom enhancement if user context is limited
    let enhancedQuery = query;
    let usedTemplate = null;
    let crowdWisdomTopic = null;
    let selectionMethod = 'none';
    
    // Check if user has limited context (less than 2 interactions)
    const hasLimitedContext = !sessionData.interactions || sessionData.interactions.length < 2;
    
    if (hasLimitedContext && !isRegeneration) {
      try {
        console.log('[Crowd Wisdom] User has limited context, applying crowd wisdom enhancement');
        
        // Determine which algorithm to use based on A/B test group or random assignment
        let useCompositeScore = true; // Default to new method
        
        if (abTestGroup) {
          // Use explicitly provided test group
          useCompositeScore = abTestGroup === 'composite' || abTestGroup === 'new';
          console.log(`[Crowd Wisdom] Using explicitly provided A/B test group: ${abTestGroup}`);
        } else {
          // Randomly assign for A/B testing if not specified 
          // 70% new method, 30% old method during transition period
          useCompositeScore = Math.random() < 0.7;
          console.log(`[Crowd Wisdom] Randomly assigned to ${useCompositeScore ? 'composite' : 'efficacy'} score group`);
        }
        
        // Slightly higher exploration rate for composite score to gather more data
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
          console.log(`[Crowd Wisdom] Enhanced query with template ID: ${usedTemplate.id} using ${selectionMethod}`);
        }
      } catch (crowdWisdomError) {
        console.error('[Crowd Wisdom] Error enhancing query:', crowdWisdomError);
        // Fallback to original query if enhancement fails
        enhancedQuery = query;
      }
    }
    
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

${usedTemplate ? `
IMPORTANT: Based on topic analysis (${crowdWisdomTopic}) and successful past interactions, consider structuring your response according to the following guidance:
- This guidance is based on patterns from highly-rated responses on similar topics.
- You should still use your own knowledge and expertise to craft the best response.
` : ''}

IMPORTANT: Respond in a structured, intuitive format to make complex concepts easier to understand.

For INITIAL COMPLEX EXPLANATIONS about topics, use a structured JSON format with these keys:
- "introduction": (String) A brief, engaging opening that introduces the topic in 1-2 sentences.
- "concept_explanation": (String) The core explanation of the topic. Break this into smaller paragraphs for readability.
- "analogy": (Object | null) An object with "title" (String) and "text" (String) for the analogy, or null if no analogy is suitable.
- "example": (Object | null) An object with "title" (String) and "text" (String), or null.
- "key_takeaways": (Array<String> | null) A list of 3-5 key points to remember, or null.
- "resources": (Array<Object> | null) List of resource objects {title, url, description}, or null.

Example JSON structure for complex explanations:
{
  "introduction": "Let's dive into the 'divide and conquer' strategy!",
  "concept_explanation": "It's a powerful algorithmic technique where complex problems are broken down into simpler, manageable parts.\\n\\nEach part is solved independently, and then these solutions are combined to solve the original problem.",
  "analogy": {
    "title": "Soccer Team Training",
    "text": "Think of it like coaching a large soccer team. Instead of trying to train all 22 players at once (which would be chaotic), you divide them into groups based on their roles: strikers, midfielders, defenders, and goalkeepers. Each group focuses on their specific skills separately (the 'conquer' step). Finally, you bring everyone together for a practice match, combining all their improved skills."
  },
  "example": {
    "title": "Merge Sort Algorithm",
    "text": "A classic example is the Merge Sort algorithm. It works by: 1) Dividing the array in half repeatedly until you have single elements, 2) Sorting and merging these smaller arrays back together, 3) Continuing until the entire array is sorted."
  },
  "key_takeaways": [
    "Break complex problems into smaller, manageable parts",
    "Solve each smaller part independently",
    "Combine the solutions to solve the original problem",
    "This approach often leads to more efficient solutions"
  ],
  "resources": [
    {
      "title": "Divide and Conquer Algorithms",
      "url": "https://example.com/algorithms",
      "description": "A comprehensive guide to common divide and conquer algorithms"
    }
  ]
}

For FOLLOW-UP QUESTIONS, CLARIFICATIONS, or SIMPLE QUERIES, respond in a natural, conversational style without the structured JSON format. Your response should be direct and helpful, just like you're having a normal conversation with the user. For example:

User: "I didn't understand that part about binary search."
Your response: "Let me clarify the binary search concept. It works by repeatedly dividing the search area in half. Imagine looking for a word in a dictionary - you open to the middle, see if your word would come before or after that page, then only look in that half, repeating until you find the word. This is much faster than checking every page from the beginning."

User: "Can you explain it more simply?"
Your response: "Sure! Binary search is like a guessing game where you guess a number between 1-100, and after each guess, you're told if the answer is higher or lower. You always guess in the middle of the possible range, cutting the possibilities in half each time. This makes it very efficient."

Ensure your entire output is properly formatted. For complex topics, break down your explanation into smaller chunks with proper paragraph breaks. Use simple language where possible and gradually introduce technical terms as needed.

CRITICAL - AVOID REPETITION: 
1. Do NOT repeat the same concept across different sections
2. Each section should add new information or perspective
3. Check your response for redundancy before submitting

${isRegeneration && feedback?.analogyTopic ? 
  `When using analogies, make sure to incorporate the user's requested domain: ${feedback.analogyTopic}` : 
  effectivePreferences?.preferred_analogy_domains?.length ? 
    `Always use analogies from these domains unless instructed otherwise: ${effectivePreferences?.preferred_analogy_domains?.join(', ')}` : 
    effectivePreferences?.interests?.length ? 
      `Always use analogies related to the user's interests unless instructed otherwise: ${effectivePreferences?.interests?.join(', ')}` :
      ``}`
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

    // Add current query - use enhanced query if Crowd Wisdom was applied
    historyMessages.push({ role: "user", content: enhancedQuery });

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

setupQuizRoutes(app, supabase, openai);
setupClusterRoutes(app, supabase);

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Cluster routes successfully initialized');
});
