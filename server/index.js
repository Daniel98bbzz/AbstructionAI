import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';
import { supabase } from './lib/supabaseClient.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

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

PERSONALIZATION INSTRUCTIONS (MANDATORY - YOU MUST FOLLOW THESE):
1. YOU MUST ALWAYS use the user's preferred analogy domains (${userProfile.preferred_analogy_domains ? userProfile.preferred_analogy_domains.join(', ') : 'general'}) when creating analogies. Do not use any other domains for analogies.
2. YOU MUST incorporate the user's interests (${userProfile.interests ? userProfile.interests.join(', ') : 'general topics'}) in your explanations and examples.
3. YOU MUST adjust technical depth based on education level and technical depth preference (${userProfile.technical_depth}/100).
4. YOU MUST present information in a way that matches their learning style (${userProfile.learning_style}).
5. YOU MUST align examples with their main learning goal (${userProfile.main_learning_goal}).

For "GAMING" analogies, use terms like: games, levels, power-ups, achievements, characters, quests, boss battles, inventory systems, experience points, multiplayer, gaming platforms.

For "COOKING" analogies, use terms like: recipes, ingredients, cooking methods, baking, temperature, kitchen tools, flavors, cuisine, restaurants, meal preparation.

For "SPORTS" analogies, use terms like: training, teams, players, games, competition, strategy, equipment, leagues, scoring, physical fitness.

