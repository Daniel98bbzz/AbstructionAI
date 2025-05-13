/**
 * ConversationAnalyzer
 * Analyzes user messages to detect implicit feedback and learning patterns using AI
 */
class ConversationAnalyzer {
  constructor() {
    // No hardcoded patterns needed, using AI analysis
  }

  /**
   * Analyze a user message for implicit feedback using AI
   * @param {string} message - The user's message
   * @param {object} previousResponse - The previous AI response (for context)
   * @returns {object} Analysis results containing detected feedback
   */
  async analyzeMessage(message, previousResponse = null) {
    // Default analysis if we can't access the AI
    const defaultAnalysis = {
      hasFeedback: false,
      sentiment: 'neutral',
      understandingLevel: null,
      preferenceUpdates: [],
      detectedStyles: [],
      technicalDepthChange: 0,
      notes: []
    };

    try {
      // Prepare context for the AI analysis
      const previousContent = previousResponse ? 
        (previousResponse.explanation || previousResponse.content || 'No previous response available') : 
        'This is the first message in the conversation.';

      // Simple heuristic check for very short messages that are unlikely to contain feedback
      if (message.length < 5) {
        return defaultAnalysis;
      }

      // Import OpenAI at runtime to avoid circular dependencies
      const { openai } = global;
      
      // If OpenAI isn't available in the global context, fall back to heuristics
      if (!openai) {
        console.warn('OpenAI not available, falling back to basic heuristics');
        return this.fallbackAnalysis(message);
      }

      // Call OpenAI API to analyze the message
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You analyze user messages for implicit feedback about explanations. Identify:
1. Sentiment (positive/negative/neutral)
2. Understanding level (understood/confused/neutral)
3. Learning style preferences (visual, examples, analogies, practical)
4. Technical depth preference change (-10 to +10, where negative means simpler)
5. Any domains or topics mentioned (that could be used for analogies)

Return JSON with these fields only.`
          },
          {
            role: "user", 
            content: `Previous AI explanation: "${previousContent.substring(0, 500)}${previousContent.length > 500 ? '...' : ''}"

User response: "${message}"

Analyze if this message contains implicit or explicit feedback about the explanation. Focus on if the user understood, preferred a different approach, or mentioned topics they're interested in.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500
      });
      
      // Parse the AI response
      const aiAnalysis = JSON.parse(completion.choices[0].message.content);
      
      // Transform AI analysis into our standard format
      const analysis = {
        hasFeedback: 
          aiAnalysis.sentiment !== 'neutral' || 
          aiAnalysis.understanding_level !== 'neutral' ||
          (aiAnalysis.technical_depth_change !== 0 && aiAnalysis.technical_depth_change !== undefined),
        sentiment: aiAnalysis.sentiment || 'neutral',
        understandingLevel: aiAnalysis.understanding_level || null,
        preferenceUpdates: aiAnalysis.preference_updates || [],
        detectedStyles: aiAnalysis.learning_styles || [],
        technicalDepthChange: aiAnalysis.technical_depth_change || 0,
        notes: aiAnalysis.notes || [],
        mentionedDomains: aiAnalysis.mentioned_domains || []
      };

      console.log('AI Analysis of user message:', analysis);
      return analysis;
    } catch (error) {
      console.error('Error in AI analysis of message:', error);
      // Fall back to simple heuristic analysis if AI fails
      return this.fallbackAnalysis(message);
    }
  }

  /**
   * Simple fallback analysis when AI is not available
   * @param {string} message - The user's message
   * @returns {object} Basic analysis results
   */
  fallbackAnalysis(message) {
    const analysis = {
      hasFeedback: false,
      sentiment: 'neutral',
      understandingLevel: null,
      preferenceUpdates: [],
      detectedStyles: [],
      technicalDepthChange: 0,
      notes: []
    };

    // Simple patterns for fallback
    if (message.match(/don['']?t understand|confused|unclear|lost/i)) {
      analysis.hasFeedback = true;
      analysis.sentiment = 'negative';
      analysis.understandingLevel = 'confused';
      analysis.notes.push('User indicated confusion');
    } else if (message.match(/makes sense|understand|got it|thanks|helpful/i)) {
      analysis.hasFeedback = true;
      analysis.sentiment = 'positive';
      analysis.understandingLevel = 'understood';
      analysis.notes.push('User indicated understanding');
    }

    // Simple technical depth detection
    if (message.match(/simpler|easier|too complex|too technical/i)) {
      analysis.hasFeedback = true;
      analysis.technicalDepthChange = -10;
      analysis.notes.push('User requested simpler explanation');
    } else if (message.match(/more detail|more technical|deeper|advanced/i)) {
      analysis.hasFeedback = true;
      analysis.technicalDepthChange = 10;
      analysis.notes.push('User requested more technical detail');
    }

    return analysis;
  }

  /**
   * Generate adaptive prompt updates based on analysis
   * @param {object} analysis - The message analysis results
   * @param {object} userProfile - The user's current profile
   * @returns {object} Prompt updates to apply
   */
  generatePromptUpdates(analysis, userProfile) {
    const updates = {
      preferences: {},
      instructions: [],
      topics: {}
    };

    if (!analysis.hasFeedback) {
      return updates;
    }

    // Update technical depth preference
    if (analysis.technicalDepthChange !== 0) {
      const currentDepth = userProfile.technical_depth || 50;
      updates.preferences.technical_depth = Math.max(
        0, 
        Math.min(100, currentDepth + analysis.technicalDepthChange)
      );
    }

    // Add style preferences
    if (analysis.detectedStyles.length > 0) {
      updates.preferences.preferred_styles = analysis.detectedStyles;
    }

    // Add topic domains
    if (analysis.mentionedDomains && analysis.mentionedDomains.length > 0) {
      if (analysis.sentiment === 'positive') {
        updates.topics.preferred = analysis.mentionedDomains;
      } else if (analysis.sentiment === 'negative') {
        updates.topics.avoided = analysis.mentionedDomains;
      }
    }

    // Generate specific instructions based on feedback
    if (analysis.understandingLevel === 'confused') {
      updates.instructions.push('Explain concepts more clearly with simpler terms');
      if (analysis.technicalDepthChange < 0) {
        updates.instructions.push('Use more basic explanations with fewer technical terms');
      }
    }

    if (analysis.understandingLevel === 'understood' && analysis.technicalDepthChange > 0) {
      updates.instructions.push('Include more technical details in explanations');
    }

    // Add any specific instructions from the AI analysis
    if (analysis.preferenceUpdates && analysis.preferenceUpdates.length > 0) {
      updates.instructions = [...updates.instructions, ...analysis.preferenceUpdates];
    }

    return updates;
  }
}

export default ConversationAnalyzer; 