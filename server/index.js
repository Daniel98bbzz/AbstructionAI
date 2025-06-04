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

CLASSIFICATION RULES:
1. If the query fits one of the existing topics above, respond with EXACTLY that topic name
2. If no existing topic fits well, create a new descriptive topic name (use underscores, lowercase)
3. NEVER respond with "no_specific_topic" - always find or create a meaningful topic
4. For mathematical queries (formulas, equations, calculations, math concepts), use "mathematics"
5. For programming/coding queries, use "computer_science" or "programming"
6. For science queries, use the specific science field (physics, chemistry, biology)
7. Only use "general" for truly non-academic queries like greetings, thanks, or casual conversation
8. Be specific: prefer "linear_algebra" over "mathematics" if the query is specifically about linear algebra

EXAMPLES:
- "what is root formula in math" → mathematics
- "explain calculus derivatives" → calculus  
- "how do algorithms work" → algorithms
- "thank you" → general
- "hello" → general
- "i don't understand" → general
- "explain photosynthesis" → biology
- "how to code in python" → programming

TOPIC:`;

      const topicCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: topicClassificationPrompt }],
        temperature: 0.1,
        max_tokens: 50
      });
      
      secretTopic = topicCompletion.choices[0].message.content.trim();
      console.log(`[Topic Classification] Classified topic: ${secretTopic}`);
      
      // 🚫 SAFEGUARD: Never allow "no_specific_topic" 
      if (secretTopic === 'no_specific_topic' || secretTopic === 'no_topic' || secretTopic === 'none' || !secretTopic) {
        secretTopic = 'general';
        console.log(`[Topic Classification] Prevented invalid topic, using fallback: ${secretTopic}`);
      }
      
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

    // 🆕 GENERATE EXAMPLES AND ABSTRACT SIMULTANEOUSLY WITH MAIN RESPONSE
    console.log('[Tab Content Generation] Starting simultaneous generation of Examples and Abstract content');
    
    try {
      // Get user preferences for better content generation
      let userPreferences = preferences;
      if (userId && !userPreferences) {
        // Try to get user preferences from memory cache
        global.userProfiles = global.userProfiles || {};
        const userProfile = global.userProfiles[userId];
        if (userProfile) {
          userPreferences = {
            preferred_analogy_domains: userProfile.preferred_analogy_domains || ['everyday life', 'cooking'],
            interests: userProfile.interests || ['general'],
            learning_style: userProfile.learning_style || 'visual',
            technical_depth: userProfile.technical_depth || 50
          };
        }
      }

      // Generate Examples and Abstract content in parallel
      const [examplesResult, abstractResult] = await Promise.allSettled([
        // Generate Examples
        (async () => {
          const examplesPrompt = `Based on the following question and explanation, generate practical examples that help illustrate the concept. Make the examples concrete, diverse, and easy to understand.

Original Question: ${query}

Main Explanation: ${response.explanation.substring(0, 1000)}...

Please provide 3-5 clear, practical examples that demonstrate this concept in action. Each example should:
1. Be concrete and specific
2. Show the concept being applied in real-world scenarios
3. Be relatable and easy to understand
4. Include brief explanations of how the concept applies

${userPreferences?.preferred_analogy_domains?.length ? 
  `User is particularly interested in: ${userPreferences.preferred_analogy_domains.join(', ')}. Try to include examples from these domains when relevant.` : 
  ''}

Format your response as clear, well-structured examples with headings and explanations.`;

          const examplesCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: examplesPrompt }],
            temperature: 0.7,
            max_tokens: 2000,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
          });
          
          return examplesCompletion.choices[0].message.content;
        })(),
        
        // Generate Abstract content
        (async () => {
          // Determine analogy domains based on preferences
          let analogyDomains = ['everyday life', 'nature', 'cooking', 'sports'];
          if (userPreferences?.preferred_analogy_domains?.length) {
            analogyDomains = userPreferences.preferred_analogy_domains;
          } else if (userPreferences?.interests?.length) {
            analogyDomains = userPreferences.interests;
          }
          
          const abstractPrompt = `Based on the following question and explanation, create insightful analogies that help make this concept easier to understand. Focus on clear, relatable comparisons.

Original Question: ${query}

Main Explanation: ${response.explanation.substring(0, 1000)}...

Please provide 2-3 detailed analogies that explain this concept using familiar comparisons. Each analogy should:
1. Use familiar concepts from domains like: ${analogyDomains.join(', ')}
2. Clearly map the key aspects of the original concept to the analogy
3. Explain the similarities and how they help understand the concept
4. Be engaging and memorable

Format your response with clear analogies, each with:
- A descriptive title
- The analogy explanation
- How it relates back to the original concept