These personalization instructions are NOT optional. The response MUST reflect all of these aspects.
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
[Provide a metaphor or real-world scenario that helps explain the concept, make it relatable${feedback && feedback.analogyTopic ? `. IMPORTANT: This MUST be a ${feedback.analogyTopic}-related analogy as explicitly requested by the user` : userProfile && userProfile.preferred_analogy_domains && userProfile.preferred_analogy_domains.length > 0 ? `. IMPORTANT: This MUST be an analogy related to one of these domains: ${userProfile.preferred_analogy_domains.join(', ')}. Do not use any other domains for the analogy.` : ''}]

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
${userProfile && userProfile.preferred_analogy_domains && userProfile.preferred_analogy_domains.length > 0 ? 
`- CRITICAL: EVERY analogy you create MUST be related to one of the user's preferred domains: ${userProfile.preferred_analogy_domains.join(', ')}.
- CRITICAL: Connect your examples to the user's interests: ${userProfile.interests ? userProfile.interests.join(', ') : 'general topics'}.` : ''}

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
      console.log('Parsing AI response into sections...');
      
      // First check if response follows the expected structure
      const hasExpectedFormat = 
        responseText.includes('SUGGESTED_TITLE:') &&
        responseText.includes('Introduction:') &&
        responseText.includes('Explanation:') &&
        responseText.includes('Analogy:');
      
      if (!hasExpectedFormat) {
        console.warn('WARNING: Response does not follow expected format. Using fallback parsing.');
        
        // Fallback: Try to extract meaningful sections
        const lines = responseText.split('\n');
        let currentSection = '';
        let titleFound = false;
        
        // First line is often a title if not explicitly marked
        if (lines.length > 0 && !lines[0].includes(':')) {
          sections.suggested_title = lines[0].trim();
          titleFound = true;
        }
        
        // Identify sections by looking for common headers
        lines.forEach(line => {
          const lowerLine = line.toLowerCase();
          
          if (lowerLine.includes('introduction') || lowerLine.includes('overview')) {
            currentSection = 'introduction';
          } else if (lowerLine.includes('explanation') || lowerLine.includes('understanding')) {
            currentSection = 'explanation';
          } else if (lowerLine.includes('analogy') || lowerLine.includes('comparison') || lowerLine.includes('think of it like')) {
            currentSection = 'analogy';
          } else if (lowerLine.includes('sources') || lowerLine.includes('resources') || lowerLine.includes('references')) {
            currentSection = 'sources';
          } else if (lowerLine.includes('recap') || lowerLine.includes('summary') || lowerLine.includes('key points')) {
            currentSection = 'recap';
          } else if (currentSection && line.trim()) {
            // Add content to the current section
            switch (currentSection) {
              case 'introduction':
                sections.introduction += line + '\n';
                break;
              case 'explanation':
                sections.explanation += line + '\n';
                break;
              case 'analogy':
                sections.analogy += line + '\n';
                break;
              case 'sources':
                if (line.trim() && !lowerLine.includes('sources') && !lowerLine.includes('resources')) {
                  sections.additional_sources.push({ title: line.trim() });
                }
                break;
              case 'recap':
                sections.recap += line + '\n';
                break;
            }
          } else if (!titleFound && line.trim() && !currentSection) {
            // If we haven't found a title yet and this is a non-empty line before any section
            sections.suggested_title = line.trim();
            titleFound = true;
          }
        });
        
        // If still no title, generate one
        if (!sections.suggested_title) {
          sections.suggested_title = `About ${query.split(' ').slice(0, 3).join(' ')}...`;
        }
        
        // If no explanation but we have content, put everything into explanation
        if (!sections.explanation && responseText.length > 0) {
          sections.explanation = responseText;
        }
      } else {
        // Regular parsing for well-formatted responses
        // Split by section headers with improved pattern matching
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
      }
      
      // Check if analogy uses preferred domains
      if (userProfile && userProfile.preferred_analogy_domains && userProfile.preferred_analogy_domains.length > 0 && sections.analogy) {
        const preferredDomains = userProfile.preferred_analogy_domains.map(domain => domain.toLowerCase());
        const analogyText = sections.analogy.toLowerCase();
        
        // Create variations of the preferred domains to check for
        const domainVariations = {
          'gaming': ['game', 'gamer', 'video game', 'gaming', 'gameplay', 'rpg', 'mmo', 'fps', 'moba', 'console', 'playstation', 'xbox', 'nintendo', 'steam'],
          'cooking': ['cook', 'chef', 'recipe', 'kitchen', 'baking', 'food', 'ingredient', 'culinary', 'dish', 'meal', 'cuisine'],
          'sports': ['sport', 'athlete', 'team', 'player', 'game', 'match', 'competition', 'tournament', 'championship', 'coach'],
          'music': ['musician', 'band', 'song', 'instrument', 'rhythm', 'melody', 'concert', 'performance', 'album', 'artist', 'note'],
          'art': ['artist', 'painting', 'drawing', 'sculpture', 'canvas', 'gallery', 'exhibit', 'creative', 'craft', 'design'],
          'travel': ['trip', 'journey', 'destination', 'vacation', 'tourist', 'explore', 'adventure', 'tour', 'country', 'city'],
          'gardening': ['garden', 'plant', 'seed', 'flower', 'grow', 'soil', 'pot', 'greenhouse', 'landscaping', 'herb'],
          'technology': ['tech', 'computer', 'software', 'hardware', 'device', 'app', 'digital', 'electronic', 'program', 'code']
        };
        
        // Check if any preferred domain or its variations are mentioned in the analogy
        const domainMentioned = preferredDomains.some(domain => {
          // Direct match with the domain itself
          if (analogyText.includes(domain)) return true;
          
          // Check variations if they exist for this domain
          const variations = domainVariations[domain] || [];
          return variations.some(variation => analogyText.includes(variation));
        });
        
        console.log(`Analogy domain check - Using preferred domains?: ${domainMentioned}`);
        console.log(`Preferred domains: ${preferredDomains.join(', ')}`);
        console.log(`Analogy snippet: ${analogyText.substring(0, 100)}...`);
        
        // If preferred domains aren't used, we need to regenerate the analogy
        if (!domainMentioned) {
          console.log('WARNING: Generated analogy does not use any preferred domains. Requesting specific analogy...');
          
          // Prepare a message to regenerate just the analogy
          const regenerateMessages = [
            {
              role: "system",
              content: `You are tasked with creating a new analogy that MUST relate to one of these domains: ${preferredDomains.join(', ')}. 
The analogy must clearly explain the concept and explicitly mention the domain.
DO NOT use general analogies like libraries, highways, etc. ONLY use the user's preferred domains.

For example, if the preferred domain is "gaming", the analogy MUST use specific gaming concepts like levels, power-ups, game mechanics, etc.
If the preferred domain is "cooking", the analogy MUST use specific cooking concepts like recipes, ingredients, cooking techniques, etc.

Your response must ONLY contain the analogy and nothing else. DO NOT include any other text, explanations, or sections.
The first word of your response MUST be one of the preferred domains.`
            },
            {
              role: "user",
              content: `Create an analogy for this concept: ${query}

The analogy MUST be related to one of these domains: ${preferredDomains.join(', ')}.
Current explanation: ${sections.explanation}

The current analogy doesn't use any of the preferred domains and needs to be replaced with one that does.
Make sure your analogy explicitly mentions one of these words: ${preferredDomains.join(', ')}`
            }
          ];
          
          try {
            // Call OpenAI to generate a new analogy
            const analogyCompletion = await openai.chat.completions.create({
              model: "gpt-4",
              messages: regenerateMessages,
              temperature: 0.7,
              max_tokens: 1000
            });
            
            // Replace the analogy with the regenerated one
            const newAnalogy = analogyCompletion.choices[0].message.content.trim();
            console.log('Generated new domain-specific analogy');
            
            // Only replace if we got something substantial and it actually contains a preferred domain
            if (newAnalogy && newAnalogy.length > 50) {
              // Double check that the new analogy actually contains a preferred domain
              const newAnalogySatisfiesDomain = preferredDomains.some(domain => 
                newAnalogy.toLowerCase().includes(domain.toLowerCase())
              );
              
              if (newAnalogySatisfiesDomain) {
                sections.analogy = newAnalogy;
                console.log('Replaced analogy with domain-specific version');
              } else {
                console.log('WARNING: Regenerated analogy still does not use preferred domains');
                // Try one more time with an even stronger prompt
                const lastChanceMessages = [
                  {
                    role: "system",
                    content: `CRITICAL INSTRUCTION: You MUST create an analogy that uses ONLY the domain: ${preferredDomains[0]}.
Your response MUST start with the words "${preferredDomains[0]}: " and then continue with the analogy.
No exceptions. No other domains. If you fail to follow this instruction exactly, there will be serious consequences.`
                  },
                  {
                    role: "user", 
                    content: `Create a ${preferredDomains[0]} analogy for: ${query}`
                  }
                ];
                
                try {
                  const lastChanceCompletion = await openai.chat.completions.create({
                    model: "gpt-4",
                    messages: lastChanceMessages,
                    temperature: 0.3,
                    max_tokens: 1000
                  });
                  
                  const forcedAnalogy = lastChanceCompletion.choices[0].message.content.trim();
                  if (forcedAnalogy && forcedAnalogy.length > 40) {
                    sections.analogy = forcedAnalogy;
                    console.log('Used forced domain-specific analogy as last resort');
                  }
                } catch (lastError) {
                  console.error('Error in last-chance analogy generation:', lastError);
                }
              }
            }
          } catch (analogyError) {
            console.error('Error generating domain-specific analogy:', analogyError);
          }
        }
      }
    } catch (error) {
      console.error('Error parsing response sections:', error);
      // In case of error, use the full text as the explanation
      sections.explanation = responseText || 'No explanation provided';
      sections.suggested_title = `About ${query.split(' ').slice(0, 3).join(' ')}...`;
    }
    
    // Ensure sections are not empty
    sections.suggested_title = sections.suggested_title || `About ${query.split(' ').slice(0, 3).join(' ')}...`;
    sections.introduction = sections.introduction || 'No introduction provided';
    sections.explanation = sections.explanation || (responseText || 'No explanation provided');
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
    
    // Create a memory representation of a profile
    const forcedProfile = {
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
    
    // Store this in a global memory cache
    global.userProfiles = global.userProfiles || {};
    global.userProfiles[userId] = forcedProfile;
    
    console.log('Created memory-only profile for:', userId);
    console.log('Current memory profiles:', Object.keys(global.userProfiles));
    
    res.json({
      success: true,
      profile: forcedProfile,
      note: 'This profile exists only in memory and will be lost if the server restarts'
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
      
      // Ensure arrays are properly formatted
      const formattedProfile = {
        ...record,
        interests: Array.isArray(record.interests) ? 
          record.interests : 
          (typeof record.interests === 'string' ? 
            JSON.parse(record.interests) : 
            ['Video Games', 'Art']),
        preferred_analogy_domains: Array.isArray(record.preferred_analogy_domains) ? 
          record.preferred_analogy_domains : 
          (typeof record.preferred_analogy_domains === 'string' ? 
            JSON.parse(record.preferred_analogy_domains) : 
            ['Gaming', 'Cooking'])
      };
      
      global.userProfiles[record.id] = formattedProfile;
      
      console.log('Memory cache updated from webhook for user:', record.id);
      console.log('New preferences:', {
        interests: formattedProfile.interests,
        preferred_analogy_domains: formattedProfile.preferred_analogy_domains
      });
      
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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});