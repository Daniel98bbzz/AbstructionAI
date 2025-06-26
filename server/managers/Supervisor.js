import { supabase } from '../lib/supabaseClient.js';
import { OpenAI } from 'openai';

class Supervisor {
  constructor() {
    // No direct initialization required
  }

  // Template enhancement methods removed (were part of crowd wisdom system)

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

  // Crowd wisdom processing methods removed

  /**
   * Evaluate an AI-generated answer using GPT for pedagogical quality
   * @param {string} user_query
   * @param {string} ai_answer
   * @param {string} template_id
   * @param {number} cluster_id
   * @param {string} interaction_id (optional)
   * @returns {Promise<Object|null>} Parsed score JSON or null on error
   */
  async evaluateAnswerWithGPT(user_query, ai_answer, template_id, cluster_id, interaction_id = null, openaiInstance = null) {
    const openai = openaiInstance || (typeof OpenAI !== 'undefined' ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null);
    if (!openai) {
      console.error('[Supervisor] OpenAI client not available');
      return null;
    }
    const prompt = `You are an expert educational evaluator. Rate the following AI-generated answer to the user's question on a scale of 1–5 for each of the following criteria: Clarity, Relevance, Educational Value, and Accuracy.\n\nReturn your answer as a JSON object with this format:\n{"clarity": X, "relevance": X, "educational_value": X, "accuracy": X}\n\nQuestion: ${user_query}\nAI Answer: ${ai_answer}`;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 200
      });
      let scoreJson = {};
      try {
        scoreJson = JSON.parse(completion.choices[0].message.content);
      } catch (err) {
        console.error('[Supervisor] Failed to parse GPT evaluation JSON:', err, completion.choices[0].message.content);
        return null;
      }
      // Store in template_evaluation_log
      const { error } = await supabase
        .from('template_evaluation_log')
        .insert({
          template_id,
          cluster_id,
          interaction_id,
          score_json: scoreJson
        });
      if (error) {
        console.error('[Supervisor] Error saving template evaluation log:', error);
      }
      return scoreJson;
    } catch (error) {
      console.error('[Supervisor] Error in evaluateAnswerWithGPT:', error);
      return null;
    }
  }

  /**
   * Classify user feedback into pedagogical categories using GPT
   * @param {string} feedbackText
   * @param {object} openaiInstance (optional)
   * @returns {Promise<string>} The feedback category
   */
  async classifyVerbalFeedback(feedbackText, openaiInstance = null) {
    if (!feedbackText || feedbackText.trim() === '') {
      return 'no_feedback';
    }
    const openai = openaiInstance || (typeof OpenAI !== 'undefined' ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null);
    if (!openai) {
      console.error('[Supervisor] OpenAI client not available');
      return 'no_feedback';
    }
    const prompt = `Classify the following user feedback as one of the following categories:\n"positive", "negative", "neutral", "confused", "request_example", "delighted", "frustrated".\n\nReturn only the category.\nFeedback: "${feedbackText}"`;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 20
      });
      // Extract the category (should be a single word)
      const category = completion.choices[0].message.content.trim().toLowerCase();
      return category;
    } catch (error) {
      console.error('[Supervisor] Error in classifyVerbalFeedback:', error);
      return 'no_feedback';
    }
  }
}

export default Supervisor;