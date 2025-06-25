import { supabase } from '../lib/supabaseClient.js';
import { OpenAI } from 'openai';

class Supervisor {
  constructor() {
    // No direct initialization required
  }

  /**
   * Apply template-based enhancements to a query
   * @param {string} originalQuery - The original user query
   * @param {Object} template - The selected template
   * @returns {Object} - Enhanced query and system instructions
   */
  applyTemplateEnhancement(originalQuery, template) {
    console.log('[Crowd Wisdom] Applying template enhancement...');
    
    if (!template || template === 'default_template') {
      console.log('[Crowd Wisdom] Using default template - no enhancement applied');
      return {
        enhancedQuery: originalQuery,
        systemEnhancement: '',
        templateApplied: false
      };
    }

    let enhancedSystemPrompt = '';
    let templateStructure = null;

    try {
      // Try to parse template_text as JSON (structured template)
      if (template.template_text && typeof template.template_text === 'string') {
        templateStructure = JSON.parse(template.template_text);
        console.log('[Crowd Wisdom] Using structured template:', templateStructure);
        
        // Apply structured template enhancements
        enhancedSystemPrompt = this.buildStructuredPromptEnhancement(templateStructure, template);
      } else {
        console.log('[Crowd Wisdom] Template is not structured JSON, treating as content guidance');
        // Use template as general guidance
        enhancedSystemPrompt = this.buildContentGuidanceEnhancement(template);
      }
    } catch (parseError) {
      console.log('[Crowd Wisdom] Template is not JSON, treating as raw content guidance');
      // Template might be raw content from auto-generated templates
      enhancedSystemPrompt = this.buildContentGuidanceEnhancement(template);
    }

    return {
      enhancedQuery: originalQuery,
      systemEnhancement: enhancedSystemPrompt,
      templateApplied: true,
      templateId: template.id,
      templateTopic: template.topic,
      templateEfficacy: template.efficacy_score
    };
  }

  /**
   * Build system prompt enhancement from structured template
   * @param {Object} structure - Parsed template structure
   * @param {Object} template - Full template object
   * @returns {string} - Enhanced system prompt additions
   */
  buildStructuredPromptEnhancement(structure, template) {
    const enhancements = [];
    
    enhancements.push('\n=== CROWD WISDOM ENHANCEMENT ===');
    enhancements.push(`This question is similar to others that worked well with this approach (Efficacy: ${template.efficacy_score?.toFixed(2)}/5.0):`);
    
    // Apply structure-based enhancements
    if (structure.structure) {
      const struct = structure.structure;
      
      if (struct.has_introduction) {
        enhancements.push('• Start with a clear, engaging introduction that sets context');
      }
      
      if (struct.has_explanation) {
        enhancements.push('• Provide a comprehensive, well-structured explanation');
      }
      
      if (struct.has_analogy) {
        enhancements.push('• Include a relatable analogy that helps clarify the concept');
      }
      
      if (struct.has_example) {
        enhancements.push('• Provide concrete, practical examples');
      }
      
      if (struct.has_key_takeaways) {
        enhancements.push('• End with clear key takeaways or summary points');
      }
      
      if (struct.is_structured === false) {
        enhancements.push('• Present information in a conversational, flowing style rather than rigid sections');
      }
    }
    
    // Add topic-specific guidance if available
    if (template.topic && template.topic !== 'general') {
      enhancements.push(`• This is a ${template.topic} question - tailor your explanation accordingly`);
    }
    
    enhancements.push('=== END ENHANCEMENT ===\n');
    
    return enhancements.join('\n');
  }

