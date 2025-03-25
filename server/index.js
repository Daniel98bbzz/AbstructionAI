import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { supabase } from './lib/supabaseClient.js';

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
    const userId = req.user?.id;
    let userProfile = null;
    
    // Fetch user profile if authenticated
    if (userId) {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();
          
        if (!error && data) {
          userProfile = data;
          console.log('Using user profile preferences for personalized response');
        }
      } catch (profileError) {
        console.error('Error fetching user profile:', profileError);
      }
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

${userProfile ? `USER PROFILE INFORMATION:
- Occupation: ${userProfile.occupation}
- Education Level: ${userProfile.education_level}
- Age: ${userProfile.age}
- Learning Style: ${userProfile.learning_style}
- Technical Depth Preference: ${userProfile.technical_depth}/100
- Main Learning Goal: ${userProfile.main_learning_goal}
- Interests: ${userProfile.interests ? userProfile.interests.join(', ') : 'Not specified'}
- Preferred Analogy Domains: ${userProfile.preferred_analogy_domains ? userProfile.preferred_analogy_domains.join(', ') : 'Not specified'}

PERSONALIZATION INSTRUCTIONS:
1. Use the user's preferred analogy domains when creating analogies. This is EXTREMELY important.
2. Adjust technical depth based on education level and technical depth preference.
3. Present information in a way that matches their learning style.
4. Connect explanations to their interests when possible.
5. Align examples with their main learning goal.
` : ''}