Make the analogies vivid and easy to visualize.`;

          const abstractCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: abstractPrompt }],
            temperature: 0.8,
            max_tokens: 2000,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
          });
          
          return abstractCompletion.choices[0].message.content;
        })()
      ]);

      // Process results and save to database
      let examplesContent = null;
      let abstractContent = null;

      if (examplesResult.status === 'fulfilled') {
        examplesContent = examplesResult.value;
        console.log('[Tab Content Generation] Examples generated successfully');
      } else {
        console.error('[Tab Content Generation] Examples generation failed:', examplesResult.reason);
      }

      if (abstractResult.status === 'fulfilled') {
        abstractContent = abstractResult.value;
        console.log('[Tab Content Generation] Abstract generated successfully');
      } else {
        console.error('[Tab Content Generation] Abstract generation failed:', abstractResult.reason);
      }

      // Save Examples and Abstract content to database
      if (examplesContent && userId) {
        try {
          const { error: examplesError } = await supabase
            .from('response_tab_content')
            .insert({
              message_id: responseId,
              user_id: userId,
              session_id: sessionData.id,
              tab_type: 'examples',
              content: examplesContent,
              original_query: query,
              main_content: response.explanation.substring(0, 1000),
              preferences: userPreferences || {}
            });

          if (examplesError) {
            console.error('[Tab Content Generation] Error saving examples to database:', examplesError);
          } else {
            console.log('[Tab Content Generation] Examples saved to database successfully');
          }
        } catch (dbError) {
          console.error('[Tab Content Generation] Database error saving examples:', dbError);
        }
      }

      if (abstractContent && userId) {
        try {
          const { error: abstractError } = await supabase
            .from('response_tab_content')
            .insert({
              message_id: responseId,
              user_id: userId,
              session_id: sessionData.id,
              tab_type: 'abstract',
              content: abstractContent,
              original_query: query,
              main_content: response.explanation.substring(0, 1000),
              preferences: userPreferences || {}
            });

          if (abstractError) {
            console.error('[Tab Content Generation] Error saving abstract to database:', abstractError);
          } else {
            console.log('[Tab Content Generation] Abstract saved to database successfully');
          }
        } catch (dbError) {
          console.error('[Tab Content Generation] Database error saving abstract:', dbError);
        }
      }

      // Add generated content to the response for immediate availability
      response.tab_content = {
        examples: examplesContent,
        abstract: abstractContent,
        generated_simultaneously: true
      };

      console.log('[Tab Content Generation] Simultaneous generation completed');

    } catch (tabGenerationError) {
      console.error('[Tab Content Generation] Error in simultaneous generation:', tabGenerationError);
      // Don't fail the main response, just log the error
      response.tab_content = {
        examples: null,
        abstract: null,
        generated_simultaneously: false,
        error: 'Failed to generate additional content'
      };
    }

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
    const existingProfile = global.userProfiles[userId] || {};
    
    // Update the profile
    global.userProfiles[userId] = {
      ...existingProfile,
      id: userId,
      interests: interests || existingProfile.interests || ['Video Games', 'Art'],
      preferred_analogy_domains: preferred_analogy_domains || existingProfile.preferred_analogy_domains || ['Gaming', 'Cooking'],
      occupation: occupation || existingProfile.occupation || 'Student',
      age: age || existingProfile.age || 25,
      education_level: education_level || existingProfile.education_level || 'Undergraduate',
      learning_style: learning_style || existingProfile.learning_style || 'Visual',
      technical_depth: technical_depth || existingProfile.technical_depth || 50,
      main_learning_goal: main_learning_goal || existingProfile.main_learning_goal || 'Personal Interest'
    };
    
    console.log('Updated memory profile for user:', userId);
    console.log('New preferences:', {
      interests: global.userProfiles[userId].interests,
      preferred_analogy_domains: global.userProfiles[userId].preferred_analogy_domains
    });
    
    res.json({
      success: true,
      profile: global.userProfiles[userId]
    });
  } catch (error) {
    console.error('Update memory profile error:', error);
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

// Add new API endpoint after the existing topics endpoints

app.get('/api/user-sessions/by-topic', async (req, res) => {
  try {
    const { topic, user_id, limit = 10, offset = 0 } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[User Sessions by Topic] Fetching sessions for user ${user_id}, topic: ${topic || 'all'}`);
    
    // Build query to get sessions with their interactions
    let sessionsQuery = supabase
      .from('sessions')
      .select(`
        id,
        created_at,
        status,
        secret_topic,
        interactions!inner (
          id,
          created_at,
          query,
          response,
          type
        )
      `)
      .eq('user_id', user_id)
      .eq('interactions.type', 'query')
      .order('created_at', { ascending: false });
    
    // Filter by topic if specified
    if (topic && topic !== 'all') {
      sessionsQuery = sessionsQuery.eq('secret_topic', topic);
    }
    
    // Apply pagination
    sessionsQuery = sessionsQuery.range(offset, offset + limit - 1);
    
    const { data: sessions, error } = await sessionsQuery;
    
    if (error) throw error;
    
    // Transform data to match expected format
    const transformedSessions = sessions.map(session => ({
      id: session.interactions.id,
      created_at: session.interactions.created_at,
      query: session.interactions.query,
      response: session.interactions.response,
      type: session.interactions.type,
      secret_topic: session.secret_topic,
      session: {
        id: session.id,
        created_at: session.created_at,
        status: session.status,
        secret_topic: session.secret_topic
      }
    }));
    
    console.log(`[User Sessions by Topic] Returning ${transformedSessions.length} sessions`);
    
    res.json({ 
      success: true, 
      sessions: transformedSessions,
      filter: { topic: topic || 'all', user_id, limit, offset },
      total: transformedSessions.length
    });
  } catch (error) {
    console.error('Error fetching user sessions by topic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's topics summary
app.get('/api/user-topics/summary', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[User Topics Summary] Fetching topic summary for user ${user_id}`);
    
    // Get all user sessions with topics
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('secret_topic, created_at')
      .eq('user_id', user_id)
      .not('secret_topic', 'is', null)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Count sessions by topic
    const topicCounts = {};
    const topicDates = {};
    
    sessions.forEach(session => {
      const topic = session.secret_topic;
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      
      // Track the most recent date for each topic
      if (!topicDates[topic] || new Date(session.created_at) > new Date(topicDates[topic])) {
        topicDates[topic] = session.created_at;
      }
    });
    
    // Get topic details from topics table
    const topicNames = Object.keys(topicCounts);
    let topicDetails = [];
    
    if (topicNames.length > 0) {
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('name, description, usage_count')
        .in('name', topicNames);
      
      if (!topicsError && topics) {
        topicDetails = topics;
      }
    }
    
    // Combine data
    const userTopics = topicNames.map(topicName => {
      const topicDetail = topicDetails.find(t => t.name === topicName);
      return {
        name: topicName,
        user_session_count: topicCounts[topicName],
        last_used: topicDates[topicName],
        description: topicDetail?.description || `Topic: ${topicName.replace(/_/g, ' ')}`,
        global_usage_count: topicDetail?.usage_count || 0
      };
    }).sort((a, b) => b.user_session_count - a.user_session_count);
    
    console.log(`[User Topics Summary] Found ${userTopics.length} topics for user`);
    
    res.json({
      success: true,
      user_topics: userTopics,
      total_sessions: sessions.length,
      unique_topics: userTopics.length
    });
  } catch (error) {
    console.error('Error fetching user topics summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get trending topics in user's cluster
app.get('/api/user-topics/trending', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Trending Topics] Fetching trending topics for user ${user_id}`);
    
    // Get user's cluster
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('cluster_id')
      .eq('id', user_id)
      .single();
    
    if (profileError || !userProfile?.cluster_id) {
      console.log(`[Trending Topics] No cluster found for user ${user_id}`);
      return res.json({ 
        success: true, 
        trending_topics: [],
        cluster_id: null,
        message: 'User not assigned to a cluster yet'
      });
    }
    
    const clusterId = userProfile.cluster_id;
    console.log(`[Trending Topics] User ${user_id} belongs to cluster ${clusterId}`);
    
    // Get all users in the same cluster with their usernames
    const { data: clusterUsers, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('cluster_id', clusterId);
    
    if (usersError) throw usersError;
    
    const clusterUserIds = clusterUsers.map(u => u.id);
    console.log(`[Trending Topics] Found ${clusterUserIds.length} users in cluster`);
    
    // Create a user ID to username mapping
    const userIdToUsername = {};
    clusterUsers.forEach(user => {
      userIdToUsername[user.id] = user.username;
    });
    
    // Get recent sessions from cluster users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: clusterSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('secret_topic, created_at, user_id')
      .in('user_id', clusterUserIds)
      .not('secret_topic', 'is', null)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });
    
    if (sessionsError) throw sessionsError;
    
    // Count topic frequency and calculate trends
    const topicCounts = {};
    const topicUsers = {};
    const topicUserDetails = {}; // Store user details for each topic
    const now = Date.now();
    
    clusterSessions.forEach(session => {
      const topic = session.secret_topic;
      const sessionDate = new Date(session.created_at);
      const daysAgo = (now - sessionDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Weight recent sessions more heavily
      const weight = Math.max(0.1, 1 - (daysAgo / 30));
      
      topicCounts[topic] = (topicCounts[topic] || 0) + weight;
      
      // Track unique users per topic
      if (!topicUsers[topic]) {
        topicUsers[topic] = new Set();
        topicUserDetails[topic] = [];
      }
      
      if (!topicUsers[topic].has(session.user_id)) {
        topicUsers[topic].add(session.user_id);
        
        // Add user details to the topic
        topicUserDetails[topic].push({
          user_id: session.user_id,
          username: userIdToUsername[session.user_id] || `user_${session.user_id.substring(0, 8)}`,
          latest_activity: session.created_at
        });
      }
    });
    
    // Get topic details
    const topicNames = Object.keys(topicCounts);
    let topicDetails = [];
    
    if (topicNames.length > 0) {
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('name, description, usage_count')
        .in('name', topicNames);
      
      if (!topicsError && topics) {
        topicDetails = topics;
      }
    }
    
    // Create trending topics list
    const trendingTopics = topicNames
      .map(topicName => {
        const topicDetail = topicDetails.find(t => t.name === topicName);
        
        // Sort users by their latest activity (most recent first)
        const sortedUsers = topicUserDetails[topicName].sort((a, b) => 
          new Date(b.latest_activity) - new Date(a.latest_activity)
        );
        
        return {
          name: topicName,
          cluster_popularity: topicCounts[topicName],
          unique_users: topicUsers[topicName].size,
          description: topicDetail?.description || `Topic: ${topicName.replace(/_/g, ' ')}`,
          global_usage_count: topicDetail?.usage_count || 0,
          trend_score: topicCounts[topicName] * topicUsers[topicName].size,
          learners: sortedUsers // Include learner details with usernames
        };
      })
      .sort((a, b) => b.trend_score - a.trend_score)
      .slice(0, 10); // Top 10 trending topics
    
    console.log(`[Trending Topics] Found ${trendingTopics.length} trending topics`);
    
    res.json({
      success: true,
      trending_topics: trendingTopics,
      cluster_id: clusterId,
      cluster_size: clusterUserIds.length,
      time_period: '30 days'
    });
  } catch (error) {
    console.error('Error fetching trending topics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get suggested new topics for user
app.get('/api/user-topics/suggestions', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Topic Suggestions] Generating suggestions for user ${user_id}`);
    
    // Get user's current topics
    const { data: userSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('secret_topic')
      .eq('user_id', user_id)
      .not('secret_topic', 'is', null);
    
    if (sessionsError) throw sessionsError;
    
    const userTopics = new Set(userSessions.map(s => s.secret_topic));
    console.log(`[Topic Suggestions] User has explored ${userTopics.size} topics`);
    
    // Get user's cluster for similar user recommendations
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('cluster_id, interests, preferred_analogy_domains')
      .eq('id', user_id)
      .single();
    
    let clusterBasedSuggestions = [];
    
    if (!profileError && userProfile?.cluster_id) {
      // Get topics popular in user's cluster that they haven't explored
      const { data: clusterUsers, error: usersError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('cluster_id', userProfile.cluster_id)
        .neq('id', user_id); // Exclude current user
      
      if (!usersError && clusterUsers.length > 0) {
        const clusterUserIds = clusterUsers.map(u => u.id);
        
        const { data: clusterSessions, error: clusterSessionsError } = await supabase
          .from('sessions')
          .select('secret_topic')
          .in('user_id', clusterUserIds)
          .not('secret_topic', 'is', null);
        
        if (!clusterSessionsError) {
          const clusterTopicCounts = {};
          clusterSessions.forEach(session => {
            const topic = session.secret_topic;
            if (!userTopics.has(topic)) { // Only topics user hasn't explored
              clusterTopicCounts[topic] = (clusterTopicCounts[topic] || 0) + 1;
            }
          });
          
          clusterBasedSuggestions = Object.entries(clusterTopicCounts)
            .map(([topic, count]) => ({ topic, popularity: count, source: 'cluster' }))
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 5);
        }
      }
    }
    
    // Get globally popular topics that user hasn't explored
    const { data: allTopics, error: topicsError } = await supabase
      .from('topics')
      .select('name, usage_count, description')
      .gt('usage_count', 0)
      .order('usage_count', { ascending: false })
      .limit(20);
    
    if (topicsError) throw topicsError;
    
    const globalSuggestions = allTopics
      .filter(topic => !userTopics.has(topic.name))
      .slice(0, 5)
      .map(topic => ({
        topic: topic.name,
        popularity: topic.usage_count,
        source: 'global',
        description: topic.description
      }));
    
    // Get interest-based suggestions (if user has profile)
    let interestBasedSuggestions = [];
    if (userProfile?.interests) {
      const interests = Array.isArray(userProfile.interests) ? 
        userProfile.interests : 
        (typeof userProfile.interests === 'string' ? 
          JSON.parse(userProfile.interests) : []);
      
      // Map interests to potential topics
      const interestTopicMap = {
        'Technology': ['machine_learning', 'artificial_intelligence', 'computer_science', 'programming'],
        'Science': ['physics', 'chemistry', 'biology', 'astronomy'],
        'Mathematics': ['calculus', 'linear_algebra', 'statistics', 'geometry'],
        'Art': ['art_history', 'design_principles', 'color_theory', 'composition'],
        'Music': ['music_theory', 'composition', 'acoustics', 'harmony'],
        'Sports': ['biomechanics', 'sports_psychology', 'nutrition', 'physiology'],
        'Gaming': ['game_theory', 'computer_graphics', 'algorithms', 'psychology'],
        'Cooking': ['chemistry', 'nutrition', 'thermodynamics', 'food_science']
      };
      
      const suggestedTopics = [];
      interests.forEach(interest => {
        if (interestTopicMap[interest]) {
          interestTopicMap[interest].forEach(topic => {
            if (!userTopics.has(topic) && !suggestedTopics.includes(topic)) {
              suggestedTopics.push(topic);
            }
          });
        }
      });
      
      interestBasedSuggestions = suggestedTopics.slice(0, 3).map(topic => ({
        topic,
        source: 'interests',
        description: `Based on your interest in ${interests.join(', ')}`
      }));
    }
    
    // Combine all suggestions
    const allSuggestions = [
      ...clusterBasedSuggestions.map(s => ({
        name: s.topic,
        source: s.source,
        reason: `Popular among users with similar learning style (${s.popularity} sessions)`,
        type: 'cluster_trending'
      })),
      ...globalSuggestions.map(s => ({
        name: s.topic,
        source: s.source,
        reason: `Globally popular topic (${s.popularity} total sessions)`,
        description: s.description,
        type: 'global_popular'
      })),
      ...interestBasedSuggestions.map(s => ({
        name: s.topic,
        source: s.source,
        reason: s.description,
        type: 'interest_based'
      }))
    ];
    
    // Remove duplicates and limit results
    const uniqueSuggestions = allSuggestions
      .filter((suggestion, index, self) => 
        index === self.findIndex(s => s.name === suggestion.name)
      )
      .slice(0, 8);
    
    console.log(`[Topic Suggestions] Generated ${uniqueSuggestions.length} suggestions`);
    
    res.json({
      success: true,
      suggestions: uniqueSuggestions,
      user_topics_count: userTopics.size,
      cluster_id: userProfile?.cluster_id || null
    });
  } catch (error) {
    console.error('Error generating topic suggestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get topic feed (combines trending and suggestions)
app.get('/api/user-topics/feed', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Topic Feed] Generating personalized feed for user ${user_id}`);
    
    // Get trending topics and suggestions in parallel
    const [trendingResponse, suggestionsResponse] = await Promise.all([
      // Call internal trending endpoint
      new Promise((resolve) => {
        const mockReq = { query: { user_id } };
        const mockRes = {
          json: (data) => resolve(data),
          status: () => mockRes
        };
        // We'll call the trending endpoint logic directly here
        resolve({ success: true, trending_topics: [] }); // Placeholder for now
      }),
      // Call internal suggestions endpoint  
      new Promise((resolve) => {
        const mockReq = { query: { user_id } };
        const mockRes = {
          json: (data) => resolve(data),
          status: () => mockRes
        };
        // We'll call the suggestions endpoint logic directly here
        resolve({ success: true, suggestions: [] }); // Placeholder for now
      })
    ]);
    
    // For now, let's make direct calls to get the data we need
    // Get user's recent activity
    const { data: recentSessions, error: recentError } = await supabase
      .from('sessions')
      .select('secret_topic, created_at')
      .eq('user_id', user_id)
      .not('secret_topic', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentError) throw recentError;
    
    // Get user's cluster info
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('cluster_id, interests')
      .eq('id', user_id)
      .single();
    
    const feed = {
      recent_activity: recentSessions || [],
      trending_topics: [], // Will be populated by actual trending call
      suggestions: [], // Will be populated by actual suggestions call
      cluster_id: userProfile?.cluster_id || null,
      interests: userProfile?.interests || [],
      generated_at: new Date().toISOString()
    };
    
    console.log(`[Topic Feed] Generated feed with ${feed.recent_activity.length} recent activities`);
    
    res.json({
      success: true,
      feed,
      user_id
    });
  } catch (error) {
    console.error('Error generating topic feed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('✅ Cluster routes successfully initialized');
});

// ==================== TOPIC PROGRESS TRACKING (PHASE 3) ====================

// Get user's progress across all topics
app.get('/api/user-topics/progress', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Topic Progress] Fetching progress for user ${user_id}`);
    
    // Get all user sessions with topics
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('secret_topic, created_at, id')
      .eq('user_id', user_id)
      .not('secret_topic', 'is', null)
      .order('created_at', { ascending: false });
    
    if (sessionsError) {
      console.error('[Topic Progress] Error fetching sessions:', sessionsError);
      return res.status(500).json({ error: 'Failed to fetch user sessions' });
    }
    
    // Get quiz scores for the user - FIXED: use quiz_results instead of quiz_sessions
    const { data: quizzes, error: quizzesError } = await supabase
      .from('quiz_results')
      .select('score, created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    if (quizzesError) {
      console.error('[Topic Progress] Error fetching quiz data:', quizzesError);
      // Don't return error, just continue without quiz data
    }
    
    // 🆕 Get user feedback data for progress enhancement
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('feedback')
      .select('rating, query_text, response_text, comments, created_at, session_id')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    if (feedbackError) {
      console.error('[Topic Progress] Error fetching feedback data:', feedbackError);
      // Don't return error, just continue without feedback data
    }
    
    // 🆕 Get component feedback data (temporarily disabled due to relationship issues)
    const componentFeedback = [];
    const componentError = null;
    
    // TODO: Fix component feedback relationship and re-enable
    // const { data: componentFeedback, error: componentError } = await supabase
    //   .from('template_component_feedback')
    //   .select(`
    //     analogy_rating,
    //     explanation_rating,
    //     clarity_rating,
    //     relevance_rating,
    //     template_usage_id,
    //     template_usage!inner(session_id)
    //   `)
    //   .eq('template_usage.user_id', user_id);
    
    if (componentError) {
      console.error('[Topic Progress] Error fetching component feedback:', componentError);
    }
    
    // Calculate progress for each topic
    const topicProgress = {};
    const now = Date.now();
    
    // Process sessions
    sessions.forEach(session => {
      const topic = session.secret_topic;
      const sessionDate = new Date(session.created_at);
      const daysAgo = (now - sessionDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (!topicProgress[topic]) {
        topicProgress[topic] = {
          topic_name: topic,
          session_count: 0,
          quiz_scores: [],
          feedback_scores: [], // 🆕 Added feedback tracking
          component_ratings: [], // 🆕 Added component feedback tracking
          recent_activity: null,
          first_learned: session.created_at,
          mastery_level: 0,
          learning_hours: 0,
          difficulty_progression: 'beginner',
          feedback_quality: 0 // 🆕 Added feedback quality metric
        };
      }
      
      topicProgress[topic].session_count++;
      topicProgress[topic].first_learned = session.created_at; // Will be earliest due to desc order
      
      if (!topicProgress[topic].recent_activity || sessionDate > new Date(topicProgress[topic].recent_activity)) {
        topicProgress[topic].recent_activity = session.created_at;
      }
    });
    
    // Process quiz scores
    if (quizzes && quizzes.length > 0) {
      quizzes.forEach(quiz => {
        // Since quiz_results doesn't have topic info, we'll associate with recent sessions
        // For now, we'll calculate an overall quiz performance metric
        const recentSessions = sessions.slice(0, 5); // Get 5 most recent sessions
        
        recentSessions.forEach(session => {
          const topic = session.secret_topic;
          if (topicProgress[topic]) {
            topicProgress[topic].quiz_scores.push({
              score: quiz.score, // This is already a percentage (0-100)
              date: quiz.created_at
            });
          }
        });
      });
    }
    
    // 🆕 Process feedback data with Secret Feedback Mechanism
    if (feedbackData && feedbackData.length > 0) {
      feedbackData.forEach(feedback => {
        // Find which session this feedback belongs to (handle text vs UUID conversion)
        const relatedSession = sessions.find(s => s.id.toString() === feedback.session_id || s.id === feedback.session_id);
        if (relatedSession && relatedSession.secret_topic) {
          const topic = relatedSession.secret_topic;
          if (topicProgress[topic]) {
            // 🎯 SECRET FEEDBACK MECHANISM: Analyze feedback content quality
            const feedbackAnalysis = analyzeSecretFeedbackQuality(feedback);
            
            topicProgress[topic].feedback_scores.push({
              rating: feedback.rating,
              quality_score: feedbackAnalysis.qualityScore,
              satisfaction_level: feedbackAnalysis.satisfactionLevel,
              content_richness: feedbackAnalysis.contentRichness,
              preference_alignment: feedbackAnalysis.preferenceAlignment,
              date: feedback.created_at
            });
          }
        }
      });
    }
    
    // 🆕 Process component feedback data with content analysis
    if (componentFeedback && componentFeedback.length > 0) {
      componentFeedback.forEach(component => {
        // Find which session this component feedback belongs to
        const sessionId = component.template_usage?.session_id;
        const relatedSession = sessions.find(s => s.id === sessionId);
        if (relatedSession && relatedSession.secret_topic) {
          const topic = relatedSession.secret_topic;
          if (topicProgress[topic]) {
            // Analyze component effectiveness
            const componentAnalysis = analyzeComponentEffectiveness(component);
            
            topicProgress[topic].component_ratings.push({
              effectiveness_score: componentAnalysis.effectivenessScore,
              components: {
                analogy: component.analogy_rating,
                explanation: component.explanation_rating,
                clarity: component.clarity_rating,
                relevance: component.relevance_rating
              },
              analysis: componentAnalysis
            });
          }
        }
      });
    }
    
    // 🆕 Enhanced mastery level calculation with feedback integration
    Object.keys(topicProgress).forEach(topic => {
      const progress = topicProgress[topic];
      
      // Calculate average quiz score
      const avgQuizScore = progress.quiz_scores.length > 0 
        ? progress.quiz_scores.reduce((sum, quiz) => sum + quiz.score, 0) / progress.quiz_scores.length
        : 0;
      
      // 🆕 Calculate SECRET FEEDBACK QUALITY SCORE based on content analysis
      let feedbackQualityScore = 0;
      
      if (progress.feedback_scores.length > 0) {
        // Calculate weighted feedback quality using Secret Feedback Mechanism
        const totalQualityScore = progress.feedback_scores.reduce((sum, f) => {
          // Weight components of feedback quality
          const contentScore = f.content_richness || 0; // How detailed/informative is feedback
          const satisfactionScore = f.satisfaction_level || 0; // User satisfaction derived from content
          const alignmentScore = f.preference_alignment || 0; // How well response matched preferences
          const baseQualityScore = f.quality_score || 0; // Overall analyzed quality
          
          // Combine scores with weights
          return sum + (contentScore * 0.3 + satisfactionScore * 0.3 + alignmentScore * 0.2 + baseQualityScore * 0.2);
        }, 0);
        
        feedbackQualityScore = totalQualityScore / progress.feedback_scores.length;
      }
      
      // Add component feedback analysis if available
      if (progress.component_ratings.length > 0) {
        const componentEffectivenessAvg = progress.component_ratings.reduce((sum, c) => {
          return sum + (c.effectiveness_score || 0);
        }, 0) / progress.component_ratings.length;
        
        // Combine general feedback with component feedback (weighted average)
        if (feedbackQualityScore > 0) {
          feedbackQualityScore = (feedbackQualityScore * 0.7) + (componentEffectivenessAvg * 0.3);
        } else {
          feedbackQualityScore = componentEffectivenessAvg;
        }
      }
      
      progress.feedback_quality = Math.round(feedbackQualityScore);
      
      // Estimate learning hours (rough calculation: 1 session = 0.5 hours)
      progress.learning_hours = progress.session_count * 0.5;
      
      // 🆕 Enhanced mastery level calculation (0-100)
      // NEW WEIGHTS: Session Count (30%), Quiz Performance (30%), Feedback Quality (25%), Learning Hours (15%)
      const sessionScore = Math.min(progress.session_count * 3.75, 30); // Max 30 points for sessions (8 sessions = max)
      const quizScore = avgQuizScore * 0.3; // Quiz performance weighted 30%
      const feedbackScore = feedbackQualityScore * 0.25; // Feedback quality weighted 25%
      const hoursScore = Math.min(progress.learning_hours * 1.5, 15); // Max 15 points for hours (10 hours = max)
      
      progress.mastery_level = Math.round(sessionScore + quizScore + feedbackScore + hoursScore);
      
      // Determine difficulty progression
      if (progress.mastery_level >= 80) {
        progress.difficulty_progression = 'expert';
      } else if (progress.mastery_level >= 60) {
        progress.difficulty_progression = 'advanced';
      } else if (progress.mastery_level >= 30) {
        progress.difficulty_progression = 'intermediate';
      } else {
        progress.difficulty_progression = 'beginner';
      }
      
      // Calculate average quiz score for display
      progress.avg_quiz_score = Math.round(avgQuizScore);
      
      // 🆕 Add SECRET FEEDBACK MECHANISM metrics for display
      progress.avg_feedback_quality_score = progress.feedback_scores.length > 0
        ? Math.round(progress.feedback_scores.reduce((sum, f) => sum + (f.quality_score || 0), 0) / progress.feedback_scores.length)
        : 0;
      
      progress.avg_satisfaction_level = progress.feedback_scores.length > 0
        ? Math.round(progress.feedback_scores.reduce((sum, f) => sum + (f.satisfaction_level || 0), 0) / progress.feedback_scores.length)
        : 0;
      
      progress.avg_content_richness = progress.feedback_scores.length > 0
        ? Math.round(progress.feedback_scores.reduce((sum, f) => sum + (f.content_richness || 0), 0) / progress.feedback_scores.length)
        : 0;
      
      progress.avg_preference_alignment = progress.feedback_scores.length > 0
        ? Math.round(progress.feedback_scores.reduce((sum, f) => sum + (f.preference_alignment || 0), 0) / progress.feedback_scores.length)
        : 0;
      
      progress.feedback_count = progress.feedback_scores.length + progress.component_ratings.length;
    });
    
    console.log(`[Topic Progress] Generated progress for ${Object.keys(topicProgress).length} topics with feedback integration`);
    
    res.json({
      success: true,
      progress: Object.values(topicProgress).sort((a, b) => b.mastery_level - a.mastery_level),
      summary: {
        total_topics: Object.keys(topicProgress).length,
        total_sessions: sessions.length,
        total_quizzes: quizzes ? quizzes.length : 0,
        total_feedback: feedbackData ? feedbackData.length : 0,
        total_component_feedback: componentFeedback ? componentFeedback.length : 0,
        avg_mastery: Object.values(topicProgress).reduce((sum, p) => sum + p.mastery_level, 0) / Object.keys(topicProgress).length || 0,
        avg_feedback_quality: Object.values(topicProgress).reduce((sum, p) => sum + p.feedback_quality, 0) / Object.keys(topicProgress).length || 0
      },
      feedback_integration: {
        enabled: true,
        weights: {
          sessions: '30%',
          quizzes: '30%',
          feedback: '25%',
          hours: '15%'
        }
      }
    });
    
  } catch (error) {
    console.error('[Topic Progress] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get learning path recommendations
app.get('/api/learning-paths/recommendations', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Learning Paths] Generating recommendations for user ${user_id}`);
    
    // Get user's current progress
    const progressResponse = await fetch(`http://localhost:3001/api/user-topics/progress?user_id=${user_id}`);
    const progressData = await progressResponse.json();
    
    if (!progressData.success) {
      return res.status(500).json({ error: 'Failed to fetch user progress' });
    }
    
    const userProgress = progressData.progress;
    const exploredTopics = userProgress.map(p => p.topic_name);
    
    // Define topic prerequisites and learning paths
    const topicPrerequisites = {
      'advanced_machine_learning': ['machine_learning', 'statistics', 'linear_algebra'],
      'deep_learning': ['machine_learning', 'neural_networks', 'linear_algebra'],
      'natural_language_processing': ['machine_learning', 'linguistics', 'python'],
      'computer_vision': ['machine_learning', 'image_processing', 'linear_algebra'],
      'data_science': ['statistics', 'python', 'data_analysis'],
      'advanced_statistics': ['statistics', 'probability', 'mathematics'],
      'quantum_computing': ['linear_algebra', 'physics', 'computer_science'],
      'blockchain': ['cryptography', 'computer_science', 'distributed_systems'],
      'cloud_computing': ['computer_networks', 'distributed_systems', 'virtualization'],
      'cybersecurity': ['computer_networks', 'cryptography', 'operating_systems']
    };
    
    const recommendations = [];
    
    // 1. Next Level Recommendations - based on mastery level
    userProgress.forEach(progress => {
      if (progress.mastery_level >= 70) {
        // Find advanced topics that have this as prerequisite
        Object.keys(topicPrerequisites).forEach(advancedTopic => {
          if (topicPrerequisites[advancedTopic].includes(progress.topic_name) && 
              !exploredTopics.includes(advancedTopic)) {
            
            // Check if all prerequisites are met
            const hasAllPrereqs = topicPrerequisites[advancedTopic].every(prereq => {
              const prereqProgress = userProgress.find(p => p.topic_name === prereq);
              return prereqProgress && prereqProgress.mastery_level >= 60;
            });
            
            if (hasAllPrereqs) {
              recommendations.push({
                topic: advancedTopic,
                type: 'advancement',
                reason: `Ready for advanced level - you've mastered ${progress.topic_name}`,
                difficulty: 'advanced',
                prerequisites_met: true,
                confidence: 0.9
              });
            }
          }
        });
      }
    });
    
    // 2. Foundation Strengthening - identify weak areas
    userProgress.forEach(progress => {
      if (progress.mastery_level < 50 && progress.session_count >= 3) {
        recommendations.push({
          topic: progress.topic_name,
          type: 'strengthen',
          reason: `Strengthen foundation - ${progress.mastery_level}% mastery`,
          difficulty: progress.difficulty_progression,
          prerequisites_met: true,
          confidence: 0.8
        });
      }
    });
    
    // 3. Complementary Topics - related fields
    const complementaryTopics = {
      'machine_learning': ['statistics', 'data_visualization', 'python'],
      'statistics': ['probability', 'data_analysis', 'research_methods'],
      'python': ['algorithms', 'data_structures', 'software_engineering'],
      'mathematics': ['linear_algebra', 'calculus', 'discrete_mathematics'],
      'computer_science': ['algorithms', 'data_structures', 'operating_systems']
    };
    
    userProgress.forEach(progress => {
      if (progress.mastery_level >= 60) {
        const complements = complementaryTopics[progress.topic_name] || [];
        complements.forEach(complement => {
          if (!exploredTopics.includes(complement)) {
            recommendations.push({
              topic: complement,
              type: 'complement',
              reason: `Complements your knowledge in ${progress.topic_name}`,
              difficulty: 'intermediate',
              prerequisites_met: true,
              confidence: 0.7
            });
          }
        });
      }
    });
    
    // 4. Trending in Cluster - get popular topics user hasn't tried
    try {
      const trendingResponse = await fetch(`http://localhost:3001/api/user-topics/trending?user_id=${user_id}`);
      const trendingData = await trendingResponse.json();
      
      if (trendingData.success && trendingData.trending_topics) {
        trendingData.trending_topics.forEach(trending => {
          if (!exploredTopics.includes(trending.name)) {
            recommendations.push({
              topic: trending.name,
              type: 'trending',
              reason: `Trending in your learning cluster (${trending.unique_users} learners)`,
              difficulty: 'unknown',
              prerequisites_met: true,
              confidence: 0.6
            });
          }
        });
      }
    } catch (error) {
      console.log('[Learning Paths] Could not fetch trending topics');
    }
    
    // Remove duplicates and sort by confidence
    const uniqueRecommendations = recommendations
      .filter((rec, index, self) => 
        index === self.findIndex(r => r.topic === rec.topic)
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8); // Top 8 recommendations
    
    console.log(`[Learning Paths] Generated ${uniqueRecommendations.length} recommendations`);
    
    res.json({
      success: true,
      recommendations: uniqueRecommendations,
      user_summary: {
        topics_explored: exploredTopics.length,
        avg_mastery: progressData.summary.avg_mastery,
        ready_for_advanced: userProgress.filter(p => p.mastery_level >= 70).length
      }
    });
    
  } catch (error) {
    console.error('[Learning Paths] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get achievements for a user
app.get('/api/user-achievements', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`[Achievements] Calculating achievements for user ${user_id}`);
    
    // Get user progress
    const progressResponse = await fetch(`http://localhost:3001/api/user-topics/progress?user_id=${user_id}`);
    const progressData = await progressResponse.json();
    
    if (!progressData.success) {
      return res.status(500).json({ error: 'Failed to fetch user progress' });
    }
    
    const achievements = [];
    const userProgress = progressData.progress;
    
    // Define achievement criteria
    const achievementCriteria = [
      {
        id: 'first_topic',
        name: 'First Steps',
        description: 'Explored your first topic',
        icon: '🌱',
        condition: () => userProgress.length >= 1
      },
      {
        id: 'explorer',
        name: 'Explorer',
        description: 'Explored 5 different topics',
        icon: '🗺️',
        condition: () => userProgress.length >= 5
      },
      {
        id: 'scholar',
        name: 'Scholar',
        description: 'Explored 10 different topics',
        icon: '🎓',
        condition: () => userProgress.length >= 10
      },
      {
        id: 'first_mastery',
        name: 'First Mastery',
        description: 'Achieved 80% mastery in a topic',
        icon: '⭐',
        condition: () => userProgress.some(p => p.mastery_level >= 80)
      },
      {
        id: 'expert',
        name: 'Expert',
        description: 'Achieved expert level in 3 topics',
        icon: '🏆',
        condition: () => userProgress.filter(p => p.mastery_level >= 80).length >= 3
      },
      {
        id: 'dedicated_learner',
        name: 'Dedicated Learner',
        description: 'Completed 20 learning sessions',
        icon: '💪',
        condition: () => progressData.summary.total_sessions >= 20
      },
      {
        id: 'quiz_master',
        name: 'Quiz Master',
        description: 'Scored 90%+ on 5 quizzes',
        icon: '🧠',
        condition: () => {
          let highScoreCount = 0;
          userProgress.forEach(p => {
            highScoreCount += p.quiz_scores.filter(q => q.score >= 90).length;
          });
          return highScoreCount >= 5;
        }
      },
      {
        id: 'consistent_learner',
        name: 'Consistent Learner',
        description: 'Learned something every day for a week',
        icon: '📅',
        condition: () => {
          // Simple approximation based on recent activity
          const recentSessions = userProgress.filter(p => {
            const daysSince = (Date.now() - new Date(p.recent_activity)) / (1000 * 60 * 60 * 24);
            return daysSince <= 7;
          });
          return recentSessions.length >= 5;
        }
      },
      // 🆕 FEEDBACK-BASED ACHIEVEMENTS
      {
        id: 'helpful_critic',
        name: 'Helpful Critic',
        description: 'Provided feedback on 10 responses',
        icon: '🔍',
        condition: () => (progressData.summary.total_feedback + progressData.summary.total_component_feedback) >= 10
      },
      {
        id: 'quality_seeker',
        name: 'Quality Seeker',
        description: 'Maintained 4+ star average feedback rating',
        icon: '⭐',
        condition: () => {
          const totalFeedbackScore = userProgress.reduce((sum, p) => sum + p.feedback_quality, 0);
          const avgFeedbackQuality = totalFeedbackScore / userProgress.length;
          return avgFeedbackQuality >= 75; // 75% = 4+ stars (4/5 * 100 = 80%, but we're generous)
        }
      },
      {
        id: 'feedback_master',
        name: 'Feedback Master',
        description: 'Achieved 90%+ feedback quality in a topic',
        icon: '🎯',
        condition: () => userProgress.some(p => p.feedback_quality >= 90)
      },
      {
        id: 'engagement_champion',
        name: 'Engagement Champion',
        description: 'Provided detailed component feedback 5+ times',
        icon: '🏅',
        condition: () => {
          let componentFeedbackCount = 0;
          userProgress.forEach(p => {
            componentFeedbackCount += p.component_ratings ? p.component_ratings.length : 0;
          });
          return componentFeedbackCount >= 5;
        }
      },
      {
        id: 'perfect_reviewer',
        name: 'Perfect Reviewer',
        description: 'Gave 5-star ratings on 3+ responses',
        icon: '🌟',
        condition: () => {
          let perfectRatings = 0;
          userProgress.forEach(p => {
            perfectRatings += p.feedback_scores ? p.feedback_scores.filter(f => f.rating === 5).length : 0;
            perfectRatings += p.component_ratings ? p.component_ratings.filter(c => c.rating >= 4.5).length : 0;
          });
          return perfectRatings >= 3;
        }
      }
    ];
    
    // Check which achievements are earned
    achievementCriteria.forEach(criteria => {
      if (criteria.condition()) {
        achievements.push({
          id: criteria.id,
          name: criteria.name,
          description: criteria.description,
          icon: criteria.icon,
          earned: true,
          earned_date: new Date().toISOString() // Simplified - would track actual date in real system
        });
      }
    });
    
    console.log(`[Achievements] User has earned ${achievements.length} achievements`);
    
    res.json({
      success: true,
      achievements,
      total_earned: achievements.length,
      total_possible: achievementCriteria.length
    });
    
  } catch (error) {
    console.error('[Achievements] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SECRET FEEDBACK MECHANISM: Helper methods for content-based feedback analysis

/**
 * Analyze feedback quality based on content using Secret Feedback Mechanism
 * @param {Object} feedback - Feedback data with comments and rating
 * @returns {Object} - Quality analysis
 */
function analyzeSecretFeedbackQuality(feedback) {
  const comments = feedback.comments || '';
  const rating = feedback.rating || 3;
  
  // Content richness: How detailed and informative is the feedback?
  const contentRichness = analyzeContentRichness(comments);
  
  // Satisfaction level: Derived from sentiment and rating consistency
  const satisfactionLevel = analyzeSatisfactionLevel(comments, rating);
  
  // Preference alignment: How well did the response match user preferences?
  const preferenceAlignment = analyzePreferenceAlignment(comments);
  
  // Overall quality score combining all factors
  const qualityScore = (contentRichness * 0.4 + satisfactionLevel * 0.4 + preferenceAlignment * 0.2);
  
  return {
    qualityScore: Math.round(qualityScore),
    satisfactionLevel: Math.round(satisfactionLevel),
    contentRichness: Math.round(contentRichness),
    preferenceAlignment: Math.round(preferenceAlignment)
  };
}

/**
 * Analyze component effectiveness based on ratings and context
 * @param {Object} component - Component feedback data
 * @returns {Object} - Effectiveness analysis
 */
function analyzeComponentEffectiveness(component) {
  const ratings = [
    component.analogy_rating,
    component.explanation_rating,
    component.clarity_rating,
    component.relevance_rating
  ].filter(r => r !== null);
  
  if (ratings.length === 0) {
    return { effectivenessScore: 0 };
  }
  
  // Calculate weighted effectiveness score
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  const effectivenessScore = ((avgRating - 1) / 4) * 100; // Convert 1-5 to 0-100
  
  return {
    effectivenessScore: Math.round(effectivenessScore),
    componentCount: ratings.length,
    averageComponentRating: Math.round(avgRating * 10) / 10
  };
}

/**
 * Analyze content richness of feedback
 * @param {string} comments - Feedback comments
 * @returns {number} - Content richness score (0-100)
 */
function analyzeContentRichness(comments) {
  if (!comments) return 0;
  
  const wordCount = comments.split(/\s+/).length;
  const sentenceCount = comments.split(/[.!?]+/).length;
  
  // Check for specific feedback indicators
  const hasSpecifics = /specific|example|instance|particular/.test(comments.toLowerCase());
  const hasSuggestions = /suggest|recommend|should|could|would/.test(comments.toLowerCase());
  const hasDetails = /because|since|due to|reason|explain/.test(comments.toLowerCase());
  
  let richness = 0;
  
  // Word count contribution (0-30 points)
  richness += Math.min(wordCount * 2, 30);
  
  // Quality indicators (0-70 points)
  if (hasSpecifics) richness += 20;
  if (hasSuggestions) richness += 25;
  if (hasDetails) richness += 25;
  
  return Math.min(richness, 100);
}

/**
 * Analyze satisfaction level from feedback content and rating consistency
 * @param {string} comments - Feedback comments
 * @param {number} rating - Numerical rating
 * @returns {number} - Satisfaction score (0-100)
 */
function analyzeSatisfactionLevel(comments, rating) {
  if (!comments) return (rating - 1) * 25; // Fallback to rating-based score
  
  // Positive sentiment indicators
  const positiveWords = ['good', 'great', 'excellent', 'helpful', 'clear', 'useful', 'perfect', 'love', 'amazing'];
  const negativeWords = ['bad', 'poor', 'confusing', 'unclear', 'useless', 'terrible', 'hate', 'wrong', 'difficult'];
  
  const lowerComments = comments.toLowerCase();
  const positiveCount = positiveWords.filter(word => lowerComments.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerComments.includes(word)).length;
  
  // Sentiment score
  const sentimentScore = (positiveCount - negativeCount) * 10 + 50; // Base 50, adjust by sentiment
  
  // Rating consistency
  const ratingScore = (rating - 1) * 25; // Convert 1-5 to 0-100
  
  // Combine sentiment and rating with weights
  const satisfactionScore = (sentimentScore * 0.6) + (ratingScore * 0.4);
  
  return Math.max(0, Math.min(100, satisfactionScore));
}

/**
 * Analyze how well the response aligned with user preferences
 * @param {string} comments - Feedback comments
 * @returns {number} - Preference alignment score (0-100)
 */
function analyzePreferenceAlignment(comments) {
  if (!comments) return 50; // Neutral score if no comments
  
  const lowerComments = comments.toLowerCase();
  
  // Preference indicators
  const alignmentIndicators = {
    positive: ['exactly what', 'just what', 'perfect for', 'just right', 'what I needed'],
    negative: ['not what', "didn't want", 'too complex', 'too simple', 'not helpful']
  };
  
  let score = 50; // Start with neutral
  
  // Check for positive alignment
  alignmentIndicators.positive.forEach(indicator => {
    if (lowerComments.includes(indicator)) {
      score += 15;
    }
  });
  
  // Check for negative alignment
  alignmentIndicators.negative.forEach(indicator => {
    if (lowerComments.includes(indicator)) {
      score -= 15;
    }
  });
  
  return Math.max(0, Math.min(100, score));
}

// Analytics Routes
app.get('/api/analytics/topics/popularity', async (req, res) => {
  try {
    console.log('[Analytics] Fetching topic popularity across all users');
    
    const { data: topicCounts, error } = await supabase
      .from('sessions')
      .select('secret_topic')
      .not('secret_topic', 'eq', null)
      .not('secret_topic', 'eq', 'no_specific_topic');
    
    if (error) throw error;
    
    // Count occurrences of each topic
    const topicStats = {};
    topicCounts.forEach(session => {
      const topic = session.secret_topic;
      topicStats[topic] = (topicStats[topic] || 0) + 1;
    });
    
    // Convert to array and sort by popularity
    const popularTopics = Object.entries(topicStats)
      .map(([topic, count]) => ({
        topic_name: topic,
        session_count: count,
        percentage: ((count / topicCounts.length) * 100).toFixed(2)
      }))
      .sort((a, b) => b.session_count - a.session_count);
    
    console.log(`[Analytics] Found ${popularTopics.length} topics with ${topicCounts.length} total sessions`);
    
    res.json({
      success: true,
      popular_topics: popularTopics,
      total_sessions: topicCounts.length,
      unique_topics: popularTopics.length
    });
  } catch (error) {
    console.error('[Analytics] Error fetching topic popularity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analytics/topics/timeline', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    console.log(`[Analytics] Fetching topic timeline for ${timeframe}`);
    
    // Calculate date range based on timeframe
    const now = new Date();
    const daysBack = timeframe === '30d' ? 30 : timeframe === '7d' ? 7 : 1;
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('secret_topic, created_at')
      .gte('created_at', startDate.toISOString())
      .not('secret_topic', 'eq', null)
      .not('secret_topic', 'eq', 'no_specific_topic')
      .order('created_at');
    
    if (error) throw error;
    
    // Group by date and topic
    const timelineData = {};
    sessions.forEach(session => {
      const date = session.created_at.split('T')[0]; // Get YYYY-MM-DD
      const topic = session.secret_topic;
      
      if (!timelineData[date]) {
        timelineData[date] = {};
      }
      timelineData[date][topic] = (timelineData[date][topic] || 0) + 1;
    });
    
    console.log(`[Analytics] Generated timeline data for ${Object.keys(timelineData).length} dates`);
    
    res.json({
      success: true,
      timeline_data: timelineData,
      timeframe,
      total_sessions: sessions.length
    });
  } catch (error) {
    console.error('[Analytics] Error fetching topic timeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analytics/users/engagement', async (req, res) => {
  try {
    console.log('[Analytics] Fetching user engagement analytics');
    
    // Get user session counts
    const { data: userStats, error: userError } = await supabase
      .from('sessions')
      .select('user_id')
      .not('secret_topic', 'eq', null);
    
    if (userError) throw userError;
    
    // Count sessions per user
    const userEngagement = {};
    userStats.forEach(session => {
      const userId = session.user_id;
      userEngagement[userId] = (userEngagement[userId] || 0) + 1;
    });
    
    // Create engagement distribution
    const engagementLevels = {
      'Very Active (10+ sessions)': 0,
      'Active (5-9 sessions)': 0,
      'Moderate (2-4 sessions)': 0,
      'New (1 session)': 0
    };
    
    Object.values(userEngagement).forEach(sessionCount => {
      if (sessionCount >= 10) {
        engagementLevels['Very Active (10+ sessions)']++;
      } else if (sessionCount >= 5) {
        engagementLevels['Active (5-9 sessions)']++;
      } else if (sessionCount >= 2) {
        engagementLevels['Moderate (2-4 sessions)']++;
      } else {
        engagementLevels['New (1 session)']++;
      }
    });
    
    console.log(`[Analytics] Analyzed ${Object.keys(userEngagement).length} users`);
    
    res.json({
      success: true,
      engagement_distribution: engagementLevels,
      total_users: Object.keys(userEngagement).length,
      total_sessions: userStats.length,
      avg_sessions_per_user: (userStats.length / Object.keys(userEngagement).length).toFixed(2)
    });
  } catch (error) {
    console.error('[Analytics] Error fetching user engagement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analytics/topics/trends', async (req, res) => {
  try {
    console.log('[Analytics] Fetching topic growth trends');
    
    // Get sessions from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    const fifteenDaysAgo = new Date(Date.now() - (15 * 24 * 60 * 60 * 1000));
    
    const { data: recentSessions, error: recentError } = await supabase
      .from('sessions')
      .select('secret_topic, created_at')
      .gte('created_at', fifteenDaysAgo.toISOString())
      .not('secret_topic', 'eq', null);
    
    const { data: olderSessions, error: olderError } = await supabase
      .from('sessions')
      .select('secret_topic, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .lt('created_at', fifteenDaysAgo.toISOString())
      .not('secret_topic', 'eq', null);
    
    if (recentError || olderError) throw recentError || olderError;
    
    // Count topics in each period
    const recentCounts = {};
    const olderCounts = {};
    
    recentSessions.forEach(session => {
      const topic = session.secret_topic;
      recentCounts[topic] = (recentCounts[topic] || 0) + 1;
    });
    
    olderSessions.forEach(session => {
      const topic = session.secret_topic;
      olderCounts[topic] = (olderCounts[topic] || 0) + 1;
    });
    
    // Calculate trends
    const allTopics = new Set([...Object.keys(recentCounts), ...Object.keys(olderCounts)]);
    const trends = Array.from(allTopics).map(topic => {
      const recent = recentCounts[topic] || 0;
      const older = olderCounts[topic] || 0;
      const change = older > 0 ? ((recent - older) / older * 100).toFixed(1) : 'New';
      
      return {
        topic_name: topic,
        recent_sessions: recent,
        previous_sessions: older,
        growth_percentage: change,
        trend: recent > older ? 'up' : recent < older ? 'down' : 'stable'
      };
    }).sort((a, b) => b.recent_sessions - a.recent_sessions);
    
    console.log(`[Analytics] Calculated trends for ${trends.length} topics`);
    
    res.json({
      success: true,
      trends,
      period: 'Last 15 days vs Previous 15 days'
    });
  } catch (error) {
    console.error('[Analytics] Error fetching topic trends:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/analytics/clusters/distribution', async (req, res) => {
  try {
    console.log('[Analytics] Fetching cluster distribution analytics');
    
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('cluster_id')
      .not('cluster_id', 'eq', null);
    
    if (error) throw error;
    
    // Count users per cluster
    const clusterCounts = {};
    profiles.forEach(profile => {
      const clusterId = profile.cluster_id;
      clusterCounts[clusterId] = (clusterCounts[clusterId] || 0) + 1;
    });
    
    // Convert to array and add cluster stats
    const clusterStats = Object.entries(clusterCounts).map(([clusterId, userCount]) => ({
      cluster_id: clusterId,
      user_count: userCount,
      percentage: ((userCount / profiles.length) * 100).toFixed(2)
    })).sort((a, b) => b.user_count - a.user_count);
    
    console.log(`[Analytics] Found ${clusterStats.length} clusters with ${profiles.length} total users`);
    
    res.json({
      success: true,
      cluster_distribution: clusterStats,
      total_users: profiles.length,
      total_clusters: clusterStats.length,
      avg_users_per_cluster: (profiles.length / clusterStats.length).toFixed(2)
    });
  } catch (error) {
    console.error('[Analytics] Error fetching cluster distribution:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for generating Examples tab content - with database persistence
app.post('/api/generate-examples', async (req, res) => {
  try {
    const { query, mainContent, sessionId, preferences, userId, messageId } = req.body;
    
    console.log('Received request to generate examples:', { 
      query: query?.substring(0, 50) + '...', 
      sessionId, 
      userId: userId || 'anonymous',
      messageId: messageId || 'no_message_id'
    });
    
    if (!query || !mainContent) {
      return res.status(400).json({ error: 'Query and main content are required' });
    }

    // First check if content already exists in database
    if (messageId) {
      try {
        const { data: existingContent, error: fetchError } = await supabase
          .from('response_tab_content')
          .select('content')
          .eq('message_id', messageId)
          .eq('tab_type', 'examples')
          .single();

        if (existingContent && !fetchError) {
          console.log('Returning existing examples content from database');
          return res.json({ 
            content: existingContent.content,
            examples: existingContent.content,
            timestamp: new Date().toISOString(),
            from_cache: true
          });
        }
      } catch (dbError) {
        console.log('No existing content found, generating new examples');
      }
    }

    console.log('Generating new examples content via OpenAI');
    
    // Create a prompt for generating examples
    const examplesPrompt = `Based on the following question and explanation, generate practical examples that help illustrate the concept. Make the examples concrete, diverse, and easy to understand.

Original Question: ${query}

Main Explanation: ${mainContent.substring(0, 1000)}...

Please provide 3-5 clear, practical examples that demonstrate this concept in action. Each example should:
1. Be concrete and specific
2. Show the concept being applied in real-world scenarios
3. Be relatable and easy to understand
4. Include brief explanations of how the concept applies

${preferences?.preferred_analogy_domains?.length ? 
  `User is particularly interested in: ${preferences.preferred_analogy_domains.join(', ')}. Try to include examples from these domains when relevant.` : 
  ''}

Format your response as clear, well-structured examples with headings and explanations.`;

    // Call OpenAI API for examples
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: examplesPrompt }],
      temperature: 0.7,
      max_tokens: 2000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });
    
    const examplesContent = completion.choices[0].message.content;

    // Save to database for future use
    if (messageId && userId) {
      try {
        const { error: saveError } = await supabase
          .from('response_tab_content')
          .insert({
            message_id: messageId,
            user_id: userId,
            session_id: sessionId,
            tab_type: 'examples',
            content: examplesContent,
            original_query: query,
            main_content: mainContent.substring(0, 1000),
            preferences: preferences || {}
          });

        if (saveError) {
          console.error('Error saving examples content to database:', saveError);
          // Continue anyway, just log the error
        } else {
          console.log('Successfully saved examples content to database');
        }
      } catch (dbError) {
        console.error('Database error while saving examples:', dbError);
      }
    }
    
    // Log the interaction if we have a session
    if (sessionId) {
      await sessionManager.addInteraction(sessionId, {
        type: 'examples_generation',
        query,
        examples: examplesContent,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      content: examplesContent,
      examples: examplesContent,
      timestamp: new Date().toISOString(),
      from_cache: false
    });
    
  } catch (error) {
    console.error('Error generating examples:', error);
    res.status(500).json({ 
      error: 'Failed to generate examples', 
      message: error.message 
    });
  }
});

// API endpoint for generating Abstract/Analogies tab content - with database persistence
app.post('/api/generate-abstract', async (req, res) => {
  try {
    const { query, mainContent, sessionId, preferences, userId, messageId } = req.body;
    
    console.log('Received request to generate abstract:', { 
      query: query?.substring(0, 50) + '...', 
      sessionId, 
      userId: userId || 'anonymous',
      messageId: messageId || 'no_message_id'
    });
    
    if (!query || !mainContent) {
      return res.status(400).json({ error: 'Query and main content are required' });
    }

    // First check if content already exists in database
    if (messageId) {
      try {
        const { data: existingContent, error: fetchError } = await supabase
          .from('response_tab_content')
          .select('content')
          .eq('message_id', messageId)
          .eq('tab_type', 'abstract')
          .single();

        if (existingContent && !fetchError) {
          console.log('Returning existing abstract content from database');
          return res.json({ 
            content: existingContent.content,
            abstract: existingContent.content,
            timestamp: new Date().toISOString(),
            from_cache: true
          });
        }
      } catch (dbError) {
        console.log('No existing content found, generating new abstract');
      }
    }

    console.log('Generating new abstract content via OpenAI');
    
    // Determine analogy domains based on preferences
    let analogyDomains = ['everyday life', 'nature', 'cooking', 'sports'];
    if (preferences?.preferred_analogy_domains?.length) {
      analogyDomains = preferences.preferred_analogy_domains;
    } else if (preferences?.interests?.length) {
      analogyDomains = preferences.interests;
    }
    
    // Create a prompt for generating analogies
    const analogiesPrompt = `Based on the following question and explanation, create insightful analogies that help make this concept easier to understand. Focus on clear, relatable comparisons.

Original Question: ${query}

Main Explanation: ${mainContent.substring(0, 1000)}...

Please provide 2-3 detailed analogies that explain this concept using familiar comparisons. Each analogy should:
1. Use familiar concepts from domains like: ${analogyDomains.join(', ')}
2. Clearly map the key aspects of the original concept to the analogy
3. Explain the similarities and how they help understand the concept
4. Be engaging and memorable

Format your response with clear analogies, each with:
- A descriptive title
- The analogy explanation
- How it relates back to the original concept

Make the analogies vivid and easy to visualize.`;

    // Call OpenAI API for analogies
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: analogiesPrompt }],
      temperature: 0.8,
      max_tokens: 2000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });
    
    const analogiesContent = completion.choices[0].message.content;

    // Save to database for future use
    if (messageId && userId) {
      try {
        const { error: saveError } = await supabase
          .from('response_tab_content')
          .insert({
            message_id: messageId,
            user_id: userId,
            session_id: sessionId,
            tab_type: 'abstract',
            content: analogiesContent,
            original_query: query,
            main_content: mainContent.substring(0, 1000),
            preferences: preferences || {}
          });

        if (saveError) {
          console.error('Error saving abstract content to database:', saveError);
          // Continue anyway, just log the error
        } else {
          console.log('Successfully saved abstract content to database');
        }
      } catch (dbError) {
        console.error('Database error while saving abstract:', dbError);
      }
    }
    
    // Log the interaction if we have a session
    if (sessionId) {
      await sessionManager.addInteraction(sessionId, {
        type: 'analogies_generation',
        query,
        analogies: analogiesContent,
        analogy_domains: analogyDomains,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      content: analogiesContent,
      abstract: analogiesContent,
      analogy_domains: analogyDomains,
      timestamp: new Date().toISOString(),
      from_cache: false
    });
    
  } catch (error) {
    console.error('Error generating abstract:', error);
    res.status(500).json({ 
      error: 'Failed to generate abstract content', 
      message: error.message 
    });
  }
});

// API endpoint to retrieve existing tab content
app.get('/api/response-tab-content/:messageId/:tabType', async (req, res) => {
  try {
    const { messageId, tabType } = req.params;
    
    if (!messageId || !tabType) {
      return res.status(400).json({ error: 'Message ID and tab type are required' });
    }

    if (!['examples', 'abstract'].includes(tabType)) {
      return res.status(400).json({ error: 'Invalid tab type. Must be examples or abstract' });
    }

    const { data: content, error } = await supabase
      .from('response_tab_content')
      .select('content, created_at')
      .eq('message_id', messageId)
      .eq('tab_type', tabType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No content found
        return res.status(404).json({ error: 'Content not found' });
      }
      throw error;
    }

    res.json({
      content: content.content,
      created_at: content.created_at,
      tab_type: tabType,
      message_id: messageId
    });

  } catch (error) {
    console.error('Error retrieving tab content:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve content', 
      message: error.message 
    });
  }
});
