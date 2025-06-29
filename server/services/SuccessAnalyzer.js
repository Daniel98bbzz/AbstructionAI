import { OpenAI } from 'openai';
import { supabase } from '../lib/supabaseClient.js';

class SuccessAnalyzer {
  constructor(openaiClient) {
    this.openai = openaiClient;
    this.positivePatterns = [
      // Understanding indicators
      /(?:i\s+)?understand(?:\s+now)?/i,
      /(?:that\s+)?makes\s+sense/i,
      /(?:now\s+)?i\s+get\s+it/i,
      /(?:oh\s+)?i\s+see/i,
      /got\s+it/i,
      
      // Gratitude indicators  
      /thank\s*(?:s|you)/i,
      /(?:that\s+)?(?:was\s+)?(?:really\s+)?helpful/i,
      /(?:great\s+)?(?:explanation|answer)/i,
      /(?:perfect|excellent|amazing|wonderful)/i,
      /appreciate/i,
      
      // Clarity indicators
      /(?:much\s+)?(?:more\s+)?clear(?:er)?\s*(?:now)?/i,
      /(?:easy\s+to\s+understand|straightforward)/i,
      /(?:well\s+)?explained/i,
      /good\s+(?:analogy|example)/i,
      
      // Satisfaction indicators
      /exactly\s+what\s+i\s+(?:needed|wanted)/i,
      /(?:that\s+)?(?:really\s+)?helped/i,
      /(?:very\s+)?useful/i,
      /informative/i
    ];
    
    this.confidenceThreshold = 0.7;
    this.minFeedbackLength = 5;
  }

