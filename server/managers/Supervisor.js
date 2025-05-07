class Supervisor {
  constructor() {
    // Initialize user clusters and refinement data
    this.userClusters = new Map();
    this.clusterPromptEnhancements = this.initializeClusterPromptEnhancements();
  }

  /**
   * Initialize the prompt enhancements for different user clusters
   * @returns {Object} - Map of cluster types to enhancement data
   */
  initializeClusterPromptEnhancements() {
    return {
      'visual_basic': {
        promptStyle: 'Use visual descriptions and simple analogies',
        formatSuggestions: 'Include diagrams and simple visuals when possible',
        emphasisAreas: ['visual examples', 'simplified explanations', 'everyday analogies'],
        avoidAreas: ['complex mathematical formulas', 'abstract theoretical concepts']
      },
      'visual_advanced': {
        promptStyle: 'Use visual explanations with technical depth',
        formatSuggestions: 'Include detailed diagrams and visual representations of complex concepts',
        emphasisAreas: ['advanced visual models', 'technical details with visual support', 'visual comparison of alternatives'],
        avoidAreas: ['purely textual explanations without visual aids']
      },
      'practical_basic': {
        promptStyle: 'Focus on hands-on examples and real-world applications',
        formatSuggestions: 'Include step-by-step instructions and simple projects',
        emphasisAreas: ['practical applications', 'beginner-friendly examples', 'hands-on learning'],
        avoidAreas: ['theoretical background without practical context']
      },
      'practical_advanced': {
        promptStyle: 'Provide detailed technical explanations with practical applications',
        formatSuggestions: 'Include code examples, frameworks, and implementation guidelines',
        emphasisAreas: ['implementation details', 'performance considerations', 'real-world constraints'],
        avoidAreas: ['simplified analogies that lack technical depth']
      },
      'theoretical_basic': {
        promptStyle: 'Focus on fundamental principles with clear explanations',
        formatSuggestions: 'Include simplified models and conceptual frameworks',
        emphasisAreas: ['fundamental principles', 'logical reasoning', 'conceptual understanding'],
        avoidAreas: ['complex implementations without explanation']
      },
      'theoretical_advanced': {
        promptStyle: 'Provide in-depth theoretical explanations with mathematical formalism',
        formatSuggestions: 'Include equations, proofs, and formal definitions',
        emphasisAreas: ['mathematical foundations', 'theoretical proofs', 'research implications'],
        avoidAreas: ['oversimplified explanations that lack rigor']
      },
      'balanced': {
        promptStyle: 'Balance visual, practical, and theoretical explanations',
        formatSuggestions: 'Include a mix of visual aids, practical examples, and theoretical background',
        emphasisAreas: ['clear explanations', 'balanced examples', 'practical applications'],
        avoidAreas: ['overly specialized jargon without explanation']
      }
    };
  }

  /**
   * Main method for refining a user's prompt
   * @param {string} originalPrompt - The user's original prompt
   * @param {string} userId - The user's ID
   * @param {string} sessionId - The session ID
   * @returns {Promise<string>} - The refined prompt
   */
  async refinePrompt(originalPrompt, userId, sessionId) {
    try {
      // Get user cluster data
      const clusterData = await this.getUserClusterData(userId);
      
      // Enhance prompt with cluster data
      const refinedPrompt = this.enrichWithClusterEnhancements(originalPrompt, clusterData);
      
      // Log the refinement for analytics
      await this.logPromptRefinement(userId, sessionId, {
        originalPrompt,
        refinedPrompt,
        clusterType: clusterData.clusterType
      });
      
      return refinedPrompt;
    } catch (error) {
      console.error('Error refining prompt:', error);
      // If refinement fails, return the original prompt
      return originalPrompt;
    }
  }

  /**
   * Get the user's cluster data
   * @param {string} userId - The user's ID
   * @param {boolean} forceRecalculate - Whether to force recalculation
   * @returns {Promise<Object>} - The user's cluster data
   */
  async getUserClusterData(userId, forceRecalculate = false) {
    try {
      // First check if user cluster is cached and not forcing recalculation
      if (!forceRecalculate && this.userClusters.has(userId)) {
        return this.userClusters.get(userId);
      }
      
      // Get supabase client to check if we have a recent cluster
      const { supabase } = await import('../lib/supabaseClient.js');
      
      // Try to get recent cluster from database (less than 7 days old) if not forcing recalculation
      if (!forceRecalculate) {
        const { data: storedClusterData, error: clusterError } = await supabase
          .from('user_clusters')
          .select('*')
          .eq('user_id', userId)
          .gt('last_calculated', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('last_calculated', { ascending: false })
          .limit(1)
          .single();
          
        if (!clusterError && storedClusterData) {
          // Use the stored cluster data
          const userClusterData = {
            clusterType: storedClusterData.cluster_type,
            ...this.getClusterPromptEnhancements(storedClusterData.cluster_type),
            lastUpdated: storedClusterData.last_calculated
          };
          
          // Cache the cluster data
          this.userClusters.set(userId, userClusterData);
          
          return userClusterData;
        }
      }
      
      // If we're here, either we're forcing recalculation or we didn't find a recent cluster
      
      // 1. Get user profile data
      const userProfileManager = await this.getUserProfileManager();
      const profile = await userProfileManager.getProfile(userId);
      
      // 2. Fetch user's quiz history and results
      const quizResults = await this.getUserQuizResults(userId);
      
      // 3. Get feedback patterns
      const feedbackData = await this.getUserFeedbackPatterns(userId);
      
      // 4. Determine user's cluster based on multiple factors
      const clusterType = await this.determineUserCluster(profile, quizResults, feedbackData);
      
      // 5. Get cluster-specific prompt enhancements
      const clusterEnhancements = this.getClusterPromptEnhancements(clusterType);
      
      // 6. Create combined cluster data
      const userClusterData = {
        clusterType,
        ...clusterEnhancements,
        lastUpdated: new Date().toISOString()
      };
      
      // 7. Save to database
      try {
        const clusterScore = this.getLastClusterScore();
        
        const { error: insertError } = await supabase
          .from('user_clusters')
          .insert([{
            user_id: userId,
            cluster_type: clusterType,
            cluster_score: clusterScore,
            last_calculated: new Date().toISOString(),
            learning_style_factor: this.lastLearningStyleFactor || {},
            technical_depth_factor: this.lastTechnicalDepthFactor || {},
            quiz_performance_factor: this.lastQuizPerformanceFactor || {},
            feedback_pattern_factor: this.lastFeedbackPatternFactor || {}
          }]);
          
        if (insertError) {
          console.error('Error saving user cluster to database:', insertError);
        }
      } catch (dbError) {
        console.error('Database error when saving user cluster:', dbError);
      }
      
      // Cache the cluster data
      this.userClusters.set(userId, userClusterData);
      
      return userClusterData;
    } catch (error) {
      console.error('Error getting user cluster data:', error);
      // Return default cluster data if there's an error
      return this.getDefaultClusterData();
    }
  }

  /**
   * Get the UserProfileManager module
   * @returns {Promise<Object>} - UserProfileManager instance
   */
  async getUserProfileManager() {
    try {
      // Dynamic import to avoid circular dependencies
      const UserProfileManager = (await import('./UserProfileManager.js')).default;
      return UserProfileManager;
    } catch (error) {
      console.error('Error importing UserProfileManager:', error);
      throw error;
    }
  }

  /**
   * Get user's quiz results
   * @param {string} userId - The user's ID
   * @returns {Promise<Array>} - The user's quiz results
   */
  async getUserQuizResults(userId) {
    try {
      // Get supabase client
      const { supabase } = await import('../lib/supabaseClient.js');
      
      // Query the database for user's quiz results
      const { data, error } = await supabase
        .from('quiz_results')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching quiz results:', error);
      return [];
    }
  }

  /**
   * Get user's feedback patterns
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} - The user's feedback patterns
   */
  async getUserFeedbackPatterns(userId) {
    try {
      // Get supabase client
      const { supabase } = await import('../lib/supabaseClient.js');
      
      // Query for feedback data
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (error) throw error;
      return this.analyzeFeedbackData(data || []);
    } catch (error) {
      console.error('Error fetching feedback data:', error);
      return { 
        preferredStyle: 'balanced', 
        commonIssues: [], 
        adaptationTrend: 'stable' 
      };
    }
  }

  /**
   * Analyze feedback data to extract patterns
   * @param {Array} feedbackData - Array of feedback objects
   * @returns {Object} - Analyzed feedback patterns
   */
  analyzeFeedbackData(feedbackData) {
    // Simple analysis of feedback data to extract patterns
    const ratingCounts = { low: 0, medium: 0, high: 0 };
    const issueTypes = {};
    
    feedbackData.forEach(feedback => {
      // Count ratings
      if (feedback.rating <= 2) ratingCounts.low++;
      else if (feedback.rating <= 3) ratingCounts.medium++;
      else ratingCounts.high++;
      
      // Count issue types
      if (feedback.issue_type) {
        issueTypes[feedback.issue_type] = (issueTypes[feedback.issue_type] || 0) + 1;
      }
    });
    
    // Determine preferred style based on feedback
    let preferredStyle = 'balanced';
    if (feedbackData.length > 0) {
      const mostCommonIssues = Object.entries(issueTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);
        
      if (mostCommonIssues.includes('too_technical')) preferredStyle = 'simplified';
      else if (mostCommonIssues.includes('too_basic')) preferredStyle = 'detailed';
    }
    
    return {
      preferredStyle,
      commonIssues: Object.keys(issueTypes),
      adaptationTrend: 'stable' // Could be more sophisticated in future
    };
  }

  /**
   * Determine which cluster a user belongs to
   * @param {Object} profile - User profile data
   * @param {Array} quizResults - User quiz results
   * @param {Object} feedbackData - Analyzed feedback data
   * @returns {Promise<string>} - The cluster name
   */
  async determineUserCluster(profile, quizResults, feedbackData) {
    // Define the main clustering factors:
    
    // 1. Learning Style Factor (from profile)
    const learningStyleFactor = this.getLearningStyleFactor(profile.learning_style);
    this.lastLearningStyleFactor = learningStyleFactor; // Store for database saving
    
    // 2. Technical Depth Factor (from profile)
    const technicalDepthFactor = this.getTechnicalDepthFactor(profile.technical_depth);
    this.lastTechnicalDepthFactor = technicalDepthFactor; // Store for database saving
    
    // 3. Quiz Performance Factor
    const quizPerformanceFactor = this.getQuizPerformanceFactor(quizResults);
    this.lastQuizPerformanceFactor = quizPerformanceFactor; // Store for database saving
    
    // 4. Feedback Pattern Factor
    const feedbackPatternFactor = this.getFeedbackPatternFactor(feedbackData);
    this.lastFeedbackPatternFactor = feedbackPatternFactor; // Store for database saving
    
    // Compute cluster scores for each potential cluster
    const clusterScores = {
      'visual_basic': this.computeClusterScore('visual_basic', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'visual_advanced': this.computeClusterScore('visual_advanced', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'practical_basic': this.computeClusterScore('practical_basic', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'practical_advanced': this.computeClusterScore('practical_advanced', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'theoretical_basic': this.computeClusterScore('theoretical_basic', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'theoretical_advanced': this.computeClusterScore('theoretical_advanced', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      }),
      'balanced': this.computeClusterScore('balanced', {
        learningStyleFactor, technicalDepthFactor, quizPerformanceFactor, feedbackPatternFactor
      })
    };
    
    // Find the cluster with the highest score
    const bestClusterEntry = Object.entries(clusterScores)
      .sort((a, b) => b[1] - a[1])[0];
      
    this.lastClusterScore = bestClusterEntry[1]; // Store for database saving
    
    return bestClusterEntry[0];
  }

  /**
   * Get learning style factor
   * @param {string} learningStyle - User's learning style
   * @returns {Object} - Learning style factors
   */
  getLearningStyleFactor(learningStyle) {
    // Map learning style to numerical factors
    const styleFactors = {
      'Visual': { visual: 1.0, practical: 0.5, theoretical: 0.3 },
      'Auditory': { visual: 0.3, practical: 0.7, theoretical: 0.6 },
      'Kinesthetic': { visual: 0.5, practical: 1.0, theoretical: 0.2 }
    };
    
    return styleFactors[learningStyle] || { visual: 0.5, practical: 0.5, theoretical: 0.5 };
  }

  /**
   * Get technical depth factor
   * @param {number} technicalDepth - User's technical depth preference
   * @returns {Object} - Technical depth factors
   */
  getTechnicalDepthFactor(technicalDepth) {
    // Map technical depth preference to factors
    const depthPercentage = Number(technicalDepth) / 100;
    
    return {
      basic: depthPercentage < 0.4 ? 0.8 : (depthPercentage < 0.7 ? 0.5 : 0.2),
      advanced: depthPercentage > 0.7 ? 0.8 : (depthPercentage > 0.4 ? 0.5 : 0.2)
    };
  }

  /**
   * Get quiz performance factor
   * @param {Array} quizResults - User's quiz results
   * @returns {Object} - Quiz performance factors
   */
  getQuizPerformanceFactor(quizResults) {
    if (!quizResults || quizResults.length === 0) {
      return { basic: 0.5, advanced: 0.5 };
    }
    
    // Calculate average quiz score
    const avgScore = quizResults.reduce((sum, result) => sum + result.score, 0) / quizResults.length;
    
    // Higher scores suggest readiness for more advanced content
    return {
      basic: avgScore < 70 ? 0.8 : (avgScore < 85 ? 0.5 : 0.2),
      advanced: avgScore > 85 ? 0.8 : (avgScore > 70 ? 0.5 : 0.2)
    };
  }

  /**
   * Get feedback pattern factor
   * @param {Object} feedbackData - User's feedback patterns
   * @returns {Object} - Feedback pattern factors
   */
  getFeedbackPatternFactor(feedbackData) {
    // Default if no feedback
    if (!feedbackData || !feedbackData.preferredStyle) {
      return { visual: 0.5, practical: 0.5, theoretical: 0.5, basic: 0.5, advanced: 0.5 };
    }
    
    // Map feedback style preferences to factors
    const styleFactor = {
      'visual': { visual: 0.9, practical: 0.5, theoretical: 0.3 },
      'practical': { visual: 0.5, practical: 0.9, theoretical: 0.3 },
      'balanced': { visual: 0.6, practical: 0.6, theoretical: 0.6 },
      'simplified': { basic: 0.8, advanced: 0.2 },
      'detailed': { basic: 0.3, advanced: 0.8 }
    };
    
    return {
      ...styleFactor['balanced'],
      ...styleFactor[feedbackData.preferredStyle] || {}
    };
  }

  /**
   * Compute cluster score
   * @param {string} clusterName - Name of the cluster
   * @param {Object} factors - Clustering factors
   * @returns {number} - Computed score
   */
  computeClusterScore(clusterName, factors) {
    // Compute a score for how well a user fits into a particular cluster
    const clusterWeights = {
      'visual_basic': {
        learningStyle: { visual: 1.0, practical: 0.2, theoretical: 0.1 },
        technicalDepth: { basic: 0.9, advanced: 0.1 },
        quizPerformance: { basic: 0.8, advanced: 0.3 },
        feedbackPattern: { visual: 0.9, practical: 0.3, theoretical: 0.1 }
      },
      'visual_advanced': {
        learningStyle: { visual: 1.0, practical: 0.4, theoretical: 0.3 },
        technicalDepth: { basic: 0.2, advanced: 0.9 },
        quizPerformance: { basic: 0.2, advanced: 0.9 },
        feedbackPattern: { visual: 0.9, practical: 0.4, theoretical: 0.4 }
      },
      'practical_basic': {
        learningStyle: { visual: 0.3, practical: 1.0, theoretical: 0.1 },
        technicalDepth: { basic: 0.9, advanced: 0.1 },
        quizPerformance: { basic: 0.8, advanced: 0.3 },
        feedbackPattern: { visual: 0.3, practical: 0.9, theoretical: 0.1 }
      },
      'practical_advanced': {
        learningStyle: { visual: 0.3, practical: 1.0, theoretical: 0.3 },
        technicalDepth: { basic: 0.1, advanced: 0.9 },
        quizPerformance: { basic: 0.2, advanced: 0.9 },
        feedbackPattern: { visual: 0.3, practical: 0.9, theoretical: 0.4 }
      },
      'theoretical_basic': {
        learningStyle: { visual: 0.1, practical: 0.2, theoretical: 1.0 },
        technicalDepth: { basic: 0.9, advanced: 0.1 },
        quizPerformance: { basic: 0.8, advanced: 0.3 },
        feedbackPattern: { visual: 0.1, practical: 0.3, theoretical: 0.9 }
      },
      'theoretical_advanced': {
        learningStyle: { visual: 0.1, practical: 0.3, theoretical: 1.0 },
        technicalDepth: { basic: 0.1, advanced: 0.9 },
        quizPerformance: { basic: 0.2, advanced: 0.9 },
        feedbackPattern: { visual: 0.1, practical: 0.3, theoretical: 0.9 }
      },
      'balanced': {
        learningStyle: { visual: 0.6, practical: 0.6, theoretical: 0.6 },
        technicalDepth: { basic: 0.5, advanced: 0.5 },
        quizPerformance: { basic: 0.5, advanced: 0.5 },
        feedbackPattern: { visual: 0.6, practical: 0.6, theoretical: 0.6 }
      }
    };
    
    const weights = clusterWeights[clusterName];
    if (!weights) return 0;
    
    // Calculate score by multiplying factors with weights
    let score = 0;
    
    // Learning style component
    for (const style of Object.keys(factors.learningStyleFactor)) {
      score += (factors.learningStyleFactor[style] || 0) * (weights.learningStyle[style] || 0);
    }
    
    // Technical depth component
    for (const level of Object.keys(factors.technicalDepthFactor)) {
      score += (factors.technicalDepthFactor[level] || 0) * (weights.technicalDepth[level] || 0);
    }
    
    // Quiz performance component
    for (const level of Object.keys(factors.quizPerformanceFactor)) {
      score += (factors.quizPerformanceFactor[level] || 0) * (weights.quizPerformance[level] || 0);
    }
    
    // Feedback pattern component
    for (const style of Object.keys(factors.feedbackPatternFactor)) {
      if (weights.feedbackPattern[style]) {
        score += (factors.feedbackPatternFactor[style] || 0) * (weights.feedbackPattern[style] || 0);
      }
    }
    
    return score;
  }

  /**
   * Get cluster prompt enhancements
   * @param {string} clusterName - Name of the cluster
   * @returns {Object} - Prompt enhancements for the cluster
   */
  getClusterPromptEnhancements(clusterName) {
    return this.clusterPromptEnhancements[clusterName] || this.getDefaultClusterData();
  }

  /**
   * Get default cluster data
   * @returns {Object} - Default cluster data
   */
  getDefaultClusterData() {
    return {
      clusterType: 'balanced',
      promptStyle: 'Balance visual, practical, and theoretical explanations',
      formatSuggestions: 'Include a mix of visual aids, practical examples, and theoretical background',
      emphasisAreas: ['clear explanations', 'balanced examples', 'practical applications'],
      avoidAreas: ['overly specialized jargon without explanation']
    };
  }

  /**
   * Enrich the prompt with cluster enhancements
   * @param {string} originalPrompt - Original user prompt
   * @param {Object} clusterData - Cluster data with enhancements
   * @returns {string} - Enhanced prompt
   */
  enrichWithClusterEnhancements(originalPrompt, clusterData) {
    if (!clusterData) return originalPrompt;
    
    // Create a context addition based on cluster data
    const clusterContext = `
[Prompt enhancement suggestions based on your learning profile:
- ${clusterData.promptStyle}
- Emphasize: ${clusterData.emphasisAreas.join(', ')}
- Format: ${clusterData.formatSuggestions}]
`;
    
    // Add this context to the original prompt
    return `${originalPrompt}\n\n${clusterContext}`;
  }

  /**
   * Log prompt refinement for analytics
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {Object} refinementData - Data about the refinement
   * @returns {Promise<void>}
   */
  async logPromptRefinement(userId, sessionId, refinementData) {
    try {
      // Log to the database if available
      try {
        const { supabase } = await import('../lib/supabaseClient.js');
        
        const { error } = await supabase
          .from('prompt_refinements')
          .insert([{
            user_id: userId,
            session_id: sessionId,
            original_prompt: refinementData.originalPrompt,
            refined_prompt: refinementData.refinedPrompt,
            cluster_type: refinementData.clusterType
          }]);
          
        if (error) {
          console.error('Error logging prompt refinement to database:', error);
        }
      } catch (dbError) {
        console.error('Database error when logging prompt refinement:', dbError);
      }
      
      // Also log to console
      console.log(`[Supervisor] Prompt refinement for user ${userId}, session ${sessionId}:`, {
        originalLength: refinementData.originalPrompt.length,
        refinedLength: refinementData.refinedPrompt.length,
        clusterType: refinementData.clusterType,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging prompt refinement:', error);
    }
  }

  /**
   * The original activity suggestion feature is kept for backward compatibility
   */
  async suggestActivities(query, response) {
    // Simple keyword extraction
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

  // New method to get the last calculated cluster score
  getLastClusterScore() {
    return this.lastClusterScore || 0;
  }
}

export default Supervisor;