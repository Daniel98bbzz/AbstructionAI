import { OpenAI } from 'openai';
import { supabase } from '../lib/supabaseClient.js';

class FeedbackProcessor {
  constructor(openaiClient) {
    this.openai = openaiClient;
  }

  /**
   * Classify free-text feedback using GPT (OpenAI)
   * @param {string} feedbackText - The user's feedback
   * @returns {Promise<string>} - The predicted category
   */
  async classifyFeedbackWithGPT(feedbackText) {
    const prompt = `Classify the following user feedback into one of these pedagogical categories: positive, negative, neutral, confused, request_example, delighted, frustrated.\n\nFeedback: "${feedbackText}"\n\nCategory:`;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for classifying pedagogical feedback.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 10,
        temperature: 0
      });
      const category = completion.choices?.[0]?.message?.content?.trim().toLowerCase() || 'neutral';
      return category;
    } catch (error) {
      console.error('[FeedbackProcessor] Error classifying feedback:', error);
      return 'neutral';
    }
  }

  /**
   * Process feedback: classify and return structured result
   * @param {string} responseId
   * @param {number} rating
   * @param {string} comments
   * @param {string} userId
   * @param {Object} responseData
   * @param {string} originalQuery
   * @param {Object} openai
   * @returns {Promise<object>} - Enhanced feedback processing result
   */
  async processFeedback(responseId, rating, comments, userId, responseData, originalQuery, openai) {
    console.log('[FeedbackProcessor] Processing comprehensive feedback...');
    
    const result = {
      responseId,
      rating,
      comments,
      userId,
      originalQuery,
      timestamp: new Date().toISOString()
    };
    
    // Classify text feedback if provided
    if (comments && comments.trim() !== '') {
      console.log('[FeedbackProcessor] Classifying text feedback...');
      result.classification = await this.classifyFeedbackWithGPT(comments);
      result.original = comments;
    }
    
    // Store feedback in database for learning
    if (responseData && responseData.crowd_wisdom && responseData.crowd_wisdom.template_id) {
      console.log('[FeedbackProcessor] Storing feedback for template learning...');
      
      try {
        const { data, error } = await supabase.from('template_feedback_log').insert({
          template_id: responseData.crowd_wisdom.template_id,
          response_id: responseId,
          user_id: userId,
          rating: rating,
          feedback_text: comments,
          feedback_classification: result.classification,
          query: originalQuery,
          created_at: new Date().toISOString()
        });
        
        if (error) {
          console.error('[FeedbackProcessor] Error storing feedback:', error);
        } else {
          console.log('[FeedbackProcessor] Feedback stored successfully for template learning');
          result.stored_for_learning = true;
        }
      } catch (dbError) {
        console.error('[FeedbackProcessor] Database error storing feedback:', dbError);
      }
    }
    
    return result;
  }
}

export default FeedbackProcessor; 