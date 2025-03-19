import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';

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

// Initialize managers
const userManager = new UserManager();
const promptManager = new PromptManager();
const sessionManager = new SessionManager();
const feedbackProcessor = new FeedbackProcessor();
const supervisor = new Supervisor();

// Routes
app.post('/api/query', async (req, res) => {
  try {
    const { query, sessionId, preferences } = req.body;
    
    console.log('Received query request:', { 
      query, 
      sessionId: sessionId || 'none', 
      preferencesProvided: !!preferences 
    });
    
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
        const userId = req.user ? req.user.id : `anon_${Date.now()}`;
        sessionData = await sessionManager.createSession(userId, preferences);
        console.log(`Created new session ${sessionData.id} for user ${userId}`);
      }
    } else {
      // Create anonymous session if no user is authenticated
      const userId = req.user ? req.user.id : `anon_${Date.now()}`;
      console.log(`No session provided, creating new session for user ${userId}`);
      sessionData = await sessionManager.createSession(userId, preferences);
      console.log(`Created new session ${sessionData.id}`);
    }
    
    // Get conversation summary and history for context
    const conversationSummary = sessionManager.getConversationSummary(sessionData.id);
    
    // Prepare conversation history messages with better context handling
    const historyMessages = [];
    
    // Add system context about the current conversation
    const systemContext = {
      role: "system",
      content: `You are a knowledgeable AI tutor. Maintain conversation continuity.
${conversationSummary.lastExplanation 
  ? `Previous topic: ${conversationSummary.currentTopic}
Last explanation: ${conversationSummary.lastExplanation}`
  : "This is the start of the conversation."}
${conversationSummary.lastAnalogy
  ? `\nLast analogy: ${conversationSummary.lastAnalogy}`
  : ""}

Your responses must ALWAYS follow this format:

EXPLANATION:
${query.toLowerCase().includes('another') || query.toLowerCase().includes('one more')
  ? (conversationSummary.lastExplanation || 'No previous explanation available')
  : '[Provide a clear explanation]'}

ANALOGY:
${query.toLowerCase().includes('another') || query.toLowerCase().includes('one more')
  ? '[Provide a new analogy different from: ' + (conversationSummary.lastAnalogy || 'no previous analogy') + ']'
  : '[Provide a relatable analogy]'}

RESOURCES:
[Provide relevant learning resources]

Guidelines:
1. Never skip any section
2. For follow-up questions, reference previous context
3. For "another analogy" requests:
   - ALWAYS reuse the exact previous explanation
   - Provide a completely new and different analogy
   - Make sure the analogy is unique and not similar to previous ones
4. Maintain conversation continuity by referencing previous explanations when relevant
5. For any request containing "another" or similar words, treat it as a request for a new analogy while keeping the same explanation`
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
            content: `EXPLANATION:\n${interaction.response.explanation || ''}\n\nANALOGY:\n${interaction.response.analogy || ''}`
          }
        );
      }
    }

    // Add current query
    historyMessages.push({ role: "user", content: query });

    // Call OpenAI API with enhanced context
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: historyMessages,
      temperature: 0.7,
      max_tokens: 1500,
    });
    
    // Process the response
    const responseText = completion.choices[0].message.content;
    
    // Parse sections with error handling
    const sections = {
      explanation: '',
      analogy: '',
      resources: []
    };
    
    try {
      const parts = responseText.split('\n\n');
      for (const part of parts) {
        if (part.startsWith('EXPLANATION:')) {
          sections.explanation = part.replace('EXPLANATION:', '').trim();
        } else if (part.startsWith('ANALOGY:')) {
          sections.analogy = part.replace('ANALOGY:', '').trim();
        } else if (part.startsWith('RESOURCES:')) {
          const resourcesText = part.replace('RESOURCES:', '').trim();
          sections.resources = resourcesText.split('\n')
            .filter(line => line.trim())
            .map(line => {
              const urlMatch = line.match(/\[(.*?)\]\((.*?)\)/);
              return urlMatch ? {
                title: urlMatch[1],
                url: urlMatch[2],
                description: ''
              } : null;
            })
            .filter(Boolean);
        }
      }
    } catch (error) {
      console.error('Error parsing response sections:', error);
    }
    
    // Ensure sections are not empty
    sections.explanation = sections.explanation || 'No explanation provided';
    sections.analogy = sections.analogy || 'No analogy provided';
    sections.resources = sections.resources.length ? sections.resources : [];
    
    // Prepare final response
    const response = {
      id: uuidv4(),
      sessionId: sessionData.id,
      query,
      ...sections,
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});