  /**
   * Build system prompt enhancement from content guidance
   * @param {Object} template - Template object with content
   * @returns {string} - Enhanced system prompt additions
   */
  buildContentGuidanceEnhancement(template) {
    const enhancements = [];
    
    enhancements.push('\n=== CROWD WISDOM ENHANCEMENT ===');
    enhancements.push(`Similar questions have been answered successfully using this approach (Efficacy: ${template.efficacy_score?.toFixed(2)}/5.0):`);
    
    // Extract guidance from template content
    if (template.template_text) {
      const content = template.template_text.substring(0, 200) + '...';
      enhancements.push(`• Reference successful approach: "${content}"`);
    }
    
    if (template.topic && template.topic !== 'general') {
      enhancements.push(`• Topic focus: ${template.topic}`);
    }
    
    enhancements.push('• Adapt this proven approach to the current question');
    enhancements.push('=== END ENHANCEMENT ===\n');
    
    return enhancements.join('\n');
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
   * Process a query with crowd wisdom enhancement
   * @param {string} query
   * @param {string} sessionId
   * @param {string} userId
   * @param {object} openai
   * @param {number} explorationRate
   * @returns {Promise<object>} - Returns an object with enhancedQuery, template, topic, selectionMethod, systemEnhancement
   */
  async processQueryWithCrowdWisdom(query, sessionId, userId, openai, explorationRate) {
    console.log('[Supervisor] processQueryWithCrowdWisdom called', { query, sessionId, userId, explorationRate });
    try {
      // 1. Create embedding
      const embeddingResponse = await openai.embeddings.create({
        input: query,
        model: 'text-embedding-ada-002'
      });
      const embedding = embeddingResponse.data[0].embedding;

      // 🎯 NEW: CLASSIFY TOPIC FIRST (before clustering)
      console.log('[Topic-Based Clustering] Classifying query topic...');
      const queryTopic = await this.classifyQueryTopic(query, openai);
      console.log(`[Topic-Based Clustering] Query classified as topic: "${queryTopic}"`);

      // 2. Enhanced cluster stage – topic-aware clustering with fallback to similarity
      let cluster_id = null;
      let isNewCluster = false;
      let clusteringMethod = 'similarity'; // Track how cluster was assigned

      // 🚀 STRATEGY 1: Check for existing clusters with the same topic
      if (queryTopic && queryTopic !== 'general') {
        const existingTopicCluster = await this.findMostPopulatedClusterForTopic(queryTopic);
        
        if (existingTopicCluster) {
          cluster_id = existingTopicCluster.cluster_id;
          clusteringMethod = 'topic_based';
          console.log(`[Topic-Based Clustering] ✅ Assigned to existing topic cluster: ID=${cluster_id} (topic: ${queryTopic}, size: ${existingTopicCluster.size})`);
        }
      }

      // 🚀 STRATEGY 2: If no topic cluster found, try similarity-based matching
      if (!cluster_id) {
        const SIMILARITY_THRESHOLD = 0.75; // Cosine similarity threshold for cluster matching
        const { data: clusterMatch, error: clusterError } = await supabase
          .rpc('match_semantic_cluster', { embedding_vector: embedding });

        if (clusterError || !clusterMatch || clusterMatch.length === 0) {
          console.log(`[Topic-Based Clustering] No similarity match found for query: "${query}"`);
        } else {
          const match = clusterMatch[0];
          const similarity = match.similarity;
          
          console.log(`[Topic-Based Clustering] Similarity match found: ID=${match.id}, similarity=${similarity.toFixed(3)}`);
          
          // Check if similarity is above threshold
          if (similarity >= SIMILARITY_THRESHOLD) {
            cluster_id = match.id;
            clusteringMethod = 'similarity';
            console.log(`[Topic-Based Clustering] ✅ Assigned via similarity: cluster ${cluster_id} (similarity: ${similarity.toFixed(3)})`);
          } else {
            console.log(`[Topic-Based Clustering] Similarity ${similarity.toFixed(3)} below threshold ${SIMILARITY_THRESHOLD}`);
          }
        }
      }

      // 🚀 STRATEGY 3: Create new cluster only if both topic-based and similarity-based matching failed
      if (!cluster_id) {
        console.log(`[Topic-Based Clustering] Creating new cluster for topic "${queryTopic}"`);
        cluster_id = await this.createRealtimeCluster(embedding, query, queryTopic);
        isNewCluster = true;
        clusteringMethod = 'new_cluster';
      }

      // 3. Find the best template for this cluster from the UCB1 view
      console.log(`[CW DEBUG] Looking for best template for cluster ${cluster_id} (method: ${clusteringMethod})...`);
      
      let templateData = null;
      let selectionMethod = 'ucb1';
      
      if (!isNewCluster) {
        // For existing clusters, try to find existing templates
        const { data: bestRow, error: bestRowError } = await supabase
          .from('cluster_best_template_ucb_top')
          .select('template_id, ucb1_score')
          .eq('cluster_id', cluster_id)
          .limit(1)
          .single();

        if (bestRow && bestRow.template_id) {
          // Fetch the actual template data
          const { data: tData, error: templateError } = await supabase
            .from('prompt_templates')
            .select('*')
            .eq('id', bestRow.template_id)
            .single();
          if (tData) {
            templateData = tData;
            console.log(`[Topic-Based Clustering] Found existing template for cluster ${cluster_id}: ${tData.id}`);
          } else {
            console.warn(`[CW DEBUG] Could not fetch template data for template_id ${bestRow.template_id}. Error:`, templateError?.message);
          }
        }
      }
      
      if (!templateData) {
        // For new clusters, don't apply irrelevant templates
        if (isNewCluster) {
          console.log(`[Topic-Based Clustering] New cluster ${cluster_id} created - starting fresh without template contamination`);
          templateData = 'default_template';
          selectionMethod = 'new_cluster_fresh';
        } else {
          // For existing clusters without templates, use best global template by UCB1
          const bestGlobal = await this.getBestGlobalTemplateUCB();
          templateData = bestGlobal?.templateData || 'default_template';
          selectionMethod = bestGlobal ? 'global_ucb1' : 'fallback';
        }
      }

      // 4. APPLY TEMPLATE ENHANCEMENT
      const enhancement = this.applyTemplateEnhancement(query, templateData);
      console.log(`[Topic-Based Clustering] Template enhancement applied: ${enhancement.templateApplied}`);
      if (enhancement.templateApplied) {
        console.log(`[Topic-Based Clustering] Enhanced query with template ID: ${enhancement.templateId} (Efficacy: ${enhancement.templateEfficacy})`);
      }

      return {
        enhancedQuery: enhancement.enhancedQuery,
        systemEnhancement: enhancement.systemEnhancement,
        template: templateData,
        topic: queryTopic, // Return the classified topic
        selectionMethod,
        cluster_id: cluster_id,
        templateApplied: enhancement.templateApplied,
        isNewCluster: isNewCluster,
        clusteringMethod: clusteringMethod // New: track how clustering was done
      };
    } catch (error) {
      console.error('[Topic-Based Clustering] Error in processQueryWithCrowdWisdom:', error);
      // Fallback: use best global template by UCB1
      const bestGlobal = await this.getBestGlobalTemplateUCB();
      const enhancement = this.applyTemplateEnhancement(query, bestGlobal?.templateData || 'default_template');
      return {
        enhancedQuery: enhancement.enhancedQuery,
        systemEnhancement: enhancement.systemEnhancement,
        template: bestGlobal?.templateData || 'default_template',
        topic: null,
        selectionMethod: bestGlobal ? 'global_ucb1' : 'fallback',
        cluster_id: null,
        templateApplied: enhancement.templateApplied,
        isNewCluster: false,
        clusteringMethod: 'error_fallback'
      };
    }
  }

  /**
   * 🎯 NEW: Classify query topic using OpenAI (similar to main server logic)
   * @param {string} query - The user query to classify
   * @param {object} openai - OpenAI client instance
   * @returns {Promise<string>} - The classified topic name
   */
  async classifyQueryTopic(query, openai) {
    try {
      // Get existing topics from database (same as main server logic)
      const { data: existingTopics, error: topicsError } = await supabase
        .from('topics')
        .select('name, description')
        .eq('is_active', true);
      
      if (topicsError) {
        console.error('[Topic Classification] Error fetching topics:', topicsError);
        return 'general';
      }
      
      const topicsList = existingTopics?.map(t => t.name) || [];
      const topicsContext = existingTopics?.map(t => `${t.name}: ${t.description}`).join('\n') || '';
      
      // Create topic classification prompt (same as main server)
      const topicClassificationPrompt = `You are a topic classifier for an educational AI tutoring system. 
Analyze the following query to determine the most appropriate topic.

EXISTING TOPICS:
${topicsContext}

USER QUERY: ${query}

CLASSIFICATION RULES:
1. If the query fits one of the existing topics above, respond with EXACTLY that topic name
2. If no existing topic fits well, create a new descriptive topic name (use underscores, lowercase)
3. NEVER respond with "no_specific_topic" - always find or create a meaningful topic
4. For mathematical queries (formulas, equations, calculations, math concepts), use "mathematics"
5. For programming/coding queries, use "computer_science" or "programming"
6. For science queries, use the specific science field (physics, chemistry, biology)
7. Only use "general" for truly non-academic queries like greetings, thanks, or casual conversation
8. Be specific: prefer "linear_algebra" over "mathematics" if the query is specifically about linear algebra

EXAMPLES:
- "what is root formula in math" → mathematics
- "explain calculus derivatives" → calculus  
- "how do algorithms work" → algorithms
- "thank you" → general
- "hello" → general
- "i don't understand" → general
- "explain photosynthesis" → biology
- "how to code in python" → programming

TOPIC:`;

      const topicCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: topicClassificationPrompt }],
        temperature: 0.1,
        max_tokens: 50
      });
      
      let classifiedTopic = topicCompletion.choices[0].message.content.trim();
      console.log(`[Topic Classification] Raw classification: "${classifiedTopic}"`);
      
      // 🚫 SAFEGUARD: Never allow invalid topics
      if (classifiedTopic === 'no_specific_topic' || classifiedTopic === 'no_topic' || classifiedTopic === 'none' || !classifiedTopic) {
        classifiedTopic = 'general';
        console.log(`[Topic Classification] Prevented invalid topic, using fallback: ${classifiedTopic}`);
      }
      
      // If it's a new topic, add it to the topics table
      if (!topicsList.includes(classifiedTopic)) {
        console.log(`[Topic Classification] Adding new topic: ${classifiedTopic}`);
        const { error: insertError } = await supabase
          .from('topics')
          .insert({
            name: classifiedTopic,
            description: `Automatically generated topic for: ${classifiedTopic.replace(/_/g, ' ')}`
          });
        
        if (insertError) {
          console.error('[Topic Classification] Error adding new topic:', insertError);
        }
      }
      
      return classifiedTopic;
    } catch (error) {
      console.error('[Topic Classification] Error classifying topic:', error);
      return 'general'; // Fallback topic
    }
  }

  /**
   * 🎯 NEW: Find the most populated cluster for a given topic
   * @param {string} topic - The topic to search for
   * @returns {Promise<object|null>} - Cluster info or null if none found
   */
  async findMostPopulatedClusterForTopic(topic) {
    try {
      // Get all sessions with this topic and their cluster assignments
      const { data: topicSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('secret_topic', topic);
      
      if (sessionsError || !topicSessions || topicSessions.length === 0) {
        console.log(`[Topic-Based Clustering] No existing sessions found for topic: ${topic}`);
        return null;
      }
      
      const sessionIds = topicSessions.map(s => s.id);
      
      // Get interactions from these sessions that have cluster assignments
      const { data: interactions, error: interactionsError } = await supabase
        .from('interactions')
        .select('cluster_id')
        .in('session_id', sessionIds)
        .not('cluster_id', 'is', null);
      
      if (interactionsError || !interactions || interactions.length === 0) {
        console.log(`[Topic-Based Clustering] No clustered interactions found for topic: ${topic}`);
        return null;
      }
      
      // Count clusters and find the most populated one
      const clusterCounts = {};
      interactions.forEach(interaction => {
        const clusterId = interaction.cluster_id;
        clusterCounts[clusterId] = (clusterCounts[clusterId] || 0) + 1;
      });
      
      // Find the cluster with the most interactions
      let mostPopulatedCluster = null;
      let maxCount = 0;
      
      Object.entries(clusterCounts).forEach(([clusterId, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostPopulatedCluster = clusterId;
        }
      });
      
      if (mostPopulatedCluster) {
        console.log(`[Topic-Based Clustering] Found most populated cluster for topic "${topic}": cluster ${mostPopulatedCluster} (${maxCount} interactions)`);
        return {
          cluster_id: parseInt(mostPopulatedCluster),
          size: maxCount,
          topic: topic
        };
      }
      
      return null;
    } catch (error) {
      console.error('[Topic-Based Clustering] Error finding topic cluster:', error);
      return null;
    }
  }

  /**
   * Create a new semantic cluster in real-time (enhanced with topic)
   * @param {Array} embedding - The 1536D embedding vector
   * @param {string} query - The representative query for this cluster
   * @param {string} topic - The classified topic for this cluster
   * @returns {Promise<number>} - The ID of the newly created cluster
   */
  async createRealtimeCluster(embedding, query, topic = null) {
    try {
      console.log(`[Topic-Based Clustering] Creating new cluster for topic "${topic}" with query: "${query.substring(0, 60)}..."`);
      
      // Create new cluster record - let the database auto-assign the ID
      const { data: newCluster, error: clusterError } = await supabase
        .from('semantic_clusters')
        .insert({
          centroid: embedding, // Use the query's embedding as the centroid
          size: 1, // Start with size 1
          representative_query: query, // Use this query as the representative
          clustering_version: 'realtime',
          topic: topic // 🎯 NEW: Store the topic with the cluster
          // Don't specify id - let the sequence auto-assign it
        })
        .select('id')
        .single();

      if (clusterError) {
        console.error('[Topic-Based Clustering] Error creating new cluster:', clusterError);
        throw clusterError;
      }

      const newClusterId = newCluster.id;
      console.log(`[Topic-Based Clustering] ✅ Created new cluster ID: ${newClusterId} for topic: "${topic}"`);
      console.log(`[Topic-Based Clustering] 🎯 Future "${topic}" queries will be grouped into this cluster`);
      
      return newClusterId;
    } catch (error) {
      console.error('[Topic-Based Clustering] Failed to create new cluster:', error);
      // Return null to indicate failure - the calling code will handle fallback
      return null;
    }
  }

  /**
   * Get the best global template by UCB1 (across all clusters)
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