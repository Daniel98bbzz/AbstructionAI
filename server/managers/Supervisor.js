import { supabase } from '../lib/supabaseClient.js';
import { OpenAI } from 'openai';

class Supervisor {
  constructor() {
    // No direct initialization required
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
   * Process a query using the wisdom-of-crowds logic (new implementation)
   * @param {string} query
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} openai
   * @param {boolean} useCompositeScore
   * @param {number} explorationRate
   * @returns {Promise<object>} - Returns an object with enhancedQuery, template, topic, selectionMethod
   */
  async processQueryWithCrowdWisdom(query, sessionId, userId, openai, useCompositeScore, explorationRate) {
    console.log('[Supervisor] processQueryWithCrowdWisdom called', { query, sessionId, userId, useCompositeScore, explorationRate });
    try {
      // 1. Create embedding
      const embeddingResponse = await openai.embeddings.create({
        input: query,
        model: 'text-embedding-ada-002'
      });
      const embedding = embeddingResponse.data[0].embedding;

      // 2. Cluster stage – proximity retrieval
      const { data: clusterMatch, error: clusterError } = await supabase
        .rpc('match_semantic_cluster', { embedding_vector: embedding });

      if (clusterError || !clusterMatch || clusterMatch.length === 0) {
        console.error('[Supervisor] Error matching cluster:', clusterError);
        console.warn(`[CW DEBUG] No cluster match found for query: "${query}". Fallback activated`);
        // Fallback: no cluster, use best global template
        const bestGlobal = await this.getBestGlobalTemplateUCB();
        return {
          enhancedQuery: query,
          template: bestGlobal?.templateData || 'default_template',
          topic: null,
          selectionMethod: bestGlobal ? 'global_ucb1' : 'fallback',
          cluster_id: null
        };
      }

      const match = clusterMatch[0];
      console.log(`[Supervisor] Matched semantic cluster: ID=${match.id}, similarity=${match.similarity}`);
      const cluster_id = match.id;

      // 3. Find the best template for this cluster from the UCB1 view
      console.log(`[CW DEBUG] Looking for best template for cluster ${cluster_id} (UCB1)...`);
      const { data: bestRow, error: bestRowError } = await supabase
        .from('cluster_best_template_ucb_top')
        .select('template_id, ucb1_score')
        .eq('cluster_id', cluster_id)
        .limit(1)
        .single();

      let templateData = null;
      let selectionMethod = 'ucb1';
      if (bestRow && bestRow.template_id) {
        // Fetch the actual template data
        const { data: tData, error: templateError } = await supabase
          .from('prompt_templates')
          .select('*')
          .eq('id', bestRow.template_id)
          .single();
        if (tData) {
          templateData = tData;
        } else {
          console.warn(`[CW DEBUG] Could not fetch template data for template_id ${bestRow.template_id}. Error:`, templateError?.message);
        }
      }
      if (!templateData) {
        // Fallback: use best global template by UCB1
        const bestGlobal = await this.getBestGlobalTemplateUCB();
        templateData = bestGlobal?.templateData || 'default_template';
        selectionMethod = bestGlobal ? 'global_ucb1' : 'fallback';
      }

      return {
        enhancedQuery: query,
        template: templateData,
        topic: match?.topic || null,
        selectionMethod,
        cluster_id: cluster_id
      };
    } catch (error) {
      console.error('[CW DEBUG] Error in processQueryWithCrowdWisdom:', error);
      // Fallback: use best global template by UCB1
      const bestGlobal = await this.getBestGlobalTemplateUCB();
      return {
        enhancedQuery: query,
        template: bestGlobal?.templateData || 'default_template',
        topic: null,
        selectionMethod: bestGlobal ? 'global_ucb1' : 'fallback',
        cluster_id: null
      };
    }
  }

  /**
   * Helper: Get the best global template by UCB1 (across all clusters)
   */
  async getBestGlobalTemplateUCB() {
    // Find the template with the highest UCB1 score across all clusters
    const { data: best, error } = await supabase
      .from('cluster_best_template_ucb')
      .select('template_id, ucb1_score')
      .order('ucb1_score', { ascending: false })
      .limit(1)
      .single();
    if (error || !best?.template_id) {
      console.warn('[CW DEBUG] No global best template found by UCB1. Error:', error?.message);
      return null;
    }
    // Fetch the actual template data
    const { data: tData, error: templateError } = await supabase
      .from('prompt_templates')
      .select('*')
      .eq('id', best.template_id)
      .single();
    return { templateData: tData, ucb1_score: best.ucb1_score };
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