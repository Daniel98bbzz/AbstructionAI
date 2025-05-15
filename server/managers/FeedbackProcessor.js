class FeedbackProcessor {
  constructor() {
    // Initialize feedback patterns storage
    this.feedbackPatterns = new Map();
    this.userPreferences = new Map();
    this.responseEffectiveness = new Map();
    
    // Import Supervisor for Crowd Wisdom
    try {
      import('./Supervisor.js').then(module => {
        this.supervisor = module.default;
        console.log('Supervisor initialized in FeedbackProcessor');
      }).catch(err => {
        console.error('Failed to import Supervisor in FeedbackProcessor:', err);
        this.supervisor = null;
      });
    } catch (err) {
      console.error('Error initializing Supervisor in FeedbackProcessor:', err);
      this.supervisor = null;
    }
  }

  /**
   * Process user feedback for a response
   * @param {string} responseId - The response ID
   * @param {number} rating - User rating (1-5)
   * @param {string} comments - User comments
   * @param {string} userId - The user's ID
   * @param {Object} responseData - Optional full response data for crowd wisdom
   * @param {string} originalQuery - Original query that generated the response
   * @param {Object} openai - OpenAI client (optional)
   * @returns {Promise<Object>} - Processed feedback data
   */
  async processFeedback(responseId, rating, comments, userId, responseData = null, originalQuery = null, openai = null) {
    const feedback = {
      responseId,
      rating,
      comments,
      userId,
      timestamp: new Date().toISOString()
    };
    
    // Analyze and store feedback patterns
    await this.analyzeFeedback(feedback);
    
    // Update user preferences based on feedback
    await this.updateUserPreferences(userId, feedback);
    
    // Update response effectiveness metrics
    await this.updateResponseEffectiveness(responseId, feedback);
    
    // Process feedback for Crowd Wisdom if available
    if (this.supervisor && responseId && rating !== undefined) {
      try {
        console.log(`[Crowd Wisdom] Processing feedback for response ${responseId} with rating ${rating}`);
        await this.supervisor.processFeedbackForCrowdWisdom(
          responseId, 
          rating, 
          originalQuery || '', 
          responseData || { id: responseId },
          openai
        );
      } catch (error) {
        console.error('[Crowd Wisdom] Error processing feedback:', error);
      }
    }
    
    return feedback;
  }

  /**
   * Analyze feedback to improve future responses
   * @param {Object} feedback - Feedback data
   * @returns {Promise<void>}
   */
  async analyzeFeedback(feedback) {
    const patterns = this.feedbackPatterns.get(feedback.userId) || {
      preferredStyles: new Map(),
      commonIssues: new Map(),
      topicPreferences: new Map(),
      improvementSuggestions: []
    };

    // Analyze feedback comments for patterns
    const analysis = this.analyzeFeedbackContent(feedback.comments);
    
    // Update preferred styles
    analysis.styles.forEach(style => {
      const count = patterns.preferredStyles.get(style) || 0;
      patterns.preferredStyles.set(style, count + 1);
    });

    // Track issues for low ratings
    if (feedback.rating <= 3) {
      analysis.issues.forEach(issue => {
        const count = patterns.commonIssues.get(issue) || 0;
        patterns.commonIssues.set(issue, count + 1);
      });
    }

    // Store improvement suggestions
    if (analysis.suggestions.length > 0) {
      patterns.improvementSuggestions.push(...analysis.suggestions);
    }

    // Update feedback patterns
    this.feedbackPatterns.set(feedback.userId, patterns);
  }

  /**
   * Update user preferences based on feedback
   * @param {string} userId - The user's ID
   * @param {Object} feedback - Feedback data
   * @returns {Promise<void>}
   */
  async updateUserPreferences(userId, feedback) {
    const preferences = this.userPreferences.get(userId) || {
      technicalDepth: 50,
      examplePreference: 50,
      visualPreference: 50,
      adaptiveHistory: []
    };

    // Analyze feedback to adjust preferences
    const analysis = this.analyzeFeedbackContent(feedback.comments);
    
    // Adjust technical depth based on feedback
    if (analysis.styles.includes('technical')) {
      preferences.technicalDepth = this.adjustPreference(
        preferences.technicalDepth,
        feedback.rating >= 4 ? 10 : -10
      );
    }

    // Adjust example preference
    if (analysis.styles.includes('examples')) {
      preferences.examplePreference = this.adjustPreference(
        preferences.examplePreference,
        feedback.rating >= 4 ? 10 : -10
      );
    }

    // Adjust visual preference
    if (analysis.styles.includes('visual')) {
      preferences.visualPreference = this.adjustPreference(
        preferences.visualPreference,
        feedback.rating >= 4 ? 10 : -10
      );
    }

    // Record adaptation
    preferences.adaptiveHistory.push({
      timestamp: feedback.timestamp,
      changes: {
        technicalDepth: preferences.technicalDepth,
        examplePreference: preferences.examplePreference,
        visualPreference: preferences.visualPreference
      },
      feedback: {
        rating: feedback.rating,
        analysis: analysis
      }
    });

    // Keep only last 10 adaptations
    if (preferences.adaptiveHistory.length > 10) {
      preferences.adaptiveHistory.shift();
    }

    // Update preferences
    this.userPreferences.set(userId, preferences);
  }

  /**
   * Update response effectiveness metrics
   * @param {string} responseId - The response ID
   * @param {Object} feedback - Feedback data
   * @returns {Promise<void>}
   */
  async updateResponseEffectiveness(responseId, feedback) {
    const effectiveness = this.responseEffectiveness.get(responseId) || {
      ratings: [],
      averageRating: 0,
      improvements: [],
      strengths: []
    };

    // Add new rating
    effectiveness.ratings.push(feedback.rating);
    
    // Update average rating
    effectiveness.averageRating = effectiveness.ratings.reduce((a, b) => a + b, 0) / effectiveness.ratings.length;

    // Analyze feedback content
    const analysis = this.analyzeFeedbackContent(feedback.comments);
    
    // Add improvements for low ratings
    if (feedback.rating <= 3) {
      effectiveness.improvements.push(...analysis.suggestions);
    }

    // Add strengths for high ratings
    if (feedback.rating >= 4) {
      effectiveness.strengths.push(...analysis.styles);
    }

    // Update effectiveness metrics
    this.responseEffectiveness.set(responseId, effectiveness);
  }

  /**
   * Get feedback statistics for a user
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} - Feedback statistics
   */
  async getFeedbackStats(userId) {
    const patterns = this.feedbackPatterns.get(userId);
    const preferences = this.userPreferences.get(userId);

    return {
      patterns: patterns || {
        preferredStyles: new Map(),
        commonIssues: new Map(),
        topicPreferences: new Map(),
        improvementSuggestions: []
      },
      preferences: preferences || {
        technicalDepth: 50,
        examplePreference: 50,
        visualPreference: 50,
        adaptiveHistory: []
      },
      summary: this.generateFeedbackSummary(userId)
    };
  }

  /**
   * Analyze feedback content for patterns
   * @param {string} comments - Feedback comments
   * @returns {Object} - Analyzed patterns
   */
  analyzeFeedbackContent(comments) {
    const analysis = {
      styles: [],
      issues: [],
      suggestions: []
    };

    if (!comments) return analysis;

    // Analyze for preferred styles
    const stylePatterns = {
      technical: ['technical', 'detailed', 'in-depth'],
      examples: ['example', 'practical', 'application'],
      visual: ['visual', 'diagram', 'illustration'],
      analogies: ['analogy', 'comparison', 'like']
    };

    Object.entries(stylePatterns).forEach(([style, keywords]) => {
      if (keywords.some(keyword => comments.toLowerCase().includes(keyword))) {
        analysis.styles.push(style);
      }
    });

    // Analyze for issues
    const issuePatterns = {
      tooComplex: ['too complex', 'too difficult', 'hard to understand'],
      tooSimple: ['too simple', 'too basic', 'need more depth'],
      unclear: ['unclear', 'confusing', 'vague'],
      needsExamples: ['need examples', 'need applications', 'show how']
    };

    Object.entries(issuePatterns).forEach(([issue, keywords]) => {
      if (keywords.some(keyword => comments.toLowerCase().includes(keyword))) {
        analysis.issues.push(issue);
      }
    });

    // Extract improvement suggestions
    const suggestionPatterns = [
      'should include',
      'would be better with',
      'need more',
      'could improve by',
      'suggest adding'
    ];

    suggestionPatterns.forEach(pattern => {
      const regex = new RegExp(`${pattern}\\s+([^.!?]+)`, 'gi');
      const matches = comments.match(regex);
      if (matches) {
        analysis.suggestions.push(...matches);
      }
    });

    return analysis;
  }

  /**
   * Generate a summary of user feedback patterns
   * @param {string} userId - The user's ID
   * @returns {Object} - Feedback summary
   */
  generateFeedbackSummary(userId) {
    const patterns = this.feedbackPatterns.get(userId);
    const preferences = this.userPreferences.get(userId);

    if (!patterns || !preferences) {
      return {
        preferredStyle: 'balanced',
        commonIssues: [],
        suggestedImprovements: [],
        adaptationTrend: 'stable'
      };
    }

    // Determine preferred style
    const styleEntries = Array.from(patterns.preferredStyles.entries());
    const preferredStyle = styleEntries.length > 0
      ? styleEntries.reduce((a, b) => (a[1] > b[1] ? a : b))[0]
      : 'balanced';

    // Get most common issues
    const commonIssues = Array.from(patterns.commonIssues.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([issue]) => issue);

    // Get recent improvement suggestions
    const suggestedImprovements = patterns.improvementSuggestions
      .slice(-5);

    // Analyze adaptation trend
    const adaptationTrend = this.analyzeAdaptationTrend(preferences.adaptiveHistory);

    return {
      preferredStyle,
      commonIssues,
      suggestedImprovements,
      adaptationTrend
    };
  }

  /**
   * Analyze the trend in user preference adaptations
   * @param {Array} history - Adaptation history
   * @returns {string} - Trend description
   */
  analyzeAdaptationTrend(history) {
    if (!history || history.length < 2) return 'stable';

    const recentChanges = history.slice(-3);
    const technicalChanges = recentChanges.map(h => h.changes.technicalDepth);
    const exampleChanges = recentChanges.map(h => h.changes.examplePreference);
    const visualChanges = recentChanges.map(h => h.changes.visualPreference);

    const trends = {
      technical: this.calculateTrend(technicalChanges),
      examples: this.calculateTrend(exampleChanges),
      visual: this.calculateTrend(visualChanges)
    };

    // Determine overall trend
    const significantTrends = Object.entries(trends)
      .filter(([_, trend]) => trend !== 'stable')
      .map(([aspect, trend]) => `${trend} ${aspect}`);

    return significantTrends.length > 0
      ? significantTrends.join(', ')
      : 'stable';
  }

  /**
   * Calculate trend direction from a series of values
   * @param {Array} values - Series of values
   * @returns {string} - Trend direction
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';

    const changes = values.slice(1).map((v, i) => v - values[i]);
    const averageChange = changes.reduce((a, b) => a + b, 0) / changes.length;

    if (Math.abs(averageChange) < 5) return 'stable';
    return averageChange > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Adjust a preference value within bounds
   * @param {number} current - Current preference value
   * @param {number} adjustment - Adjustment amount
   * @returns {number} - Adjusted preference value
   */
  adjustPreference(current, adjustment) {
    return Math.max(0, Math.min(100, current + adjustment));
  }
}

export default FeedbackProcessor;