  async analyzeFeedback(feedbackText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      console.log('[CROWD WISDOM SENTIMENT] 🔍 Starting sentiment analysis for feedback:', {
        feedback: feedbackText,
        length: feedbackText.length,
        sessionId,
        userId
      });
      
      await this.logEvent('INFO', '🔍 Starting comprehensive feedback sentiment analysis', {
        feedbackText: feedbackText,
        feedbackLength: feedbackText.length,
        confidenceThreshold: this.confidenceThreshold,
        sessionId,
        userId
      });

      if (!feedbackText || feedbackText.trim().length < this.minFeedbackLength) {
        console.log('[CROWD WISDOM SENTIMENT] ❌ Feedback too short - filtering out');
        return {
          isPositive: false,
          confidence: 0,
          method: 'length_filter',
          patterns: [],
          gptAnalysis: null
        };
      }

      console.log('[CROWD WISDOM SENTIMENT] 🔤 Running pattern-based analysis...');
      const patternResult = this.analyzeWithPatterns(feedbackText, sessionId);
      console.log('[CROWD WISDOM SENTIMENT] 📊 Pattern analysis result:', {
        confidence: patternResult.confidence,
        matchedPatterns: patternResult.patterns.length,
        patterns: patternResult.patterns.map(p => p.match)
      });

      console.log('[CROWD WISDOM SENTIMENT] 🤖 Running GPT-4o sentiment analysis...');
      const gptResult = await this.analyzeWithGPT(feedbackText, sessionId, userId);
      console.log('[CROWD WISDOM SENTIMENT] 🧠 GPT analysis result:', {
        isPositive: gptResult.isPositive,
        confidence: gptResult.confidence,
        reasoning: gptResult.reasoning,
        indicators: gptResult.indicators
      });

      console.log('[CROWD WISDOM SENTIMENT] ⚖️ Combining analysis results...');
      const combinedConfidence = this.combineAnalysisResults(patternResult, gptResult);
      const isPositive = combinedConfidence >= this.confidenceThreshold;

      console.log('[CROWD WISDOM SENTIMENT] 🎯 Final sentiment decision:', {
        finalSentiment: isPositive ? 'POSITIVE' : 'NEGATIVE',
        combinedConfidence: combinedConfidence,
        threshold: this.confidenceThreshold,
        meetsThreshold: combinedConfidence >= this.confidenceThreshold,
        patternConfidence: patternResult.confidence,
        gptConfidence: gptResult.confidence,
        breakdown: {
          patternWeight: '40%',
          gptWeight: '60%',
          patternContribution: (patternResult.confidence * 0.4).toFixed(3),
          gptContribution: (gptResult.confidence * 0.6).toFixed(3)
        }
      });

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', '✅ Feedback sentiment analysis completed', {
        feedbackText: feedbackText,
        finalSentiment: isPositive ? 'POSITIVE' : 'NEGATIVE',
        combinedConfidence,
        patternAnalysis: {
          confidence: patternResult.confidence,
          matchedPatterns: patternResult.patterns.length,
          patterns: patternResult.patterns.map(p => p.match)
        },
        gptAnalysis: {
          isPositive: gptResult.isPositive,
          confidence: gptResult.confidence,
          reasoning: gptResult.reasoning,
          indicators: gptResult.indicators
        },
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        isPositive,
        confidence: combinedConfidence,
        method: 'combined',
        patterns: patternResult.patterns,
        gptAnalysis: gptResult,
        processingTimeMs: processingTime
      };

    } catch (error) {
      console.log('[CROWD WISDOM SENTIMENT] ❌ Sentiment analysis failed:', error.message);
      await this.logEvent('ERROR', '❌ Feedback sentiment analysis failed', {
        error: error.message,
        feedbackText: feedbackText,
        sessionId,
        userId
      });

      return {
        isPositive: false,
        confidence: 0,
        method: 'error',
        error: error.message
      };
    }
  }

  analyzeWithPatterns(feedbackText, sessionId) {
    try {
      const normalizedText = feedbackText.toLowerCase().trim();
      const matchedPatterns = [];
      
      this.positivePatterns.forEach((pattern, index) => {
        const match = normalizedText.match(pattern);
        if (match) {
          matchedPatterns.push({
            pattern: pattern.source,
            match: match[0],
            index,
            position: match.index
          });
        }
      });

      let confidence = 0;
      if (matchedPatterns.length > 0) {
        confidence = Math.min(0.8, matchedPatterns.length * 0.3);
        
        const highConfidenceMatches = matchedPatterns.filter(m => 
          m.pattern.includes('thank') || 
          m.pattern.includes('understand') || 
          m.pattern.includes('perfect') ||
          m.pattern.includes('excellent')
        );
        
        if (highConfidenceMatches.length > 0) {
          confidence = Math.min(0.9, confidence + 0.2);
        }
      }

      return {
        confidence,
        patterns: matchedPatterns,
        method: 'pattern_matching'
      };

    } catch (error) {
      this.logEvent('ERROR', 'Pattern analysis error', {
        error: error.message,
        sessionId
      });
      
      return {
        confidence: 0,
        patterns: [],
        method: 'pattern_matching_error'
      };
    }
  }

  async analyzeWithGPT(feedbackText, sessionId, userId) {
    try {
      const prompt = `Analyze this user feedback for positive sentiment and understanding indicators. 
      
User feedback: "${feedbackText}"

Respond with only a JSON object containing:
{
  "isPositive": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation",
  "indicators": ["list of positive indicators found"]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at analyzing user feedback for satisfaction and understanding. Be conservative but accurate in your assessments.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const gptAnalysis = JSON.parse(response.choices[0].message.content);
      
      return {
        confidence: gptAnalysis.confidence || 0,
        isPositive: gptAnalysis.isPositive || false,
        reasoning: gptAnalysis.reasoning || '',
        indicators: gptAnalysis.indicators || [],
        method: 'gpt_analysis',
        tokensUsed: response.usage?.total_tokens || 0
      };

    } catch (error) {
      await this.logEvent('ERROR', 'GPT analysis failed', {
        error: error.message,
        sessionId,
        userId
      });

      return {
        confidence: 0.5,
        isPositive: false,
        reasoning: 'Analysis failed',
        indicators: [],
        method: 'gpt_error',
        error: error.message
      };
    }
  }

  combineAnalysisResults(patternResult, gptResult) {
    const patternWeight = 0.4;
    const gptWeight = 0.6;
    
    const combinedConfidence = 
      (patternResult.confidence * patternWeight) + 
      (gptResult.confidence * gptWeight);

    if (patternResult.confidence > 0.5 && gptResult.isPositive) {
      return Math.min(0.95, combinedConfidence + 0.1);
    }

    if (Math.abs(patternResult.confidence - gptResult.confidence) > 0.4) {
      return combinedConfidence * 0.8;
    }

    return combinedConfidence;
  }

  /**
   * Update query assignment with feedback results
   * @param {string} assignmentId - Assignment ID
   * @param {Object} feedbackAnalysis - Feedback analysis result
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateQueryAssignmentWithFeedback(assignmentId, feedbackAnalysis, sessionId) {
    try {
      await this.logEvent('DEBUG', 'Updating query assignment with feedback results', {
        assignmentId,
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        method: feedbackAnalysis.method,
        sessionId
      });

      // Update the query assignment with feedback data
      const { error } = await supabase
        .from('crowd_wisdom_query_assignments')
        .update({
          user_feedback_positive: feedbackAnalysis.isPositive,
          feedback_confidence: feedbackAnalysis.confidence
        })
        .eq('id', assignmentId);

      if (error) {
        await this.logEvent('ERROR', 'Failed to update query assignment with feedback', {
          error: error.message,
          assignmentId,
          sessionId
        });
        return false;
      }

      await this.logEvent('INFO', 'Query assignment updated successfully with feedback', {
        assignmentId,
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error updating query assignment with feedback', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  async logEvent(level, message, metadata = {}) {
    try {
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'SuccessAnalyzer',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      console.error('[SuccessAnalyzer] Failed to log event:', error);
    }
  }
}

export default SuccessAnalyzer; 