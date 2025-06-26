/**
 * Learning Algorithms for Adaptive Mastery Models
 * Implements spaced repetition, mastery tracking, and feedback-based recommendations
 */

/**
 * SM-2 Algorithm for spaced repetition
 * Based on SuperMemo 2 algorithm
 */
export class SpacedRepetitionSM2 {
  constructor() {
    this.minEF = 1.3;
    this.maxInterval = 365; // Maximum interval in days
  }

  /**
   * Calculate next review date and update easiness factor
   * @param {Object} cardData - Current card data
   * @param {number} quality - Quality of recall (0-5)
   * @returns {Object} Updated card data with next review date
   */
  updateCard(cardData, quality) {
    const {
      easinessFactor = 2.5,
      interval = 1,
      repetitions = 0,
      lastReviewDate = new Date()
    } = cardData;

    let newEF = easinessFactor;
    let newInterval = interval;
    let newRepetitions = repetitions;

    // Update easiness factor based on quality (0-5 scale)
    if (quality >= 3) {
      // Correct response
      newEF = Math.max(
        this.minEF,
        easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
      );

      if (repetitions === 0) {
        newInterval = 1;
      } else if (repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.min(this.maxInterval, Math.round(interval * newEF));
      }
      
      newRepetitions = repetitions + 1;
    } else {
      // Incorrect response - reset
      newRepetitions = 0;
      newInterval = 1;
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    return {
      easinessFactor: newEF,
      interval: newInterval,
      repetitions: newRepetitions,
      lastReviewDate: new Date(),
      nextReviewDate,
      quality
    };
  }

  /**
   * Get next review date for a topic
   * @param {Object} topicData - Topic learning data
   * @returns {Date} Next review date
   */
  getNextReviewDate(topicData) {
    if (!topicData.nextReviewDate) {
      return new Date(); // Review immediately if never reviewed
    }
    return new Date(topicData.nextReviewDate);
  }

  /**
   * Check if a topic is due for review
   * @param {Object} topicData - Topic learning data
   * @returns {boolean} Whether topic is due for review
   */
  isDueForReview(topicData) {
    const nextReview = this.getNextReviewDate(topicData);
    return new Date() >= nextReview;
  }
}

/**
 * Mastery Level Calculator
 */
export class MasteryCalculator {
  constructor() {
    this.masteryThresholds = {
      beginner: 0,
      intermediate: 30,
      advanced: 60,
      expert: 80
    };
  }

  /**
   * Calculate mastery level based on multiple factors
   * @param {Object} learningData - User's learning data for a topic
   * @returns {Object} Mastery information
   */
  calculateMastery(learningData) {
    const {
      avgFeedbackScore = 0,
      quizScores = [],
      timeSpent = 0,
      reviewCount = 0,
      lastReviewQuality = 0,
      correctAnswers = 0,
      totalQuestions = 0
    } = learningData;

    // Weight different factors
    const weights = {
      feedback: 0.3,
      quiz: 0.4,
      retention: 0.2,
      engagement: 0.1
    };

    // Calculate component scores (0-100)
    const feedbackScore = Math.min(100, (avgFeedbackScore / 5) * 100);
    const quizScore = quizScores.length > 0 
      ? quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length
      : 0;
    const retentionScore = totalQuestions > 0 
      ? (correctAnswers / totalQuestions) * 100
      : Math.min(100, lastReviewQuality * 20);
    const engagementScore = Math.min(100, Math.log(timeSpent + 1) * 10);

    // Calculate weighted mastery score
    const masteryScore = Math.round(
      feedbackScore * weights.feedback +
      quizScore * weights.quiz +
      retentionScore * weights.retention +
      engagementScore * weights.engagement
    );

    // Determine mastery level
    let level = 'beginner';
    if (masteryScore >= this.masteryThresholds.expert) {
      level = 'expert';
    } else if (masteryScore >= this.masteryThresholds.advanced) {
      level = 'advanced';
    } else if (masteryScore >= this.masteryThresholds.intermediate) {
      level = 'intermediate';
    }

    return {
      score: Math.max(0, Math.min(100, masteryScore)),
      level,
      components: {
        feedback: Math.round(feedbackScore),
        quiz: Math.round(quizScore),
        retention: Math.round(retentionScore),
        engagement: Math.round(engagementScore)
      },
      confidence: this.calculateConfidence(learningData)
    };
  }

