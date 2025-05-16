import ResponseClusterManager from './ResponseClusterManager.js';

class Supervisor {
  constructor() {
    // No direct initialization required
    this.responseClusterManager = ResponseClusterManager;
  }

  /**
   * Suggest activities based on the query and response
   * @param {string} query - The user's query
   * @param {Object} response - The AI's response
   * @returns {Promise<Array>} - Suggested activities
   */
  async suggestActivities(query, response) {
    // In a real implementation, this would:
    // 1. Analyze the query and response
    // 2. Match with a database of activities
    // 3. Consider user's learning history and preferences
    // 4. Return personalized activity suggestions
    
    // For now, we'll return generic suggestions based on keywords
    const keywords = this.extractKeywords(query);
    return this.generateSuggestions(keywords);
  }

  /**
   * Extract keywords from a query
   * @param {string} query - The user's query
   * @returns {Array} - Extracted keywords
   */
  extractKeywords(query) {
    // Simple keyword extraction
    // In a real implementation, this would use NLP techniques
    const words = query.toLowerCase().split(/\W+/);
    const stopWords = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'as', 'of', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might', 'must'];
    
    return words.filter(word => 
      word.length > 3 && 
      !stopWords.includes(word)
    );
  }

  /**
   * Generate activity suggestions based on keywords
   * @param {Array} keywords - Extracted keywords
   * @returns {Array} - Suggested activities
   */
  generateSuggestions(keywords) {
    const suggestions = [];
    
    // Map of keywords to activities
    const activityMap = {
      'algorithm': [
        { type: 'practice', title: 'Implement the algorithm in your preferred programming language' },
        { type: 'visualization', title: 'Draw a flowchart of the algorithm steps' }
      ],
      'quantum': [
        { type: 'simulation', title: 'Try a quantum computing simulator online' },
        { type: 'research', title: 'Read a research paper on recent quantum computing breakthroughs' }
      ],
      'neural': [
        { type: 'project', title: 'Build a simple neural network using TensorFlow or PyTorch' },
        { type: 'visualization', title: 'Visualize how neurons activate with different inputs' }
      ],
      'circuit': [
        { type: 'simulation', title: 'Use a circuit simulator to build and test the circuit' },
        { type: 'project', title: 'Build a physical version of the circuit if components are available' }
      ],
      'physics': [
        { type: 'experiment', title: 'Design a simple experiment to demonstrate this concept' },
        { type: 'visualization', title: 'Create a diagram showing the forces or interactions involved' }
      ],
      'math': [
        { type: 'practice', title: 'Solve practice problems related to this concept' },
        { type: 'application', title: 'Find a real-world application where this math is used' }
      ],
      'programming': [
        { type: 'project', title: 'Create a small project implementing this concept' },
        { type: 'practice', title: 'Solve coding challenges related to this topic' }
      ]
    };
    
    // Add generic suggestions
    suggestions.push(
      { type: 'reflection', title: 'Write a summary of this concept in your own words' },
      { type: 'teaching', title: 'Try explaining this concept to someone else' }
    );
    
    // Add keyword-specific suggestions
    keywords.forEach(keyword => {
      Object.keys(activityMap).forEach(key => {
        if (keyword.includes(key) && suggestions.length < 5) {
          activityMap[key].forEach(activity => {
            if (!suggestions.some(s => s.title === activity.title)) {
              suggestions.push(activity);
            }
          });
        }
      });
    });
    
    // Limit to 5 suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Process user query with crowd wisdom enhancement
   * @param {string} query - The user's query
   * @param {string} sessionId - The session ID
   * @param {string} userId - The user ID (optional)
   * @param {Object} openai - OpenAI client
   * @param {boolean} useCompositeScore - Whether to use composite quality score (default: true)
   * @param {number} explorationRate - Rate of exploring newer templates (0-1)
   * @returns {Promise<Object>} - Enhanced query and template information
   */
  async processQueryWithCrowdWisdom(query, sessionId, userId, openai, useCompositeScore = true, explorationRate = 0.1) {
    try {
      console.log('[Crowd Wisdom] Processing query with crowd wisdom enhancement');
      console.log(`[Crowd Wisdom] Using ${useCompositeScore ? 'composite' : 'efficacy'} score with exploration rate: ${explorationRate}`);
      
      // Step 1: Classify the topic of the query
      const topic = await this.responseClusterManager.classifyTopic(query, openai);
      console.log(`[Crowd Wisdom] Classified topic: ${topic}`);
      
      // Step 2: Get a template for this topic using new parameters
      const template = await this.responseClusterManager.getTemplateForTopic(
        topic, 
        useCompositeScore, 
        explorationRate
      );
      
      if (!template) {
        console.log(`[Crowd Wisdom] No template found for topic: ${topic}`);
        return {
          enhancedQuery: query,
          template: null,
          topic
        };
      }
      
      console.log(`[Crowd Wisdom] Found template (ID: ${template.id})`);
      
      // Step 3: Enhance the prompt with the template
      const enhancedQuery = this.responseClusterManager.enhancePromptWithTemplate(query, template);
      
      // Step 4: Log this template usage
      await this.responseClusterManager.logTemplateUsage(template.id, sessionId, userId, query, null);
      
      return {
        enhancedQuery,
        template,
        topic,
        selectionMethod: useCompositeScore ? 'composite_score' : 'efficacy_score'
      };
    } catch (error) {
      console.error('Error in processQueryWithCrowdWisdom:', error);
      return {
        enhancedQuery: query,
        template: null,
        topic: 'general',
        selectionMethod: 'none'
      };
    }
  }

  /**
   * Update template efficacy based on feedback
   * @param {string} responseId - The response ID
   * @param {number} rating - The feedback rating (1-5)
   * @param {string} query - The original query
   * @param {Object} response - The response object
   * @param {Object} openai - OpenAI client (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async processFeedbackForCrowdWisdom(responseId, rating, query, response, openai) {
    try {
      // Update efficacy for existing template
      const updated = await this.responseClusterManager.updateTemplateEfficacy(responseId, rating);
      
      if (!updated && rating >= 4) {
        // If no template was used, but the response was highly rated,
        // create a new template from this successful interaction
        const topic = await this.responseClusterManager.classifyTopic(query, openai);
        await this.responseClusterManager.createTemplateFromSuccess(topic, query, response, rating, openai);
      }
      
      // Recalculate composite quality scores periodically
      // Only do this sometimes to avoid overhead on every feedback
      if (Math.random() < 0.2) { // 20% chance
        console.log('[Crowd Wisdom] Triggering periodic composite quality score update');
        // Run in the background to not block the response
        setTimeout(async () => {
          try {
            await this.responseClusterManager.calculateCompositeQualityScores();
          } catch (error) {
            console.error('[Crowd Wisdom] Error in background quality score update:', error);
          }
        }, 100);
      }
      
      return true;
    } catch (error) {
      console.error('Error in processFeedbackForCrowdWisdom:', error);
      return false;
    }
  }

  /**
   * Calculate composite quality scores for all templates
   * @param {Object} customWeights - Optional custom weights for signals
   * @returns {Promise<number>} - Number of templates updated
   */
  async updateCompositeScores(customWeights = null) {
    try {
      console.log('[Crowd Wisdom] Admin-triggered composite quality score update');
      return await this.responseClusterManager.calculateCompositeQualityScores(customWeights);
    } catch (error) {
      console.error('Error updating composite scores:', error);
      return 0;
    }
  }
}

export default Supervisor;