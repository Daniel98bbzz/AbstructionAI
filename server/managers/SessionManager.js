class SessionManager {
  constructor() {
    // Initialize session storage
    this.sessions = new Map();
    this.contextMemory = new Map();
    this.topicGraph = new Map();
    
    // Import supabase client
    try {
      import('../lib/supabaseClient.js').then(({ supabase }) => {
        this.supabase = supabase;
        console.log('Supabase client initialized in SessionManager');
      }).catch(err => {
        console.error('Failed to import supabase client in SessionManager:', err);
        this.supabase = null;
      });
    } catch (err) {
      console.error('Error initializing Supabase client in SessionManager:', err);
      this.supabase = null;
    }
  }

  /**
   * Create a new session
   * @param {string} userId - The user ID
   * @param {Object} preferences - User preferences for this session
   * @returns {Object} The created session
   */
  async createSession(userId, preferences = {}) {
    const sessionId = this.generateSessionId();
    console.log(`[BACKEND DEBUG] Creating new session with UUID: ${sessionId}`);
    
    const session = {
      id: sessionId,
      userId,
      preferences,
      interactions: [],
      topics: new Set(),
      created_at: new Date().toISOString(),
      status: 'active',
      lastInteraction: null,
      currentTopic: null,
      recentFocus: []
    };
    
    // Initialize context memory for the session
    this.contextMemory.set(sessionId, {
      topicChain: [],
      conceptualLinks: new Map(),
      clarificationHistory: [],
      userUnderstanding: new Map(),
      lastExplanation: null,
      lastAnalogy: null
    });
    
    this.sessions.set(sessionId, session);
    
    // Attempt to create the session in the database immediately
    if (this.supabase) {
      try {
        const { error: sessionCreateError } = await this.supabase
          .from('sessions')
          .insert([{
            id: sessionId,
            user_id: userId,
            preferences: preferences || {},
            status: 'active'
          }]);
          
        if (sessionCreateError) {
          console.error(`[BACKEND DEBUG] Error creating session ${sessionId} in database:`, sessionCreateError);
        } else {
          console.log(`[BACKEND DEBUG] Successfully created session ${sessionId} in database`);
        }
      } catch (e) {
        console.error('[BACKEND DEBUG] Exception creating session in database:', e);
      }
    }
    
    return session;
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - The session ID
   * @returns {Object} The session data
   */
  async getSession(sessionId) {
    if (!sessionId) {
      console.error('No session ID provided to getSession');
      return null;
    }
    
    console.log(`[BACKEND DEBUG] Retrieving session data for session ID: ${sessionId}`);
    
    // First check memory cache
    if (this.sessions.get(sessionId)) {
      console.log(`[BACKEND DEBUG] Found session ${sessionId} in memory cache`);
      return this.sessions.get(sessionId);
    }
    
    // Not in memory, try to load from database
    if (this.supabase) {
      try {
        console.log(`[BACKEND DEBUG] Querying database for session: ${sessionId}`);
        
        // Query sessions table
        const result = await this.supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
          
        const sessionData = result.data;
        const sessionError = result.error;
        
        if (sessionData) {
          console.log(`[BACKEND DEBUG] Found session in sessions table: ${sessionId}`);
        } else if (sessionError) {
          console.error(`[BACKEND DEBUG] Error retrieving session ${sessionId}:`, sessionError);
          // Fall through to recreate the session instead of returning null
        }
        
        if (sessionData) {
          // Get interactions from the interactions table
          let interactionsData = [];
          let interactionsError = null;
          
          try {
            const { data, error } = await this.supabase
              .from('interactions')
              .select('*')
              .eq('session_id', sessionId)
              .order('created_at');
              
            if (data) {
              interactionsData = data;
              console.log(`[BACKEND DEBUG] Found ${data.length} interactions in interactions table for session ${sessionId}`);
              data.forEach((interaction, i) => {
                console.log(`[BACKEND DEBUG] Interaction ${i+1}: ${interaction.type} - ${interaction.query?.substring(0, 30) || 'no query'}`);
              });
            } else if (error) {
              interactionsError = error;
              console.error(`[BACKEND DEBUG] Error retrieving interactions:`, error);
            }
          } catch (e) {
            console.log('[BACKEND DEBUG] Error checking interactions table:', e);
          }
          
          // Create a session object from database data
          const session = {
            id: sessionData.id,
            userId: sessionData.user_id,
            preferences: sessionData.preferences || {},
            interactions: interactionsData || [],
            topics: new Set(),
            created_at: sessionData.created_at,
            status: sessionData.status || 'active',
            lastInteraction: interactionsData && interactionsData.length > 0 ? 
              interactionsData[interactionsData.length - 1] : null,
            currentTopic: null,
            recentFocus: []
          };
          
          // Extract topics from interactions
          if (interactionsData && interactionsData.length > 0) {
            interactionsData
              .filter(interaction => interaction.type === 'query' && interaction.query)
              .forEach(interaction => {
                const topics = this.extractTopics(interaction);
                topics.forEach(topic => session.topics.add(topic));
              });
              
            if (session.topics.size > 0) {
              session.currentTopic = Array.from(session.topics)[0];
              console.log(`[BACKEND DEBUG] Extracted session topics: ${Array.from(session.topics).join(', ')}`);
            }
          }
          
          // Initialize context memory for the session
          this.contextMemory.set(sessionId, {
            topicChain: [],
            conceptualLinks: new Map(),
            clarificationHistory: [],
            userUnderstanding: new Map(),
            lastExplanation: null,
            lastAnalogy: null
          });
          
          // Extract last explanation and analogy if available
          if (interactionsData && interactionsData.length > 0) {
            const queryInteractions = interactionsData.filter(i => i.type === 'query');
            if (queryInteractions.length > 0) {
              const lastQueryInteraction = queryInteractions[queryInteractions.length - 1];
              
              if (lastQueryInteraction.response) {
                let response;
                if (typeof lastQueryInteraction.response === 'string') {
                  try {
                    response = JSON.parse(lastQueryInteraction.response);
                  } catch (e) {
                    console.warn('[BACKEND DEBUG] Could not parse response JSON:', e);
                    response = { explanation: lastQueryInteraction.response };
                  }
                } else {
                  response = lastQueryInteraction.response;
                }
                
                if (response) {
                  this.contextMemory.get(sessionId).lastExplanation = response.explanation || null;
                  this.contextMemory.get(sessionId).lastAnalogy = response.analogy || null;
                  
                  if (response.explanation) {
                    console.log(`[BACKEND DEBUG] Extracted last explanation: ${response.explanation.substring(0, 50)}...`);
                  }
                  if (response.analogy) {
                    console.log(`[BACKEND DEBUG] Extracted last analogy: ${response.analogy.substring(0, 50)}...`);
                  }
                }
              }
            }
          }
          
          // Store in memory cache
          this.sessions.set(sessionId, session);
          
          console.log(`[BACKEND DEBUG] Successfully restored session ${sessionId} from database`);
          return session;
        }
      } catch (error) {
        console.error(`[BACKEND DEBUG] Exception retrieving session ${sessionId}:`, error);
        // Continue to recreate the session
      }
    } else {
      console.warn(`[BACKEND DEBUG] Supabase client not available, cannot retrieve session ${sessionId} from database`);
    }
    
    // If we get here, we couldn't find the session in the database or there was an error
    // Create a new session with the same ID as a fallback
    console.log(`[BACKEND DEBUG] Creating a new session with ID ${sessionId} as fallback`);
    const fallbackSession = {
      id: sessionId,
      userId: 'unknown',  // Will be set properly in the first interaction
      preferences: {},
      interactions: [],
      topics: new Set(),
      created_at: new Date().toISOString(),
      status: 'active',
      lastInteraction: null,
      currentTopic: null,
      recentFocus: []
    };
    
    // Initialize context memory for the session
    this.contextMemory.set(sessionId, {
      topicChain: [],
      conceptualLinks: new Map(),
      clarificationHistory: [],
      userUnderstanding: new Map(),
      lastExplanation: null,
      lastAnalogy: null
    });
    
    // Store in memory cache
    this.sessions.set(sessionId, fallbackSession);
    
    return fallbackSession;
  }

  /**
   * Add an interaction to a session
   * @param {string} sessionId - The session ID
   * @param {Object} interaction - The interaction data
   */
  async addInteraction(sessionId, interaction) {
    console.log(`[BACKEND DEBUG] Adding interaction for session ${sessionId}, type: ${interaction.type}`);
    
    // Make sure we have a valid session
    let session = await this.getSession(sessionId); // Allow re-assignment for new ID
    if (!session) {
      console.error(`[BACKEND DEBUG] Session ${sessionId} not found, and fallback creation failed.`);
      // Attempt to create a brand new session if even fallback failed or if sessionId was truly null/undefined initially
      if (interaction.userId) {
        console.log(`[BACKEND DEBUG] Attempting to create a fresh session for user ${interaction.userId} as last resort.`);
        session = await this.createSession(interaction.userId, interaction.preferences || {});
        sessionId = session.id; // Update sessionId to the new one
        console.log(`[BACKEND DEBUG] Created new fallback session with ID: ${sessionId}`);
      } else {
        console.error(`[BACKEND DEBUG] Cannot create session: userId is missing in interaction.`);
        throw new Error(`Cannot process interaction: userId is missing and session ${sessionId} not found.`);
      }
    }
    
    const contextMemory = this.contextMemory.get(sessionId);
    if (!contextMemory && session) { // if session was just created, contextMemory might not exist yet for it
        this.contextMemory.set(sessionId, {
            topicChain: [],
            conceptualLinks: new Map(),
            clarificationHistory: [],
            userUnderstanding: new Map(),
            lastExplanation: null,
            lastAnalogy: null
        });
        console.log(`[BACKEND DEBUG] Initialized context memory for newly created session ${sessionId}`);
    } else if (!contextMemory) {
      console.error(`[BACKEND DEBUG] Context memory for session ${sessionId} not found`);
      throw new Error(`Context memory for session ${sessionId} not found`);
    }
    
    // Update userId if it was 'unknown' (this happens with fallback sessions from getSession)
    // Or if the session was just created and needs its userId confirmed from the interaction
    if (session.userId === 'unknown' || !session.userId) {
      if (interaction.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(interaction.userId)) {
        session.userId = interaction.userId;
        console.log(`[BACKEND DEBUG] Updated session ${sessionId} with user ID: ${interaction.userId}`);
      } else {
        console.warn(`[BACKEND DEBUG] interaction.userId ('${interaction.userId}') is invalid or missing for session ${sessionId}. Setting session.userId to null.`);
        session.userId = null; // Use null if interaction.userId is not a valid UUID
      }
    }
    
    // Store the last explanation and analogy for "query" type interactions
    if (interaction.type === 'query' && interaction.response) {
      // Only update explanation if this is not an "another analogy" request
      if (interaction.response.explanation && 
          !interaction.query.toLowerCase().includes('another') &&
          !interaction.query.toLowerCase().includes('one more')) {
        contextMemory.lastExplanation = interaction.response.explanation;
        console.log(`[BACKEND DEBUG] Updated lastExplanation in context memory: ${interaction.response.explanation.substring(0, 50)}...`);
      }
      
      // Always update the last analogy
      if (interaction.response.analogy) {
        contextMemory.lastAnalogy = interaction.response.analogy;
        console.log(`[BACKEND DEBUG] Updated lastAnalogy in context memory: ${interaction.response.analogy.substring(0, 50)}...`);
      }
    }
    
    // Add the interaction with timestamp
    const timestampedInteraction = {
      ...interaction,
      timestamp: new Date().toISOString()
    };
    
    // Initialize arrays if they don't exist
    if (!Array.isArray(session.interactions)) {
      session.interactions = [];
    }
    if (!Array.isArray(contextMemory.clarificationRequests)) {
      contextMemory.clarificationRequests = [];
    }
    if (!Array.isArray(contextMemory.recentFocus)) {
      contextMemory.recentFocus = [];
    }
    
    session.interactions.push(timestampedInteraction);
    session.lastInteraction = timestampedInteraction;
    
    // Extract and store topics
    if (interaction.type === 'query') {
      const topics = this.extractTopics(interaction);
      topics.forEach(topic => session.topics.add(topic));
      if (topics.size > 0) {
        session.currentTopic = Array.from(topics)[0];
        console.log(`[BACKEND DEBUG] Extracted topics: ${Array.from(topics).join(', ')}`);
      }
    }
    
    // Update the session and context memory in memory cache
    this.sessions.set(sessionId, session);
    this.contextMemory.set(sessionId, contextMemory);
    
    // Store in database if supabase is available
    if (this.supabase) {
      try {
        console.log(`[BACKEND DEBUG] Attempting to store in database for session ${sessionId}`);
        
        // First, ensure the session exists in the database
        let sessionExists = false;
        
        try {
          const { data: sessionData, error: sessionError } = await this.supabase
            .from('sessions')
            .select('id')
            .eq('id', sessionId)
            .single();
            
          if (sessionData) {
            sessionExists = true;
            console.log(`[BACKEND DEBUG] Session ${sessionId} found in sessions table`);
          } else {
            console.log(`[BACKEND DEBUG] Session ${sessionId} not found in database. Creating it.`);
          }
        } catch (e) {
          console.error('[BACKEND DEBUG] Error checking for session existence:', e);
        }
        
        // Create session if it doesn't exist
        if (!sessionExists) {
          try {
            // Validate session ID is valid UUID format and update if necessary
            // This logic handles cases where an old non-UUID sessionId might be passed initially
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
              console.error(`[BACKEND DEBUG] Original session ID ('${sessionId}') is not a valid UUID.`);
              const oldSessionId = sessionId;
              const newSessionId = this.generateSessionId(); // Generate a new valid UUID
              console.log(`[BACKEND DEBUG] Generated new UUID session ID: ${newSessionId} to replace ${oldSessionId}`);
              
              // Update the session object's ID
              session.id = newSessionId;
              
              // Transfer session and context memory to the new ID
              this.sessions.set(newSessionId, session);
              this.sessions.delete(oldSessionId);
              
              const oldContext = this.contextMemory.get(oldSessionId);
              if (oldContext) {
                this.contextMemory.set(newSessionId, oldContext);
                this.contextMemory.delete(oldSessionId);
              }
              
              sessionId = newSessionId; // Update sessionId to be used for DB operations
              console.log(`[BACKEND DEBUG] Session and context memory migrated to new UUID: ${sessionId}`);
            }
            
            // Ensure userId is not 'unknown' before inserting
            let dbUserId = session.userId;
            if (dbUserId === 'unknown') {
                console.warn(`[BACKEND DEBUG] userId is 'unknown' before DB insert for session ${sessionId}. Setting to null.`);
                dbUserId = null;
            }

            const { error: sessionCreateError } = await this.supabase
              .from('sessions')
              .insert([{
                id: sessionId, // This is now guaranteed to be a UUID
                user_id: dbUserId, // Use the sanitized dbUserId
                preferences: session.preferences || {},
                status: 'active'
              }]);
              
            if (sessionCreateError) {
              console.error(`[BACKEND DEBUG] Error creating session ${sessionId}:`, sessionCreateError);
            } else {
              console.log(`[BACKEND DEBUG] Created session ${sessionId} in database`);
              sessionExists = true;
            }
          } catch (e) {
            console.error('[BACKEND DEBUG] Exception creating session:', e);
          }
        }
        
        // Now store the interaction in interactions table
        if (sessionExists) {
          try {
            console.log(`[BACKEND DEBUG] Storing interaction in database: ${interaction.type} for session ${sessionId}`);
            
            // Prepare the interaction data
            const interactionData = {
              session_id: sessionId,
              type: interaction.type,
              query: interaction.query || null,
              response: interaction.response || null,
              message_id: interaction.messageId || interaction.id || null,
              feedback_content: interaction.type === 'feedback' ? interaction : null,
              user_id: session.userId
            };
            
            console.log(`[BACKEND DEBUG] Interaction data prepared:`, interactionData);
            
            const { error: interactionError } = await this.supabase
              .from('interactions')
              .insert([interactionData]);
              
            if (interactionError) {
              console.error('[BACKEND DEBUG] Error storing interaction:', interactionError);
            } else {
              console.log(`[BACKEND DEBUG] Successfully stored interaction in database for session ${sessionId}`);
            }
          } catch (e) {
            console.error('[BACKEND DEBUG] Exception storing interaction:', e);
          }
        } else {
          console.error(`[BACKEND DEBUG] Cannot store interaction: Session ${sessionId} not created in database`);
        }
      } catch (err) {
        console.error('[BACKEND DEBUG] Exception in database operations:', err);
        // Continue anyway - we still have the data in memory
      }
    } else {
      console.log(`[BACKEND DEBUG] Supabase not available, storing interaction in memory only for session ${sessionId}`);
    }
    
    // Update context
    await this.updateContext(sessionId, timestampedInteraction);
    
    return session;
  }

  /**
   * Get conversation summary for a session
   * @param {string} sessionId - The session ID
   * @returns {Object} The conversation summary
   */
  getConversationSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    const contextMemory = this.contextMemory.get(sessionId);
    
    if (!session || !contextMemory) {
      return {
        topics: [],
        interactions: [],
        currentTopic: null,
        lastExplanation: null,
        lastAnalogy: null
      };
    }
    
    return {
      topics: Array.from(session.topics),
      interactions: session.interactions.map(interaction => ({
        type: interaction.type,
        query: interaction.query,
        response: interaction.response,
        timestamp: interaction.timestamp
      })),
      currentTopic: session.currentTopic,
      lastExplanation: contextMemory.lastExplanation,
      lastAnalogy: contextMemory.lastAnalogy
    };
  }

  /**
   * Extract topics from an interaction
   * @param {Object} interaction - The interaction data
   * @returns {Set} Set of topics
   */
  extractTopics(interaction) {
    // Simple keyword extraction (can be enhanced with NLP)
    const keywords = interaction.query?.toLowerCase().match(/\b\w+\b/g) || [];
    return new Set(keywords);
  }

  /**
   * Get related topics
   * @param {string} topic - The topic to find related topics for
   * @returns {Array} Array of related topics
   */
  getRelatedTopics(topic) {
    // Simple implementation - can be enhanced with a knowledge graph
    return [];
  }

  /**
   * Generate a unique session ID as a valid UUID
   * @returns {string} A UUID v4 string
   */
  generateSessionId() {
    // Generate a proper UUID v4 that will be compatible with the database
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Update session context based on new interaction
   * @param {string} sessionId - The session ID
   * @param {Object} interaction - New interaction data
   * @returns {Promise<void>}
   */
  async updateContext(sessionId, interaction) {
    const session = this.sessions.get(sessionId);
    const contextMemory = this.contextMemory.get(sessionId);
    
    if (!session || !contextMemory) return;

    // Extract topics from the interaction
    const topics = this.extractTopics(interaction);
    
    // Update session context
    session.topics = new Set([...session.topics, ...topics]);
    
    // Update topic chain
    contextMemory.topicChain.push({
      timestamp: interaction.timestamp,
      topics,
      type: interaction.type
    });
    
    // Keep only last 10 topics in chain
    if (contextMemory.topicChain.length > 10) {
      contextMemory.topicChain.shift();
    }
    
    // Update conceptual links
    this.updateConceptualLinks(sessionId, topics, interaction);
    
    // Track clarification requests
    if (this.isClarificationRequest(interaction)) {
      if (!session.clarificationRequests) {
        session.clarificationRequests = [];
      }
      session.clarificationRequests.push({
        timestamp: interaction.timestamp,
        topic: Array.from(topics)[0],
        resolved: false
      });
      
      contextMemory.clarificationHistory.push({
        timestamp: interaction.timestamp,
        query: interaction.query,
        topics: Array.from(topics)
      });
    }
    
    // Update user understanding
    if (interaction.type === 'feedback') {
      this.updateUnderstandingLevel(sessionId, topics, interaction);
    }
    
    // Initialize recentFocus if it doesn't exist
    if (!session.recentFocus) {
      session.recentFocus = [];
    }
    
    // Update recent focus
    session.recentFocus = this.updateRecentFocus(
      session.recentFocus,
      topics,
      interaction
    );
    
    // Store updates
    this.sessions.set(sessionId, session);
    this.contextMemory.set(sessionId, contextMemory);
    
    // Update global topic graph
    this.updateTopicGraph(topics, interaction);
  }

  /**
   * Update conceptual links between topics
   * @param {string} sessionId - The session ID
   * @param {Set} topics - New topics
   * @param {Object} interaction - Interaction data
   */
  updateConceptualLinks(sessionId, topics, interaction) {
    const contextMemory = this.contextMemory.get(sessionId);
    if (!contextMemory) return;
    
    const topicArray = Array.from(topics);
    
    // Create links between topics mentioned together
    topicArray.forEach((topic, i) => {
      topicArray.slice(i + 1).forEach(otherTopic => {
        const linkKey = `${topic}-${otherTopic}`;
        const existingLink = contextMemory.conceptualLinks.get(linkKey) || {
          count: 0,
          interactions: []
        };
        
        existingLink.count += 1;
        existingLink.interactions.push({
          timestamp: interaction.timestamp,
          type: interaction.type
        });
        
        contextMemory.conceptualLinks.set(linkKey, existingLink);
      });
    });
  }

  /**
   * Update user understanding levels
   * @param {string} sessionId - The session ID
   * @param {Set} topics - Topics to update
   * @param {Object} interaction - Interaction data
   */
  updateUnderstandingLevel(sessionId, topics, interaction) {
    const contextMemory = this.contextMemory.get(sessionId);
    if (!contextMemory || !interaction.rating) return;
    
    topics.forEach(topic => {
      const understanding = contextMemory.userUnderstanding.get(topic) || {
        level: 0,
        interactions: []
      };
      
      // Update understanding level based on feedback
      const adjustment = (interaction.rating - 3) * 0.1; // -0.2 to +0.2
      understanding.level = Math.max(0, Math.min(1, understanding.level + adjustment));
      
      understanding.interactions.push({
        timestamp: interaction.timestamp,
        rating: interaction.rating,
        adjustment
      });
      
      contextMemory.userUnderstanding.set(topic, understanding);
    });
  }

  /**
   * Update recent focus topics
   * @param {Array} currentFocus - Current focus topics
   * @param {Set} newTopics - New topics
   * @param {Object} interaction - Interaction data
   * @returns {Array} - Updated focus topics
   */
  updateRecentFocus(currentFocus = [], newTopics, interaction) {
    // Ensure currentFocus is an array
    const focusUpdate = Array.isArray(currentFocus) ? [...currentFocus] : [];
    
    Array.from(newTopics).forEach(topic => {
      const existingIndex = focusUpdate.findIndex(f => f.topic === topic);
      
      if (existingIndex >= 0) {
        // Update existing focus
        focusUpdate[existingIndex] = {
          topic,
          lastInteraction: interaction.timestamp,
          count: focusUpdate[existingIndex].count + 1
        };
      } else {
        // Add new focus
        focusUpdate.push({
          topic,
          lastInteraction: interaction.timestamp,
          count: 1
        });
      }
    });
    
    // Sort by recency and frequency
    focusUpdate.sort((a, b) => {
      const timeA = new Date(a.lastInteraction).getTime();
      const timeB = new Date(b.lastInteraction).getTime();
      if (timeB - timeA === 0) {
        return b.count - a.count;
      }
      return timeB - timeA;
    });
    
    // Keep only top 5 focus topics
    return focusUpdate.slice(0, 5);
  }

  /**
   * Update global topic graph
   * @param {Set} topics - New topics
   * @param {Object} interaction - Interaction data
   */
  updateTopicGraph(topics, interaction) {
    Array.from(topics).forEach(topic => {
      const topicData = this.topicGraph.get(topic) || {
        frequency: 0,
        connections: new Map(),
        lastInteraction: null
      };
      
      topicData.frequency += 1;
      topicData.lastInteraction = interaction.timestamp;
      
      // Update connections with other topics
      Array.from(topics)
        .filter(t => t !== topic)
        .forEach(connectedTopic => {
          const connectionStrength = topicData.connections.get(connectedTopic) || 0;
          topicData.connections.set(connectedTopic, connectionStrength + 1);
        });
      
      this.topicGraph.set(topic, topicData);
    });
  }

  /**
   * Check if an interaction is a clarification request
   * @param {Object} interaction - Interaction to check
   * @returns {boolean} - Whether the interaction is a clarification request
   */
  isClarificationRequest(interaction) {
    if (!interaction.query) return false;
    
    const clarificationPatterns = [
      'what do you mean',
      'can you explain',
      'i don\'t understand',
      'could you clarify',
      'what is the difference',
      'how does this relate'
    ];
    
    return clarificationPatterns.some(pattern =>
      interaction.query.toLowerCase().includes(pattern)
    );
  }

  /**
   * Check if a word is a stop word
   * @param {string} word - Word to check
   * @returns {boolean} - Whether the word is a stop word
   */
  isStopWord(word) {
    const stopWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have',
      'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you',
      'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they',
      'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one',
      'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out',
      'if', 'about', 'who', 'get', 'which', 'go', 'me'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }
}

export default SessionManager;