${isRegeneration && feedback ? `This is a REGENERATION request based on user feedback. Please address these specific points:
${feedback.specificInstructions ? feedback.specificInstructions.map(instr => `- ${instr}`).join('\n') : ''}

${feedback.analogyTopic ? `\nCRITICAL INSTRUCTION: You MUST provide an analogy specifically related to ${feedback.analogyTopic}.
${feedback.analogyTopic === 'gaming' ? `For the gaming analogy:
- Use concepts from video games like levels, characters, power-ups, quests, or game mechanics
- Reference popular games if relevant (Minecraft, Mario, League of Legends, etc.)
- Ensure the gaming metaphor clearly explains the original concept
- Make it accessible even to casual gamers` : ''}
This is the user's explicit request.` : ''}

${feedback.analogyHelpful === 'no' || feedback.analogyHelpful === 'partially' ? 
`IMPORTANT: Provide a more relatable and clearer analogy.` : ''}

${feedback.explanationClear === 'no' || feedback.explanationClear === 'partially' ? 
`IMPORTANT: The previous explanation was not clear enough. Make it more straightforward and easier to understand.` : ''}

${feedback.explanationDetail === 'more_detailed' ? 
`IMPORTANT: Provide a more detailed and comprehensive explanation with deeper technical information.` : ''}

${feedback.explanationDetail === 'simpler' ? 
`IMPORTANT: Simplify the explanation significantly. Use easier language and less technical jargon.` : ''}

${(feedback.explanationDetail === 'exactly_right' && feedback.explanationClear === 'yes' && feedback.analogyHelpful !== 'yes' && feedback.analogyTopic) ? 
`IMPORTANT: Keep the original explanation section exactly the same - only change the analogy section.` : ''}

${feedback.rating <= 3 ? 
`The user rated the previous response as ${feedback.rating}/5, indicating it needs significant improvement.` : ''}

${feedback.comments ? `\nUser comments: "${feedback.comments}"` : ''}
\nMake improvements to the previous response based on this feedback.
` : ''}

Your responses must ALWAYS follow this format:

SUGGESTED_TITLE:
[A brief, descriptive title for this conversation, maximum 5-7 words]

Introduction:
[A concise overview of the topic, 2-3 sentences]

Explanation:
[A detailed and comprehensive explanation of the concept, at least 3-4 paragraphs with examples]

Analogy:
[Provide a metaphor or real-world scenario that helps explain the concept, make it relatable${feedback && feedback.analogyTopic ? `. IMPORTANT: This MUST be a ${feedback.analogyTopic}-related analogy as explicitly requested by the user` : userProfile && userProfile.preferred_analogy_domains && userProfile.preferred_analogy_domains.length > 0 ? `. IMPORTANT: This should be a ${userProfile.preferred_analogy_domains[0]}-related analogy as per user's profile preferences` : ''}]

Additional Sources:
[Provide 3-5 relevant learning resources with URLs when possible]

Brief Recap:
[Summarize the key points in 3-5 bullet points]

Style and Guidelines:
- Always use second-person language (e.g., "you," "your") to address the user directly.
- Keep language clear, friendly, and respectful.
${userProfile ? `- Adjust technical depth to match the user's preference (${userProfile.technical_depth}/100).` : '- Avoid overly technical jargon unless the user explicitly requests deeper technical detail.'}
- Be thorough and detailed - aim for comprehensive explanations.
- Use examples to illustrate your points.

If user asks for another analogy, ALWAYS reuse the previous explanation but provide a new and different analogy.
Never skip any section of the format. Each section must be properly identified with its header.`
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
    
    // Parse sections with error handling
    const sections = {
      suggested_title: '',
      introduction: '',
      explanation: '',
      analogy: '',
      additional_sources: [],
      recap: ''
    };
    
    try {
      // Split by section headers
      const titleMatch = responseText.match(/SUGGESTED_TITLE:[\s\S]*?(?=Introduction:|$)/i);
      const introMatch = responseText.match(/Introduction:[\s\S]*?(?=Explanation:|$)/i);
      const explanationMatch = responseText.match(/Explanation:[\s\S]*?(?=Analogy:|$)/i);
      const analogyMatch = responseText.match(/Analogy:[\s\S]*?(?=Additional Sources:|$)/i);
      const sourcesMatch = responseText.match(/Additional Sources:[\s\S]*?(?=Brief Recap:|$)/i);
      const recapMatch = responseText.match(/Brief Recap:[\s\S]*?(?=Style and Guidelines:|$)/i);
      
      if (titleMatch) sections.suggested_title = titleMatch[0].replace(/SUGGESTED_TITLE:/i, '').trim();
      if (introMatch) sections.introduction = introMatch[0].replace(/Introduction:/i, '').trim();
      if (explanationMatch) sections.explanation = explanationMatch[0].replace(/Explanation:/i, '').trim();
      if (analogyMatch) sections.analogy = analogyMatch[0].replace(/Analogy:/i, '').trim();
      
      // Process resources
      if (sourcesMatch) {
        const sourcesContent = sourcesMatch[0].replace(/Additional Sources:/i, '').trim();
        const resourceLines = sourcesContent.split('\n').filter(line => line.trim());
        
        sections.additional_sources = resourceLines.map(line => {
          const urlMatch = line.match(/\[(.*?)\]\((.*?)\)/);
          if (urlMatch) {
            return {
              title: urlMatch[1],
              url: urlMatch[2],
              description: ''
            };
          } else {
            return {
              title: line,
              url: '',
              description: ''
            };
          }
        });
      }
      
      if (recapMatch) sections.recap = recapMatch[0].replace(/Brief Recap:/i, '').trim();
    } catch (error) {
      console.error('Error parsing response sections:', error);
    }
    
    // Ensure sections are not empty
    sections.suggested_title = sections.suggested_title || '';
    sections.introduction = sections.introduction || 'No introduction provided';
    sections.explanation = sections.explanation || 'No explanation provided';
    sections.analogy = sections.analogy || 'No analogy provided';
    sections.additional_sources = sections.additional_sources.length ? sections.additional_sources : [];
    sections.recap = sections.recap || 'No recap provided';
    
    // Prepare final response
    const response = {
      id: uuidv4(),
      sessionId: sessionData.id,
      query,
      suggested_title: sections.suggested_title,
      introduction: sections.introduction,
      explanation: sections.explanation,
      analogy: sections.analogy,
      resources: sections.additional_sources,
      recap: sections.recap,
      timestamp: new Date().toISOString()
    };
    
    // Add interaction to session
    await sessionManager.addInteraction(sessionData.id, {
      type: 'query',
      query,
      response
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
    const userId = req.user.id;
    const profileData = req.body;
    const updatedProfile = await UserProfileManager.updateProfile(userId, profileData);
    res.json(updatedProfile);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});