  /**
   * Calculate confidence in mastery assessment
   * @param {Object} learningData - User's learning data
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(learningData) {
    const {
      reviewCount = 0,
      quizScores = [],
      timeSpent = 0
    } = learningData;

    // More data points = higher confidence
    const dataPoints = reviewCount + quizScores.length;
    const timeBonus = Math.min(1, timeSpent / 3600); // 1 hour = max bonus
    
    return Math.min(1, (dataPoints * 0.1) + timeBonus * 0.3);
  }
}

/**
 * Feedback-based Recommendation Engine
 */
export class RecommendationEngine {
  constructor() {
    this.masteryCalculator = new MasteryCalculator();
    this.spacedRepetition = new SpacedRepetitionSM2();
  }

  /**
   * Generate personalized recommendations based on user feedback and performance
   * @param {string} userId - User ID
   * @param {Array} userTopics - User's topic history with performance data
   * @param {Array} availableTopics - All available topics
   * @returns {Array} Prioritized recommendations with reasoning
   */
  async recommendBasedOnFeedback(userId, userTopics, availableTopics) {
    const recommendations = [];

    // 1. Find topics that need review (spaced repetition)
    const reviewDue = userTopics
      .filter(topic => this.spacedRepetition.isDueForReview(topic))
      .map(topic => ({
        ...topic,
        type: 'review',
        priority: this.calculateReviewPriority(topic),
        reasoning: `Due for review - last studied ${this.getDaysAgo(topic.lastReviewDate)} days ago`
      }));

    // 2. Find topics with low mastery that need strengthening
    const needsStrengthening = userTopics
      .filter(topic => {
        const mastery = this.masteryCalculator.calculateMastery(topic);
        return mastery.score < 60; // Below advanced level
      })
      .map(topic => {
        const mastery = this.masteryCalculator.calculateMastery(topic);
        return {
          ...topic,
          type: 'strengthen',
          priority: (60 - mastery.score) / 60, // Higher priority for lower mastery
          reasoning: `Mastery level: ${mastery.level} (${mastery.score}%) - strengthen foundational knowledge`
        };
      });

    // 3. Find complementary topics based on learning patterns
    const complementary = this.findComplementaryTopics(userTopics, availableTopics)
      .map(topic => ({
        ...topic,
        type: 'complement',
        priority: topic.relevanceScore,
        reasoning: `Complements your interests in ${topic.relatedTopics.join(', ')}`
      }));

    // 4. Find advancement topics (next level topics)
    const advancement = this.findAdvancementTopics(userTopics, availableTopics)
      .map(topic => ({
        ...topic,
        type: 'advancement',
        priority: topic.readinessScore,
        reasoning: `Ready to advance - strong foundation in prerequisites`
      }));

    // Combine and sort recommendations
    recommendations.push(...reviewDue, ...needsStrengthening, ...complementary, ...advancement);
    
    // Sort by priority (highest first) and limit results
    return recommendations
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10)
      .map((rec, index) => ({ ...rec, rank: index + 1 }));
  }

  /**
   * Calculate priority for review recommendations
   * @param {Object} topic - Topic data
   * @returns {number} Priority score (0-1)
   */
  calculateReviewPriority(topic) {
    const daysSinceReview = this.getDaysAgo(topic.lastReviewDate);
    const masteryScore = this.masteryCalculator.calculateMastery(topic).score;
    
    // Higher priority for:
    // - More days overdue
    // - Lower mastery (more likely to forget)
    const overdueFactor = Math.min(1, daysSinceReview / 30); // Max 30 days
    const forgettingFactor = (100 - masteryScore) / 100;
    
    return (overdueFactor * 0.6) + (forgettingFactor * 0.4);
  }

