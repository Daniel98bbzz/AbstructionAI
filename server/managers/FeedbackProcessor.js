import { OpenAI } from 'openai';

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
        model: 'gpt-3.5-turbo',
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
   * @param {string} feedbackText
   * @returns {Promise<object>} - { category, original }
   */
  async processFeedback(feedbackText) {
    const category = await this.classifyFeedbackWithGPT(feedbackText);
    return {
      category,
      original: feedbackText
    };
  }
}

export default FeedbackProcessor; 