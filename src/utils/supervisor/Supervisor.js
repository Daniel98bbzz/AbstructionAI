/**
 * Supervisor class for analyzing user queries
 */
class Supervisor {
  constructor(confidenceThreshold = 0.5) {
    // Patterns that indicate a general question
    this.generalQuestionPatterns = {
      vagueTerms: /\b(everything|all|always|never|anything|anyone|anywhere)\b/i,
      broadQuestions: /^(what|how|why|when|where|who|which) (is|are|was|were|will|would|can|could|should|shall|may|might|must) /i,
      shortQuestions: /^.{1,20}\?$/,
      missingContext: /\b(it|this|that|these|those)\b/i
    };

    // Minimum length for a specific question
    this.minSpecificLength = 30;
    
    // Configurable confidence threshold
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Set the confidence threshold for deepening
   * @param {number} threshold - New threshold value (0-1)
   */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = threshold;
    console.log(`Supervisor: Confidence threshold set to ${threshold}`);
  }

  /**
   * Analyze a query to determine if it needs deepening
   * @param {string} query - The user's query
   * @returns {Object} Analysis result
   */
  analyzeQuery(query) {
    console.log('Supervisor: Analyzing query:', query);
    
    const analysis = {
      needsDeepening: false,
      indicators: [],
      confidence: 0,
      patterns: []
    };

    // Check for vague terms
    if (this.generalQuestionPatterns.vagueTerms.test(query)) {
      analysis.indicators.push('vagueTerms');
      analysis.patterns.push('vagueTerms');
      analysis.confidence += 0.3;
      console.log('Supervisor: Found vague terms (+0.3)');
    }

    // Check for broad questions
    if (this.generalQuestionPatterns.broadQuestions.test(query)) {
      analysis.indicators.push('broadQuestion');
      analysis.patterns.push('broadQuestion');
      analysis.confidence += 0.2;
      console.log('Supervisor: Found broad question (+0.2)');
    }

    // Check for short questions
    if (this.generalQuestionPatterns.shortQuestions.test(query)) {
      analysis.indicators.push('shortQuestion');
      analysis.patterns.push('shortQuestion');
      analysis.confidence += 0.2;
      console.log('Supervisor: Found short question (+0.2)');
    }

    // Check for missing context
    if (this.generalQuestionPatterns.missingContext.test(query)) {
      analysis.indicators.push('missingContext');
      analysis.patterns.push('missingContext');
      analysis.confidence += 0.2;
      console.log('Supervisor: Found missing context (+0.2)');
    }

    // Check question length
    if (query.length < this.minSpecificLength) {
      analysis.indicators.push('shortLength');
      analysis.patterns.push('shortLength');
      analysis.confidence += 0.1;
      console.log('Supervisor: Found short length (+0.1)');
    }

    // Set needsDeepening based on confidence threshold
    analysis.needsDeepening = analysis.confidence >= this.confidenceThreshold;
    
    console.log('Supervisor: Analysis complete:', {
      confidence: analysis.confidence,
      threshold: this.confidenceThreshold,
      needsDeepening: analysis.needsDeepening,
      indicators: analysis.indicators
    });

    return analysis;
  }
}

export default Supervisor; 