  /**
   * Find complementary topics based on user's learning patterns
   * @param {Array} userTopics - User's studied topics
   * @param {Array} availableTopics - All available topics
   * @returns {Array} Complementary topics with relevance scores
   */
  findComplementaryTopics(userTopics, availableTopics) {
    // This is a simplified implementation
    // In a real system, you'd use topic embeddings, semantic similarity, etc.
    
    const userTopicNames = userTopics.map(t => t.topic_name.toLowerCase());
    const complementary = [];

    availableTopics.forEach(topic => {
      if (!userTopicNames.includes(topic.name.toLowerCase())) {
        // Simple keyword-based relevance (in practice, use embeddings)
        const relevanceScore = this.calculateTopicRelevance(topic, userTopics);
        
        if (relevanceScore > 0.3) {
          complementary.push({
            ...topic,
            relevanceScore,
            relatedTopics: userTopics
              .filter(ut => this.areTopicsRelated(ut.topic_name, topic.name))
              .map(ut => ut.topic_name)
              .slice(0, 3)
          });
        }
      }
    });

    return complementary;
  }

  /**
   * Find advancement topics user is ready for
   * @param {Array} userTopics - User's studied topics
   * @param {Array} availableTopics - All available topics
   * @returns {Array} Topics user is ready to advance to
   */
  findAdvancementTopics(userTopics, availableTopics) {
    const strongTopics = userTopics.filter(topic => {
      const mastery = this.masteryCalculator.calculateMastery(topic);
      return mastery.score >= 70; // Advanced level
    });

    return availableTopics
      .filter(topic => !userTopics.some(ut => ut.topic_name.toLowerCase() === topic.name.toLowerCase()))
      .map(topic => ({
        ...topic,
        readinessScore: this.calculateReadinessScore(topic, strongTopics)
      }))
      .filter(topic => topic.readinessScore > 0.4);
  }

  // Helper methods
  getDaysAgo(date) {
    const now = new Date();
    const past = new Date(date);
    return Math.floor((now - past) / (1000 * 60 * 60 * 24));
  }

  calculateTopicRelevance(topic, userTopics) {
    // Simplified relevance calculation
    // In practice, use semantic embeddings
    let relevance = 0;
    const topicWords = topic.name.toLowerCase().split(/\s+/);
    
    userTopics.forEach(userTopic => {
      const userWords = userTopic.topic_name.toLowerCase().split(/\s+/);
      const overlap = topicWords.filter(word => userWords.includes(word)).length;
      relevance += overlap / Math.max(topicWords.length, userWords.length);
    });
    
    return Math.min(1, relevance / userTopics.length);
  }

  areTopicsRelated(topic1, topic2) {
    // Simple word overlap check
    const words1 = topic1.toLowerCase().split(/\s+/);
    const words2 = topic2.toLowerCase().split(/\s+/);
    return words1.some(word => words2.includes(word));
  }

  calculateReadinessScore(topic, strongTopics) {
    // Calculate how ready the user is for this topic based on their strong areas
    return Math.min(1, this.calculateTopicRelevance(topic, strongTopics) * 1.5);
  }
}

/**
 * Learning Decay Model
 * Models how knowledge decays over time without review
 */
export class LearningDecayModel {
  constructor() {
    this.decayRate = 0.1; // Configurable decay rate
  }

  /**
   * Calculate current knowledge retention based on time since last review
   * @param {number} initialMastery - Initial mastery level (0-100)
   * @param {Date} lastReviewDate - Date of last review
   * @param {number} reviewCount - Number of previous reviews (affects decay)
   * @returns {number} Current estimated mastery level
   */
  calculateRetention(initialMastery, lastReviewDate, reviewCount = 1) {
    const daysSinceReview = this.getDaysAgo(lastReviewDate);
    
    // More reviews = slower decay (better retention)
    const retentionFactor = Math.min(1, Math.log(reviewCount + 1) / 3);
    const adjustedDecayRate = this.decayRate * (1 - retentionFactor);
    
    // Exponential decay model
    const retention = initialMastery * Math.exp(-adjustedDecayRate * daysSinceReview);
    
    return Math.max(0, Math.min(100, retention));
  }

  getDaysAgo(date) {
    const now = new Date();
    const past = new Date(date);
    return Math.floor((now - past) / (1000 * 60 * 60 * 24));
  }
}

// Export instances for easy use
export const spacedRepetition = new SpacedRepetitionSM2();
export const masteryCalculator = new MasteryCalculator();
export const recommendationEngine = new RecommendationEngine();
export const learningDecay = new LearningDecayModel(); 