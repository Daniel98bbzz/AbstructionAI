import userProfileManager from './UserProfileManager.js';
import { supabase } from '../lib/supabaseClient.js';
import CrowdWisdomManager from './CrowdWisdomManager.js';

class PromptManager {
  constructor(openaiClient = null) {
    // Default system prompt template - now conversational
    this.systemPromptTemplate = `You are an AI assistant. Your goal is to engage in a natural, free-flowing, and in-depth conversation.

When responding to queries:
1. Always consider the full conversation history and any previous interactions to ensure your responses are relevant and build upon what has already been discussed.
2. Strive to provide clear, exceptionally comprehensive, and thorough explanations. Delve deep into the subject matter.
3. Adapt your tone and technical depth naturally based on the user's messages and feedback.
// 4. Use relatable analogies that connect to previously discussed concepts (Commented out to reduce forced analogies)
5. Feel free to elaborate, explore tangents if they are relevant, and provide rich, detailed answers. The user wants detailed and expansive responses.
6. **Formatting:** Please format your entire response using Markdown. Utilize headings (e.g., # Main Title, ## Subtitle), bullet points (- item), numbered lists (1. item), bold text (**bold text**), italic text (*italic text*), and code blocks (using triple backticks) when appropriate to structure the information clearly and improve readability. Ensure the markdown is well-formed.`;

    // Initialize Crowd Wisdom Manager if OpenAI client is provided
    this.crowdWisdomManager = openaiClient ? new CrowdWisdomManager(openaiClient) : null;
    this.crowdWisdomEnabled = this.crowdWisdomManager !== null;
  }

