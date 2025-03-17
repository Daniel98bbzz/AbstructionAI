class SessionManager {
  constructor() {
    // Initialize session storage
    this.sessions = new Map();
    this.contextMemory = new Map();
    this.topicGraph = new Map();
  }

  /**
   * Create a new session
   * @param {string} userId - The user ID
   * @param {Object} preferences - User preferences for this session
   * @returns {Object} The created session
   */
  async createSession(userId, preferences = {}) {
    const sessionId = this.generateSessionId();
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
    return session;
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - The session ID
   * @returns {Object} The session data
   */
  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return session;
  }

  /**
   * Add an interaction to a session
   * @param {string} sessionId - The session ID
   * @param {Object} interaction - The interaction data
   */
  async addInteraction(sessionId, interaction) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const contextMemory = this.contextMemory.get(sessionId);
    if (!contextMemory) {
      throw new Error(`Context memory for session ${sessionId} not found`);
    }
    
    // Store the last explanation and analogy for "query" type interactions
    if (interaction.type === 'query' && interaction.response) {
      // Only update explanation if this is not an "another analogy" request
      if (interaction.response.explanation && 
          !interaction.query.toLowerCase().includes('another') &&
          !interaction.query.toLowerCase().includes('one more')) {
        contextMemory.lastExplanation = interaction.response.explanation;
      }
      
      // Always update the last analogy
      if (interaction.response.analogy) {
        contextMemory.lastAnalogy = interaction.response.analogy;
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
      }
    }
    
    // Update the session and context memory
    this.sessions.set(sessionId, session);
    this.contextMemory.set(sessionId, contextMemory);
    
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
   * Generate a unique session ID
   * @returns {string} A unique session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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