import userProfileManager from './UserProfileManager.js';

class PromptManager {
  constructor() {
    // Default system prompt template - now conversational
    this.systemPromptTemplate = `You are an AI assistant. Your goal is to engage in a natural, free-flowing, and in-depth conversation.

When responding to queries:
1. Always consider the full conversation history and any previous interactions to ensure your responses are relevant and build upon what has already been discussed.
2. Strive to provide clear, exceptionally comprehensive, and thorough explanations. Delve deep into the subject matter.
3. Adapt your tone and technical depth naturally based on the user's messages and feedback.
// 4. Use relatable analogies that connect to previously discussed concepts (Commented out to reduce forced analogies)
5. Feel free to elaborate, explore tangents if they are relevant, and provide rich, detailed answers. The user wants detailed and expansive responses.
6. **Formatting:** Please format your entire response using Markdown. Utilize headings (e.g., # Main Title, ## Subtitle), bullet points (- item), numbered lists (1. item), bold text (**bold text**), italic text (*italic text*), and code blocks (using triple backticks) when appropriate to structure the information clearly and improve readability. Ensure the markdown is well-formed.`;
  }

  /**
   * Generate a prompt based on the user's query and session context
   * @param {string} query - The user's query
   * @param {string} userId - The user's ID
   * @param {string} sessionId - The session ID
   * @returns {Object} - System and user prompts
   */
  async generatePrompt(query, userId, sessionId) {
    try {
      // Directly use the simplified systemPromptTemplate that was set in the constructor
      const systemPromptContent = this.systemPromptTemplate;

      return {
        messages: [
          { role: "system", content: systemPromptContent },
          { role: "user", content: query } // The query is passed as an argument
        ]
      };
    } catch (error) {
      console.error('Error generating prompt in PromptManager:', error);
      // Fallback to a very basic prompt in case of unexpected errors
      return {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: query }
        ]
      };
    }
  }

  /**
   * Process the conversation history to create relevant context
   * @param {Array} interactions - Previous interactions
   * @returns {Object} - Processed conversation history
   */
  processConversationHistory(interactions) {
    const relevantInteractions = interactions
      .filter(interaction => interaction.type === 'query' || interaction.type === 'feedback')
      .slice(-5) // Keep last 5 interactions for context
      .map(interaction => ({
        type: interaction.type,
        query: interaction.query,
        summary: interaction.type === 'query' ? this.summarizeResponse(interaction.response) : null,
        feedback: interaction.type === 'feedback' ? {
          rating: interaction.rating,
          comments: interaction.comments
        } : null,
        timestamp: interaction.timestamp
      }));

    return {
      interactions: relevantInteractions,
      topics: this.extractTopics(relevantInteractions),
      conceptLinks: this.findConceptualLinks(relevantInteractions)
    };
  }

  /**
   * Analyze feedback patterns to improve responses
   * @param {Array} interactions - Previous interactions
   * @returns {Object} - Analyzed feedback patterns
   */
  analyzeFeedbackPatterns(interactions) {
    const feedbackInteractions = interactions.filter(i => i.type === 'feedback');
    
    return {
      preferredStyle: this.determinePreferredStyle(feedbackInteractions),
      commonIssues: this.identifyCommonIssues(feedbackInteractions),
      successfulApproaches: this.identifySuccessfulApproaches(feedbackInteractions)
    };
  }

  /**
   * Create a contextual prompt based on the current query and history
   * @param {string} query - The current query
   * @param {Object} history - Processed conversation history
   * @returns {string} - Contextualized prompt
   */
  createContextualPrompt(query, history) {
    const contextualNotes = history.interactions.length > 0 
      ? `\nContext from our conversation:\n${this.formatContextNotes(history)}`
      : '';

    return `${query}${contextualNotes}`;
  }

  /**
   * Process the response from the AI
   * @param {string} responseText - Raw response from the AI
   * @returns {Object} - Processed response
   */
  processResponse(responseText) {
    // Always treat responses as conversational - no JSON parsing
    return {
      explanation: responseText.trim(),
      analogy: '',
      contextual_notes: '',
      resources: []
    };
  }

  /**
   * Summarize a response for context
   * @param {Object} response - Response to summarize
   * @returns {string} - Summary of the response
   */
  summarizeResponse(response) {
    if (!response) return '';
    return `${response.explanation.substring(0, 100)}...`;
  }

  /**
   * Extract main topics from interactions
   * @param {Array} interactions - Interactions to analyze
   * @returns {Array} - Extracted topics
   */
  extractTopics(interactions) {
    const topics = new Set();
    interactions.forEach(interaction => {
      if (interaction.query) {
        // Extract key topics using simple keyword extraction
        const words = interaction.query.toLowerCase().split(/\W+/);
        words.forEach(word => {
          if (word.length > 3 && !this.isStopWord(word)) {
            topics.add(word);
          }
        });
      }
    });
    return Array.from(topics);
  }

  /**
   * Find conceptual links between interactions
   * @param {Array} interactions - Interactions to analyze
   * @returns {Array} - Conceptual links found
   */
  findConceptualLinks(interactions) {
    const links = [];
    const topics = this.extractTopics(interactions);
    
    // Find related topics based on co-occurrence
    topics.forEach((topic, i) => {
      topics.slice(i + 1).forEach(otherTopic => {
        const coOccurrence = interactions.filter(interaction =>
          interaction.query &&
          interaction.query.toLowerCase().includes(topic) &&
          interaction.query.toLowerCase().includes(otherTopic)
        ).length;
        
        if (coOccurrence > 0) {
          links.push({ topic1: topic, topic2: otherTopic, strength: coOccurrence });
        }
      });
    });
    
    return links;
  }

  /**
   * Format context notes for the prompt
   * @param {Object} history - Conversation history
   * @returns {string} - Formatted context notes
   */
  formatContextNotes(history) {
    const notes = [];
    
    if (history.interactions.length > 0) {
      notes.push('Previous questions and responses:');
      history.interactions.forEach(interaction => {
        if (interaction.type === 'query') {
          notes.push(`Q: ${interaction.query}`);
          notes.push(`A: ${interaction.summary}`);
        }
      });
    }
    
    if (history.topics.length > 0) {
      notes.push('\nRelated topics discussed: ' + history.topics.join(', '));
    }
    
    if (history.conceptLinks.length > 0) {
      notes.push('\nConceptual connections found:');
      history.conceptLinks.forEach(link => {
        notes.push(`- ${link.topic1} relates to ${link.topic2}`);
      });
    }
    
    return notes.join('\n');
  }

  /**
   * Determine preferred explanation style from feedback
   * @param {Array} feedbackInteractions - Feedback interactions
   * @returns {Object} - Preferred style patterns
   */
  determinePreferredStyle(feedbackInteractions) {
    const highRatedResponses = feedbackInteractions.filter(f => f.rating >= 4);
    return {
      prefersTechnical: this.analyzePreference(highRatedResponses, 'technical'),
      prefersAnalogies: this.analyzePreference(highRatedResponses, 'analogy'),
      prefersExamples: this.analyzePreference(highRatedResponses, 'example')
    };
  }

  /**
   * Identify common issues from negative feedback
   * @param {Array} feedbackInteractions - Feedback interactions
   * @returns {Array} - Common issues identified
   */
  identifyCommonIssues(feedbackInteractions) {
    return feedbackInteractions
      .filter(f => f.comments && this.isNegativeFeedback(f.comments))
      .map(f => ({
        sentiment: 'negative',
        issue: this.categorizeIssue(f.comments)
      }));
  }

  /**
   * Identify successful approaches from positive feedback
   * @param {Array} feedbackInteractions - Feedback interactions
   * @returns {Array} - Successful approaches identified
   */
  identifySuccessfulApproaches(feedbackInteractions) {
    return feedbackInteractions
      .filter(f => f.comments && this.isPositiveFeedback(f.comments))
      .map(f => ({
        sentiment: 'positive',
        approach: this.categorizeSuccess(f.comments)
      }));
  }

  /**
   * Check if feedback comments indicate negative sentiment
   * @param {string} comments - Feedback comments
   * @returns {boolean} - Whether feedback is negative
   */
  isNegativeFeedback(comments) {
    const negativeWords = ['bad', 'poor', 'confusing', 'unclear', 'useless', 'terrible', 'hate', 'wrong', 'difficult', 'disappointing'];
    const lowerComments = comments.toLowerCase();
    return negativeWords.some(word => lowerComments.includes(word));
  }

  /**
   * Check if feedback comments indicate positive sentiment
   * @param {string} comments - Feedback comments
   * @returns {boolean} - Whether feedback is positive
   */
  isPositiveFeedback(comments) {
    const positiveWords = ['good', 'great', 'excellent', 'helpful', 'clear', 'useful', 'perfect', 'love', 'amazing', 'wonderful'];
    const lowerComments = comments.toLowerCase();
    return positiveWords.some(word => lowerComments.includes(word));
  }

  /**
   * Check if a word is a stop word
   * @param {string} word - Word to check
   * @returns {boolean} - Whether the word is a stop word
   */
  isStopWord(word) {
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);
    return stopWords.has(word);
  }

  /**
   * Analyze preference in feedback
   * @param {Array} interactions - Feedback interactions
   * @param {string} aspect - Aspect to analyze
   * @returns {boolean} - Whether the aspect is preferred
   */
  analyzePreference(interactions, aspect) {
    const keywords = {
      technical: ['technical', 'detailed', 'in-depth', 'complex'],
      analogy: ['analogy', 'comparison', 'like', 'similar'],
      example: ['example', 'practical', 'real-world', 'application']
    };
    
    const relevantFeedback = interactions.filter(f => 
      f.comments && keywords[aspect].some(keyword => 
        f.comments.toLowerCase().includes(keyword)
      )
    );
    
    return relevantFeedback.length > 0;
  }

  /**
   * Categorize feedback issues
   * @param {string} comments - Feedback comments
   * @returns {string} - Categorized issue
   */
  categorizeIssue(comments) {
    const categories = {
      'too_technical': ['too technical', 'too complex', 'hard to understand'],
      'too_simple': ['too simple', 'too basic', 'need more depth'],
      'unclear': ['unclear', 'confusing', 'vague'],
      'irrelevant': ['irrelevant', 'not related', 'off topic']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => comments.toLowerCase().includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  }

  /**
   * Categorize successful approaches
   * @param {string} comments - Feedback comments
   * @returns {string} - Categorized success
   */
  categorizeSuccess(comments) {
    const categories = {
      'clear_explanation': ['clear', 'well explained', 'easy to understand'],
      'good_examples': ['good examples', 'helpful examples', 'practical'],
      'good_analogy': ['good analogy', 'helpful comparison', 'great metaphor'],
      'right_depth': ['right level', 'perfect depth', 'appropriate detail']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => comments.toLowerCase().includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  }

  async generateRegenerationPrompt(query, userId, feedback) {
    try {
      // Get user profile data
      const profile = await userProfileManager.getProfile(userId);
      const learningPreferences = await userProfileManager.getLearningPreferences(userId);
      const interests = await userProfileManager.getInterests(userId);
      const demographics = await userProfileManager.getDemographics(userId);

      // Build the system prompt with user preferences and feedback
      const systemPrompt = `You are a knowledgeable AI tutor specialized in explaining complex concepts clearly and thoroughly.

User Profile:
- Occupation: ${profile.occupation}
- Education Level: ${profile.education_level}
- Age: ${profile.age}
- Learning Style: ${profile.learning_style}
- Technical Depth Preference: ${profile.technical_depth}/100
- Main Learning Goal: ${profile.main_learning_goal}

User Interests: ${interests.join(', ')}

${profile.preferred_analogy_domains?.length > 0 ? 
  `Preferred Analogy Domains: ${profile.preferred_analogy_domains.join(', ')}` : 
  `IMPORTANT: User has no specified analogy domains, so use their interests for analogies: ${interests.join(', ')}`}

Feedback on Previous Response:
${feedback.specificInstructions ? feedback.specificInstructions.map(instr => `- ${instr}`).join('\n') : ''}

${feedback.analogyTopic ? `\nCRITICAL INSTRUCTION: You MUST provide an analogy specifically related to ${feedback.analogyTopic}.` : ''}

${feedback.analogyHelpful === 'no' || feedback.analogyHelpful === 'partially' ? 
`IMPORTANT: Provide a more relatable and clearer analogy.` : ''}

${feedback.explanationClear === 'no' || feedback.explanationClear === 'partially' ? 
`IMPORTANT: The previous explanation was not clear enough. Make it more straightforward and easier to understand.` : ''}

${feedback.explanationDetail === 'more_detailed' ? 
`IMPORTANT: Provide a more detailed and comprehensive explanation with deeper technical information.` : ''}

${feedback.explanationDetail === 'simpler' ? 
`IMPORTANT: Simplify the explanation significantly. Use easier language and less technical jargon.` : ''}

${feedback.comments ? `\nUser comments: "${feedback.comments}"` : ''}

IMPORTANT: Respond naturally and conversationally to the user's query. You should adapt your response style based on the type of query:

- For FOLLOW-UP QUESTIONS, CLARIFICATIONS, or SIMPLE QUERIES, respond in a natural conversational style.

Always adapt to the user's preferred communication style. If they ask for a brief answer, be concise. If they want detailed information, be thorough.

Use proper paragraph breaks to organize your response and make it aesthetically pleasing and easy to read. Use whitespace effectively to separate ideas.

CRITICAL - AVOID REPETITION: 
1. Do NOT repeat yourself in your responses
2. Do NOT start sentences with the same phrases (like "I'm sorry" or "Let me explain")
3. NEVER repeat the same sentence or very similar sentences twice
4. Before submitting your response, check it for duplicate sentences and remove them
5. Avoid starting responses with apologies or standard phrases
6. If you catch yourself writing the same phrase twice, delete one instance

IMPORTANT: Always maintain consistency in your analogies and examples throughout a conversation. When the user asks follow-up questions or says they don't understand, continue using the same analogy domains. Only change your analogy domain if the user explicitly requests a different one.

CRITICAL: Do not repeat sentences in your response. Check your answer for any duplicated sentences or paragraphs and remove them.

Please tailor your response based on these preferences and feedback:
1. Adjust technical depth based on education level and technical depth preference
2. ${profile.preferred_analogy_domains?.length > 0 || feedback.analogyTopic ? 
     `Use analogies from ${feedback.analogyTopic ? `the requested domain (${feedback.analogyTopic})` : `preferred domains (${profile.preferred_analogy_domains.join(', ')})`}` : 
     `Use analogies specifically related to user interests (${interests.join(', ')})`}
3. Format explanations according to learning style (${profile.learning_style})
4. Include examples relevant to user's interests
5. Focus on practical applications aligned with main learning goal
6. Address all feedback points specifically

Above all, prioritize clarity and helpfulness in your responses, adapting to the user's needs in a natural conversational flow.`;

      return {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ]
      };
    } catch (error) {
      console.error('Error generating regeneration prompt:', error);
      throw error;
    }
  }
}

export default new PromptManager();