  /**
   * Generate a prompt based on the user's query and session context
   * @param {string} query - The user's query
   * @param {string} userId - The user's ID
   * @param {string} sessionId - The session ID
   * @returns {Object} - System and user prompts with crowd wisdom enhancement
   */
  async generatePrompt(query, userId, sessionId) {
    try {
      // Start with the base system prompt
      let systemPromptContent = this.systemPromptTemplate;
      let crowdWisdomData = null;

      // Integrate Crowd Wisdom if enabled
      if (this.crowdWisdomEnabled && this.crowdWisdomManager) {
        try {
          console.log('[PromptManager] Processing query through crowd wisdom system');
          
          // Process query through crowd wisdom system
          crowdWisdomData = await this.crowdWisdomManager.processQuery(
            query,
            sessionId,
            userId
          );

          if (crowdWisdomData && crowdWisdomData.promptEnhancement) {
            // Append crowd wisdom enhancement to system prompt
            systemPromptContent += `\n\n--- Crowd Wisdom Enhancement ---\n${crowdWisdomData.promptEnhancement}`;
            
            console.log('[PromptManager] Crowd wisdom enhancement applied', {
              clusterId: crowdWisdomData.clusterId,
              similarity: crowdWisdomData.similarity,
              isNewCluster: crowdWisdomData.isNewCluster,
              enhancementLength: crowdWisdomData.promptEnhancement.length,
              sessionId,
              userId
            });
          } else {
            console.log('[PromptManager] No crowd wisdom enhancement available', {
              crowdWisdomData: crowdWisdomData ? 'partial data' : 'null',
              sessionId,
              userId
            });
          }
        } catch (crowdWisdomError) {
          console.error('[PromptManager] Crowd wisdom processing failed, continuing without enhancement:', crowdWisdomError);
          // Continue with base prompt if crowd wisdom fails
        }
      }

      const result = {
        messages: [
          { role: "system", content: systemPromptContent },
          { role: "user", content: query }
        ]
      };

      // Include crowd wisdom metadata for tracking
      if (crowdWisdomData) {
        result.crowdWisdomData = {
          clusterId: crowdWisdomData.clusterId,
          assignmentId: crowdWisdomData.assignmentId,
          similarity: crowdWisdomData.similarity,
          isNewCluster: crowdWisdomData.isNewCluster,
          hasEnhancement: Boolean(crowdWisdomData.promptEnhancement),
          processingTimeMs: crowdWisdomData.processingTimeMs
        };
      }

      return result;

    } catch (error) {
      console.error('Error generating prompt in PromptManager:', error);
      
      // Fallback to a very basic prompt in case of unexpected errors
      return {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: query }
        ],
        error: error.message
      };
    }
  }

  /**
   * Process feedback for crowd wisdom learning
   * @param {string} assignmentId - Query assignment ID from crowd wisdom
   * @param {string} feedbackText - User feedback text
   * @param {string} responseText - AI response that was given
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Feedback processing result
   */
  async processFeedback(assignmentId, feedbackText, responseText, sessionId, userId) {
    try {
      if (!this.crowdWisdomEnabled || !this.crowdWisdomManager) {
        console.log('[PromptManager] Crowd wisdom not enabled, skipping feedback processing');
        return { processed: false, reason: 'crowd_wisdom_disabled' };
      }

      if (!assignmentId) {
        console.log('[PromptManager] No assignment ID provided, skipping crowd wisdom feedback processing');
        return { processed: false, reason: 'no_assignment_id' };
      }

      console.log('[PromptManager] Processing feedback through crowd wisdom system', {
        assignmentId,
        feedbackLength: feedbackText?.length || 0,
        responseLength: responseText?.length || 0,
        sessionId,
        userId
      });

      const result = await this.crowdWisdomManager.processFeedback(
        assignmentId,
        feedbackText,
        responseText,
        sessionId,
        userId
      );

      console.log('[PromptManager] Crowd wisdom feedback processing completed', {
        isPositive: result.feedbackAnalysis?.isPositive,
        confidence: result.feedbackAnalysis?.confidence,
        learningTriggered: result.learningResult !== null,
        assignmentId,
        sessionId,
        userId
      });

      return {
        processed: true,
        result
      };

    } catch (error) {
      console.error('[PromptManager] Error processing feedback through crowd wisdom:', error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  /**
   * Get crowd wisdom system statistics
   * @param {string} timeframe - Timeframe for statistics
   * @returns {Promise<Object>} - System statistics
   */
  async getCrowdWisdomStats(timeframe = '24 hours') {
    try {
      if (!this.crowdWisdomEnabled || !this.crowdWisdomManager) {
        return { available: false, reason: 'crowd_wisdom_disabled' };
      }

      const stats = await this.crowdWisdomManager.getSystemStats(timeframe);
      
      return {
        available: true,
        stats,
        timeframe
      };

    } catch (error) {
      console.error('[PromptManager] Error getting crowd wisdom statistics:', error);
      return {
        available: false,
        error: error.message
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
      .filter(f => f.rating <= 3 && f.comments)
      .map(f => ({
        rating: f.rating,
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
      .filter(f => f.rating >= 4 && f.comments)
      .map(f => ({
        rating: f.rating,
        approach: this.categorizeSuccess(f.comments)
      }));
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

${feedback.rating <= 3 ? 
`The user rated the previous response as ${feedback.rating}/5, indicating it needs significant improvement.` : ''}

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

  /**
   * Get similar topics based on usage patterns and semantic similarity
   * @param {Object} options - Configuration options
   * @param {number} options.similarityThreshold - Minimum similarity score (default: 0.7)
   * @param {number} options.minUsageCount - Minimum usage count to consider (default: 2)
   * @returns {Promise<Array>} - Array of similar topic pairs with similarity scores
   */
  async getSimilarTopics(options = {}) {
    const { similarityThreshold = 0.7, minUsageCount = 2 } = options;

    try {
      console.log('[Topic Curation] Analyzing topic similarities...');

      // Get all active topics with sufficient usage
      const { data: topics, error } = await supabase
        .from('topics')
        .select('id, name, description, usage_count')
        .eq('is_active', true)
        .gte('usage_count', minUsageCount)
        .order('usage_count', { ascending: false });

      if (error) throw error;

      if (!topics || topics.length < 2) {
        return [];
      }

      console.log(`[Topic Curation] Analyzing ${topics.length} topics for similarities`);

      // Calculate similarities between all topic pairs
      const similarPairs = [];

      for (let i = 0; i < topics.length; i++) {
        for (let j = i + 1; j < topics.length; j++) {
          const topic1 = topics[i];
          const topic2 = topics[j];

          // Calculate multiple similarity metrics
          const namesSimilarity = this.calculateNameSimilarity(topic1.name, topic2.name);
          const descriptionsSimilarity = this.calculateDescriptionSimilarity(
            topic1.description, 
            topic2.description
          );
          const usagePatternSimilarity = await this.calculateUsagePatternSimilarity(
            topic1.name, 
            topic2.name
          );

          // Weighted average of different similarity metrics
          const overallSimilarity = (
            namesSimilarity * 0.4 +
            descriptionsSimilarity * 0.4 +
            usagePatternSimilarity * 0.2
          );

          if (overallSimilarity >= similarityThreshold) {
            similarPairs.push({
              topic1: {
                id: topic1.id,
                name: topic1.name,
                description: topic1.description,
                usage_count: topic1.usage_count
              },
              topic2: {
                id: topic2.id,
                name: topic2.name,
                description: topic2.description,
                usage_count: topic2.usage_count
              },
              similarityScore: overallSimilarity,
              similarities: {
                names: namesSimilarity,
                descriptions: descriptionsSimilarity,
                usagePatterns: usagePatternSimilarity
              },
              mergeRecommendation: this.generateMergeRecommendation(topic1, topic2, overallSimilarity)
            });
          }
        }
      }

      // Sort by similarity score (highest first)
      similarPairs.sort((a, b) => b.similarityScore - a.similarityScore);

      console.log(`[Topic Curation] Found ${similarPairs.length} similar topic pairs`);
      return similarPairs;

    } catch (error) {
      console.error('[Topic Curation] Error finding similar topics:', error);
      throw error;
    }
  }

  /**
   * Suggest topic merge operations
   * @param {string} topic1Name - First topic name
   * @param {string} topic2Name - Second topic name
   * @param {Object} options - Merge options
   * @returns {Promise<Object>} - Merge suggestion with details
   */
  async suggestTopicMerge(topic1Name, topic2Name, options = {}) {
    try {
      console.log(`[Topic Merge] Analyzing merge for: ${topic1Name} + ${topic2Name}`);

      // Get topic details
      const { data: topics, error } = await supabase
        .from('topics')
        .select('*')
        .in('name', [topic1Name, topic2Name])
        .eq('is_active', true);

      if (error) throw error;

      if (!topics || topics.length !== 2) {
        throw new Error('Both topics must exist and be active');
      }

      const [topic1, topic2] = topics;

      // Calculate detailed merge analysis
      const mergeAnalysis = await this.analyzeMergeCompatibility(topic1, topic2);

      // Generate merge suggestions
      const suggestions = {
        canMerge: mergeAnalysis.compatibility > 0.6,
        compatibility: mergeAnalysis.compatibility,
        suggestedName: this.generateMergedTopicName(topic1, topic2),
        suggestedDescription: this.generateMergedTopicDescription(topic1, topic2),
        mergeStrategy: this.determineMergeStrategy(topic1, topic2),
        impactAnalysis: {
          totalUsage: topic1.usage_count + topic2.usage_count,
          affectedSessions: await this.getAffectedSessionsCount([topic1Name, topic2Name]),
          dataIntegrityRisk: mergeAnalysis.dataIntegrityRisk,
          userImpact: mergeAnalysis.userImpact
        },
        recommendations: mergeAnalysis.recommendations,
        mergeSteps: this.generateMergeSteps(topic1, topic2)
      };

      console.log(`[Topic Merge] Merge compatibility: ${mergeAnalysis.compatibility.toFixed(2)}`);
      return suggestions;

    } catch (error) {
      console.error(`[Topic Merge] Error analyzing merge for ${topic1Name} + ${topic2Name}:`, error);
      throw error;
    }
  }

  /**
   * Suggest topic split operations for overly broad topics
   * @param {string} topicName - Topic name to analyze for splitting
   * @param {Object} options - Split options
   * @param {number} options.maxSuggestedSplits - Maximum number of suggested splits (default: 4)
   * @returns {Promise<Object>} - Split suggestions with details
   */
  async suggestTopicSplit(topicName, options = {}) {
    const { maxSuggestedSplits = 4 } = options;

    try {
      console.log(`[Topic Split] Analyzing split opportunities for: ${topicName}`);

      // Get topic details
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('name', topicName)
        .eq('is_active', true)
        .single();

      if (topicError) throw topicError;

      // Analyze if topic is broad enough to split
      const splitAnalysis = await this.analyzeSplitOpportunities(topicData);

      if (!splitAnalysis.shouldSplit) {
        return {
          shouldSplit: false,
          reason: splitAnalysis.reason,
          currentMetrics: splitAnalysis.metrics
        };
      }

      // Get session data to analyze usage patterns
      const sessionPatterns = await this.getTopicSessionPatterns(topicName);

      // Generate split suggestions based on patterns
      const splitSuggestions = this.generateSplitSuggestions(
        topicData, 
        sessionPatterns, 
        maxSuggestedSplits
      );

      const suggestions = {
        shouldSplit: true,
        splitScore: splitAnalysis.splitScore,
        originalTopic: {
          name: topicData.name,
          description: topicData.description,
          usage_count: topicData.usage_count
        },
        suggestedSplits: splitSuggestions,
        impactAnalysis: {
          totalAffectedSessions: sessionPatterns.totalSessions,
          expectedImprovement: splitAnalysis.expectedImprovement,
          implementationComplexity: splitAnalysis.complexity
        },
        splitStrategy: this.determineSplitStrategy(topicData, sessionPatterns),
        implementationSteps: this.generateSplitSteps(topicData, splitSuggestions)
      };

      console.log(`[Topic Split] Generated ${splitSuggestions.length} split suggestions`);
      return suggestions;

    } catch (error) {
      console.error(`[Topic Split] Error analyzing split for ${topicName}:`, error);
      throw error;
    }
  }

  // Helper methods for topic curation

  /**
   * Calculate similarity between topic names
   */
  calculateNameSimilarity(name1, name2) {
    const words1 = name1.toLowerCase().split(/[_\s]+/);
    const words2 = name2.toLowerCase().split(/[_\s]+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }

  /**
   * Calculate similarity between topic descriptions
   */
  calculateDescriptionSimilarity(desc1, desc2) {
    if (!desc1 || !desc2) return 0;
    
    const words1 = this.extractKeywords(desc1);
    const words2 = this.extractKeywords(desc2);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Calculate usage pattern similarity between topics
   */
  async calculateUsagePatternSimilarity(topic1, topic2) {
    try {
      // Get users who used both topics
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('user_id, secret_topic')
        .in('secret_topic', [topic1, topic2])
        .not('user_id', 'is', null);

      if (error || !sessions) return 0;

      // Group by user
      const userTopics = {};
      sessions.forEach(session => {
        if (!userTopics[session.user_id]) {
          userTopics[session.user_id] = new Set();
        }
        userTopics[session.user_id].add(session.secret_topic);
      });

      // Count users who used both topics
      const usersWithBoth = Object.values(userTopics)
        .filter(topicSet => topicSet.has(topic1) && topicSet.has(topic2))
        .length;

      const totalUsers = Object.keys(userTopics).length;
      
      return totalUsers > 0 ? usersWithBoth / totalUsers : 0;

    } catch (error) {
      console.warn('Error calculating usage pattern similarity:', error);
      return 0;
    }
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
  }

  /**
   * Generate merge recommendation based on topics and similarity
   */
  generateMergeRecommendation(topic1, topic2, similarity) {
    const higherUsage = topic1.usage_count > topic2.usage_count ? topic1 : topic2;
    const lowerUsage = topic1.usage_count > topic2.usage_count ? topic2 : topic1;

    if (similarity > 0.9) {
      return {
        confidence: 'high',
        recommendation: `Strong candidate for merge - topics are highly similar`,
        suggestedAction: `Merge '${lowerUsage.name}' into '${higherUsage.name}'`,
        priority: 'high'
      };
    } else if (similarity > 0.8) {
      return {
        confidence: 'medium',
        recommendation: `Good candidate for merge - consider consolidating`,
        suggestedAction: `Review and potentially merge topics`,
        priority: 'medium'
      };
    } else {
      return {
        confidence: 'low',
        recommendation: `Moderate similarity - review manually`,
        suggestedAction: `Manual review recommended`,
        priority: 'low'
      };
    }
  }

  /**
   * Analyze merge compatibility between two topics
   */
  async analyzeMergeCompatibility(topic1, topic2) {
    const nameCompatibility = this.calculateNameSimilarity(topic1.name, topic2.name);
    const descriptionCompatibility = this.calculateDescriptionSimilarity(
      topic1.description, 
      topic2.description
    );
    
    // Calculate usage overlap
    const usageOverlap = await this.calculateUsagePatternSimilarity(topic1.name, topic2.name);
    
    const compatibility = (nameCompatibility + descriptionCompatibility + usageOverlap) / 3;
    
    return {
      compatibility,
      dataIntegrityRisk: compatibility < 0.7 ? 'high' : 'low',
      userImpact: this.assessUserImpact(topic1, topic2),
      recommendations: this.generateMergeRecommendations(topic1, topic2, compatibility)
    };
  }

  /**
   * Generate merged topic name
   */
  generateMergedTopicName(topic1, topic2) {
    // Use the topic with higher usage as base
    const primary = topic1.usage_count > topic2.usage_count ? topic1 : topic2;
    const secondary = topic1.usage_count > topic2.usage_count ? topic2 : topic1;
    
    // If names are very similar, use the primary name
    if (this.calculateNameSimilarity(topic1.name, topic2.name) > 0.8) {
      return primary.name;
    }
    
    // Otherwise, create a combined name
    const primaryWords = primary.name.split(/[_\s]+/);
    const secondaryWords = secondary.name.split(/[_\s]+/);
    const uniqueWords = [...new Set([...primaryWords, ...secondaryWords])];
    
    return uniqueWords.join('_');
  }

  /**
   * Generate merged topic description
   */
  generateMergedTopicDescription(topic1, topic2) {
    const desc1 = topic1.description || '';
    const desc2 = topic2.description || '';
    
    if (!desc1 && !desc2) {
      return `Merged topic combining ${topic1.name} and ${topic2.name}`;
    }
    
    if (!desc1) return desc2;
    if (!desc2) return desc1;
    
    // Combine descriptions intelligently
    return `${desc1} This topic also encompasses ${desc2.toLowerCase()}`;
  }

  /**
   * Determine merge strategy
   */
  determineMergeStrategy(topic1, topic2) {
    const usageDifference = Math.abs(topic1.usage_count - topic2.usage_count);
    const totalUsage = topic1.usage_count + topic2.usage_count;
    
    if (usageDifference / totalUsage > 0.7) {
      return 'absorb_into_dominant';
    } else {
      return 'create_new_merged';
    }
  }

  /**
   * Get count of sessions affected by topic changes
   */
  async getAffectedSessionsCount(topicNames) {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id', { count: 'exact' })
        .in('secret_topic', topicNames);
      
      return error ? 0 : sessions.count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate merge implementation steps
   */
  generateMergeSteps(topic1, topic2) {
    const primary = topic1.usage_count > topic2.usage_count ? topic1 : topic2;
    const secondary = topic1.usage_count > topic2.usage_count ? topic2 : topic1;
    
    return [
      {
        step: 1,
        action: 'backup_data',
        description: 'Create backup of current topic assignments'
      },
      {
        step: 2,
        action: 'update_sessions',
        description: `Update all sessions with topic '${secondary.name}' to use '${primary.name}'`
      },
      {
        step: 3,
        action: 'update_usage_count',
        description: `Update usage count for '${primary.name}' to ${topic1.usage_count + topic2.usage_count}`
      },
      {
        step: 4,
        action: 'deactivate_topic',
        description: `Mark '${secondary.name}' as inactive`
      },
      {
        step: 5,
        action: 'verify_integrity',
        description: 'Verify data integrity and update any dependent systems'
      }
    ];
  }

  /**
   * Analyze split opportunities for a topic
   */
  async analyzeSplitOpportunities(topic) {
    const usageThreshold = 20; // Minimum usage to consider splitting
    const complexityThreshold = 50; // Words in description suggesting complexity
    
    if (topic.usage_count < usageThreshold) {
      return {
        shouldSplit: false,
        reason: 'Insufficient usage to warrant splitting',
        metrics: { usage_count: topic.usage_count, threshold: usageThreshold }
      };
    }
    
    const descriptionLength = (topic.description || '').split(/\s+/).length;
    if (descriptionLength < complexityThreshold) {
      return {
        shouldSplit: false,
        reason: 'Topic appears sufficiently focused',
        metrics: { description_length: descriptionLength, threshold: complexityThreshold }
      };
    }
    
    // Calculate split score based on various factors
    const splitScore = Math.min(1, (topic.usage_count / 100) * (descriptionLength / 100));
    
    return {
      shouldSplit: true,
      splitScore,
      expectedImprovement: 'Better topic granularity and user targeting',
      complexity: splitScore > 0.8 ? 'high' : 'medium'
    };
  }

  /**
   * Get session patterns for a topic
   */
  async getTopicSessionPatterns(topicName) {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('user_id, created_at')
        .eq('secret_topic', topicName)
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      
      return {
        totalSessions: sessions.length,
        uniqueUsers: new Set(sessions.map(s => s.user_id)).size,
        timeDistribution: this.analyzeTimeDistribution(sessions),
        userDistribution: this.analyzeUserDistribution(sessions)
      };
    } catch (error) {
      console.warn('Error getting topic session patterns:', error);
      return { totalSessions: 0, uniqueUsers: 0, timeDistribution: {}, userDistribution: {} };
    }
  }

  /**
   * Generate split suggestions
   */
  generateSplitSuggestions(topic, patterns, maxSplits) {
    const suggestions = [];
    const words = (topic.description || '').toLowerCase().split(/\s+/);
    
    // Simple heuristic-based splitting - could be enhanced with ML
    const keywords = this.extractKeywords(topic.description || topic.name);
    const splitCandidates = keywords.slice(0, maxSplits).map((keyword, index) => ({
      name: `${topic.name}_${keyword}`,
      description: `Focused on ${keyword} aspects of ${topic.name}`,
      estimatedUsage: Math.floor(topic.usage_count / maxSplits),
      confidence: 0.7 - (index * 0.1), // Decreasing confidence
      rationale: `Split based on ${keyword} keyword analysis`
    }));
    
    return splitCandidates;
  }

  // Additional helper methods
  assessUserImpact(topic1, topic2) {
    const totalUsage = topic1.usage_count + topic2.usage_count;
    return totalUsage > 50 ? 'high' : totalUsage > 20 ? 'medium' : 'low';
  }

  generateMergeRecommendations(topic1, topic2, compatibility) {
    const recommendations = [];
    
    if (compatibility > 0.8) {
      recommendations.push('Proceed with merge - high compatibility');
    } else if (compatibility > 0.6) {
      recommendations.push('Consider merge after manual review');
    } else {
      recommendations.push('Manual analysis recommended before merge');
    }
    
    return recommendations;
  }

  determineSplitStrategy(topic, patterns) {
    if (patterns.totalSessions > 100) {
      return 'usage_based_split';
    } else {
      return 'semantic_split';
    }
  }

  generateSplitSteps(topic, suggestions) {
    return [
      {
        step: 1,
        action: 'create_new_topics',
        description: `Create ${suggestions.length} new specific topics`
      },
      {
        step: 2,
        action: 'migrate_sessions',
        description: 'Migrate existing sessions to appropriate new topics'
      },
      {
        step: 3,
        action: 'update_classifications',
        description: 'Update topic classification logic'
      },
      {
        step: 4,
        action: 'deprecate_original',
        description: `Mark original topic '${topic.name}' as deprecated`
      }
    ];
  }

  analyzeTimeDistribution(sessions) {
    // Simple time distribution analysis
    const timeSlots = {};
    sessions.forEach(session => {
      const hour = new Date(session.created_at).getHours();
      const slot = Math.floor(hour / 6); // 4 time slots per day
      timeSlots[slot] = (timeSlots[slot] || 0) + 1;
    });
    return timeSlots;
  }

  analyzeUserDistribution(sessions) {
    const userCounts = {};
    sessions.forEach(session => {
      userCounts[session.user_id] = (userCounts[session.user_id] || 0) + 1;
    });
    return userCounts;
  }
}

export default new PromptManager();