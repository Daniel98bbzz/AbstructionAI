import { supabase } from '../lib/supabaseClient.js';

/**
 * Manages response clusters and prompt templates for crowd wisdom functionality
 * This class handles identifying successful prompt patterns and reusing them 
 * when user context is limited
 */
class ResponseClusterManager {
  constructor() {
    // Connect to the database
    this.supabase = supabase;
    
    // Default topics for classification
    this.topicCategories = [
      'computer_science', 'mathematics', 'physics', 'chemistry', 'biology',
      'engineering', 'finance', 'economics', 'history', 'philosophy',
      'linguistics', 'psychology', 'medicine', 'law', 'music',
      'art', 'literature', 'politics'
    ];
  }
  
  /**
   * Classify a query into a topic category
   * @param {string} query - The user's query
   * @param {Object} openai - OpenAI client instance
   * @returns {Promise<string>} - The classified topic
   */
  async classifyTopic(query, openai) {
    try {
      // Simple rule-based approach for common subjects
      const lowerQuery = query.toLowerCase();
      
      // Check for topic keywords
      for (const topic of this.topicCategories) {
        if (lowerQuery.includes(topic) || 
            lowerQuery.includes(topic.replace('_', ' '))) {
          return topic;
        }
      }
      
      // If no match found, use a more complex approach
      if (openai) {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              { 
                role: "system", 
                content: `You are a topic classifier. Classify the following query into exactly one of these categories: ${this.topicCategories.join(', ')}. 
                         Respond with only the category name.` 
              },
              { role: "user", content: query }
            ],
            temperature: 0.3,
            max_tokens: 20
          });
          
          const topic = completion.choices[0].message.content.trim().toLowerCase();
          
          // Validate the response is one of our categories
          if (this.topicCategories.includes(topic)) {
            return topic;
          } else {
            // Try to map to closest category
            for (const category of this.topicCategories) {
              if (topic.includes(category) || category.includes(topic)) {
                return category;
              }
            }
          }
        } catch (openaiError) {
          console.error('Error classifying topic with OpenAI:', openaiError);
        }
      }
      
      // Default to general category if everything else fails
      return 'general';
    } catch (error) {
      console.error('Error in classifyTopic:', error);
      return 'general';
    }
  }
  
  /**
   * Get a template for a specific topic
   * @param {string} topic - The classified topic
   * @param {boolean} useCompositeScore - Whether to use composite quality score (defaults to true)
   * @param {number} explorationRate - Rate of exploring newer templates (0-1, defaults to 0.1)
   * @returns {Promise<Object>} - The prompt template
   */
  async getTemplateForTopic(topic, useCompositeScore = true, explorationRate = 0.1) {
    try {
      // Decide whether to explore (try a less-used template) or exploit (use the highest scoring template)
      const shouldExplore = Math.random() < explorationRate;
      
      let query = this.supabase
        .from('prompt_templates')
        .select('*')
        .eq('topic', topic);
      
      if (shouldExplore) {
        // Exploration mode: select a less-used but decent template
        console.log(`[Crowd Wisdom] Exploring less-used templates for topic: ${topic}`);
        
        // First get all templates with a minimum quality threshold
        // This ensures we don't show poor templates even when exploring
        const minQualityThreshold = useCompositeScore ? 0.4 : 3.0;
        const qualityField = useCompositeScore ? 'composite_quality_score' : 'efficacy_score';
        
        const { data: allTemplates, error: allError } = await this.supabase
          .from('prompt_templates')
          .select('*')
          .eq('topic', topic)
          .gt(qualityField, minQualityThreshold);
        
        if (allError) throw allError;
        
        if (allTemplates && allTemplates.length > 0) {
          // Sort by usage count (ascending)
          allTemplates.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
          
          // Select from the bottom 40% of usage
          const cutoffIndex = Math.max(1, Math.floor(allTemplates.length * 0.4));
          const candidateTemplates = allTemplates.slice(0, cutoffIndex);
          
          // Pick a random template from the candidates
          const randomIndex = Math.floor(Math.random() * candidateTemplates.length);
          console.log(`[Crowd Wisdom] Selected exploration template ${candidateTemplates[randomIndex].id} with usage count ${candidateTemplates[randomIndex].usage_count}`);
          return candidateTemplates[randomIndex];
        }
        
        // If no templates meet the threshold, fall back to standard selection
        console.log(`[Crowd Wisdom] No suitable exploration templates found, falling back to standard selection`);
      }
      
      // Standard selection mode - sort by quality score 
      if (useCompositeScore) {
        query = query.order('composite_quality_score', { ascending: false });
        console.log(`[Crowd Wisdom] Using composite quality score for template selection`);
      } else {
        query = query.order('efficacy_score', { ascending: false });
        console.log(`[Crowd Wisdom] Using efficacy score for template selection`);
      }
      
      // Add a limit to get top template
      query = query.limit(1);
      
      const { data: templates, error } = await query;
      
      if (error) throw error;
      
      if (templates && templates.length > 0) {
        const selectedTemplate = templates[0];
        console.log(`[Crowd Wisdom] Selected template ${selectedTemplate.id} with ${useCompositeScore ? 'composite score' : 'efficacy score'}: ${useCompositeScore ? selectedTemplate.composite_quality_score : selectedTemplate.efficacy_score}`);
        return selectedTemplate;
      }
      
      // If no template found for this topic, return null
      console.log(`[Crowd Wisdom] No template found for topic: ${topic}`);
      return null;
    } catch (error) {
      console.error('Error getting template for topic:', error);
      return null;
    }
  }
  
  /**
   * Log the usage of a template
   * @param {string} templateId - The template ID
   * @param {string} sessionId - The session ID
   * @param {string} userId - The user ID (optional)
   * @param {string} query - The user's query
   * @param {string} responseId - The response ID
   * @returns {Promise<boolean>} - Success status
   */
  async logTemplateUsage(templateId, sessionId, userId, query, responseId) {
    try {
      const { error } = await this.supabase
        .from('prompt_template_usage')
        .insert([
          {
            template_id: templateId,
            session_id: sessionId,
            user_id: userId || null,
            query,
            response_id: responseId
          }
        ]);
      
      if (error) {
        // Handle RLS policy error
        if (error.code === '42501' && error.message.includes('violates row-level security policy')) {
          console.log('[Crowd Wisdom] RLS policy error when logging template usage - attempting to fix');
          
          try {
            // Try to fix the RLS policy
            const createPolicy = `
              DROP POLICY IF EXISTS "Restrictive template usage policy" ON public.prompt_template_usage;
              
              CREATE POLICY "Allow template usage tracking" 
              ON public.prompt_template_usage
              FOR ALL
              TO public
              USING (true)
              WITH CHECK (true);
            `;
            
            // Try execute_sql first, then fall back to exec_sql
            let policyError;
            try {
              const result = await this.supabase.rpc('execute_sql', { sql: createPolicy });
              policyError = result.error;
            } catch (execError) {
              console.log('[Crowd Wisdom] execute_sql not found, trying exec_sql instead');
              const result = await this.supabase.rpc('exec_sql', { sql: createPolicy });
              policyError = result.error;
            }
            
            if (!policyError) {
              console.log('[Crowd Wisdom] Successfully fixed RLS policy for prompt_template_usage table');
              
              // Try insert again
              const { error: retryError } = await this.supabase
                .from('prompt_template_usage')
                .insert([
                  {
                    template_id: templateId,
                    session_id: sessionId,
                    user_id: userId || null,
                    query,
                    response_id: responseId
                  }
                ]);
                
              if (retryError) {
                console.error('[Crowd Wisdom] Still could not log template usage after policy fix:', retryError);
              } else {
                console.log('[Crowd Wisdom] Successfully logged template usage after fixing RLS policy');
              }
            } else {
              console.log('[Crowd Wisdom] Could not fix RLS policy:', policyError);
            }
          } catch (policyFixError) {
            console.error('[Crowd Wisdom] Error attempting to fix RLS policy:', policyFixError);
          }
        } else {
          throw error;
        }
      }
      
      // Increment usage count - fix the raw function error
      // First get the current usage count
      const { data: templateData, error: fetchError } = await this.supabase
        .from('prompt_templates')
        .select('usage_count')
        .eq('id', templateId)
        .single();
        
      if (fetchError) throw fetchError;
      
      // Then increment it
      const newCount = (templateData.usage_count || 0) + 1;
      
      const { error: updateError } = await this.supabase
        .from('prompt_templates')
        .update({ usage_count: newCount })
        .eq('id', templateId);
      
      if (updateError) throw updateError;
      
      return true;
    } catch (error) {
      console.error('Error logging template usage:', error);
      return false;
    }
  }
  
  /**
   * Update template efficacy based on feedback
   * @param {string} responseId - The response ID
   * @param {number} rating - The feedback rating (1-5)
   * @returns {Promise<boolean>} - Success status
   */
  async updateTemplateEfficacy(responseId, rating) {
    try {
      // Find the usage record
      const { data: usageData, error: usageError } = await this.supabase
        .from('prompt_template_usage')
        .select('template_id')
        .eq('response_id', responseId)
        .single();
      
      if (usageError) throw usageError;
      
      if (!usageData) {
        return false;
      }
      
      // Update the feedback score in usage log
      const { error: updateUsageError } = await this.supabase
        .from('prompt_template_usage')
        .update({ feedback_score: rating })
        .eq('response_id', responseId);
      
      if (updateUsageError) throw updateUsageError;
      
      // Calculate new efficacy score (weighted average)
      const { data: templateData, error: templateError } = await this.supabase
        .from('prompt_templates')
        .select('efficacy_score, usage_count')
        .eq('id', usageData.template_id)
        .single();
      
      if (templateError) throw templateError;
      
      const currentScore = templateData.efficacy_score || 0;
      const usageCount = templateData.usage_count || 1;
      
      // Calculate weighted average (more weight to established patterns)
      const weightedCurrentScore = currentScore * (usageCount - 1) / usageCount;
      const weightedNewScore = rating / usageCount;
      const newEfficacyScore = weightedCurrentScore + weightedNewScore;
      
      // Update template efficacy score
      const { error: updateTemplateError } = await this.supabase
        .from('prompt_templates')
        .update({ efficacy_score: newEfficacyScore })
        .eq('id', usageData.template_id);
      
      if (updateTemplateError) throw updateTemplateError;
      
      return true;
    } catch (error) {
      console.error('Error updating template efficacy:', error);
      return false;
    }
  }
  
  /**
   * Create a new template from a successful interaction
   * @param {string} topic - The topic category
   * @param {string} query - The user's query
   * @param {Object} response - The AI's response
   * @param {number} rating - The feedback rating (1-5)
   * @param {Object} openai - OpenAI client instance
   * @returns {Promise<Object>} - The created template
   */
  async createTemplateFromSuccess(topic, query, response, rating, openai) {
    try {
      // Only create templates from highly-rated responses (4-5)
      if (rating < 4) {
        return null;
      }
      
      // Evaluate response quality using the new function
      const qualityScore = await this.evaluateResponseQuality(response, openai);
      
      // Evaluate confusion score
      const confusionScore = await this.evaluateConfusionScore(response, openai);
      console.log(`[Crowd Wisdom] Confusion score: ${confusionScore.toFixed(2)}`);
      
      // Apply quality threshold filter
      if (qualityScore < 0.6) {
        console.log('[Crowd Wisdom] Response failed quality check, not creating template');
        return null;
      }
      
      // Extract key elements from the query and response to create a template
      const templateText = JSON.stringify({
        query_pattern: this.generalizeQuery(query),
        structure: this.extractResponseStructure(response)
      });
      
      // Insert new template
      const { data, error } = await this.supabase
        .from('prompt_templates')
        .insert([
          {
            topic,
            template_text: templateText,
            source: 'crowd',
            efficacy_score: rating,
            usage_count: 1,
            quality_score: qualityScore, // Save the quality score
            confusion_score: confusionScore, // Save the confusion score
            metadata: {
              original_query: query,
              created_from_response_id: response.id
            }
          }
        ])
        .select()
        .single();
      
      if (error) {
        // If the error is due to missing columns, add them
        if (error.message && (error.message.includes('quality_score') || error.message.includes('confusion_score'))) {
          console.log('[Crowd Wisdom] Adding columns to prompt_templates table');
          await this.addQualityScoreColumn();
          
          // Try inserting again without the new columns
          const { data: retryData, error: retryError } = await this.supabase
            .from('prompt_templates')
            .insert([
              {
                topic,
                template_text: templateText,
                source: 'crowd',
                efficacy_score: rating,
                usage_count: 1,
                metadata: {
                  original_query: query,
                  created_from_response_id: response.id,
                  quality_score: qualityScore, // Store in metadata as fallback
                  confusion_score: confusionScore // Store in metadata as fallback
                }
              }
            ])
            .select()
            .single();
            
          if (retryError) throw retryError;
          return retryData;
        }
        throw error;
      }
      
      console.log(`[Crowd Wisdom] Created new template with quality score: ${qualityScore.toFixed(2)}, confusion score: ${confusionScore.toFixed(2)}`);
      return data;
    } catch (error) {
      console.error('Error creating template from success:', error);
      return null;
    }
  }
  
  /**
   * Add quality_score column to prompt_templates table if it doesn't exist
   * @returns {Promise<boolean>} - Success status
   */
  async addQualityScoreColumn() {
    try {
      const sql = `
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS quality_score NUMERIC DEFAULT 0;
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS confusion_score NUMERIC DEFAULT 0;
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS follow_up_rate NUMERIC DEFAULT 0;
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS confidence_score NUMERIC DEFAULT 0;
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS component_rating JSONB DEFAULT '{}';
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS composite_quality_score NUMERIC DEFAULT 0;
        
        ALTER TABLE prompt_templates 
        ADD COLUMN IF NOT EXISTS quality_score_metadata JSONB;
      `;
      
      // Try execute_sql first, then fall back to exec_sql
      let error;
      try {
        const result = await this.supabase.rpc('execute_sql', { sql });
        error = result.error;
      } catch (execError) {
        console.log('[Crowd Wisdom] execute_sql not found, trying exec_sql instead');
        const result = await this.supabase.rpc('exec_sql', { sql });
        error = result.error;
      }
      
      if (error) throw error;
      console.log('[Crowd Wisdom] Successfully added multi-signal columns to prompt_templates table');
      return true;
    } catch (error) {
      console.error('Error adding multi-signal columns:', error);
      return false;
    }
  }
  
  /**
   * Generalize a query to extract patterns
   * @param {string} query - The original query
   * @returns {string} - Generalized query pattern
   */
  generalizeQuery(query) {
    // Remove specific details but keep the structure
    // This is a simplified implementation
    return query
      .replace(/\b\d+\b/g, '[NUMBER]')
      .replace(/\b[A-Z][a-z]+\b/g, '[ENTITY]')
      .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[EMAIL]')
      .replace(/\b(https?:\/\/)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+([/?#].*)?/g, '[URL]');
  }
  
  /**
   * Extract structure from a response
   * @param {Object} response - The response object
   * @returns {Object} - Response structure template
   */
  extractResponseStructure(response) {
    // Create a template from successful response structure
    const structure = {
      has_introduction: !!response.introduction,
      has_explanation: !!response.explanation,
      has_analogy: !!response.analogy,
      has_example: !!response.example,
      has_key_takeaways: Array.isArray(response.key_takeaways) && response.key_takeaways.length > 0,
      is_structured: !!response.is_structured
    };
    
    return structure;
  }
  
  /**
   * Evaluate the quality of a response
   * @param {Object} response - The response object
   * @param {Object} openai - OpenAI client instance 
   * @returns {Promise<number>} - Quality score between 0 and 1
   */
  async evaluateResponseQuality(response, openai) {
    try {
      if (!openai) {
        console.log('[Crowd Wisdom] OpenAI client not available for quality evaluation, using default score');
        return 0.7; // Default score when evaluation not possible
      }
      
      // Prepare response content for evaluation
      const contentToEvaluate = {
        introduction: response.introduction || '',
        explanation: response.explanation || '',
        analogy: response.analogy || '',
        example: response.example || '',
        key_takeaways: Array.isArray(response.key_takeaways) ? response.key_takeaways.join('\n') : '',
        recap: response.recap || ''
      };
      
      // Create the evaluation prompt
      const evaluationPrompt = `
You are an expert educator evaluating the quality of an educational response. 
Rate this response on a scale from 0 to 1 (where 1 is perfect) based on these criteria:

1. Clear opening: Does it have a clear introduction that sets expectations?
2. Continuous and precise explanation: Is the explanation logical, accurate and coherent?
3. Helpful analogy: Does the analogy help understand the concept?
4. Appropriate example: Is the example relevant and easy to understand?
5. Effective summary: Does it summarize the main ideas effectively?

The response content:
===
Introduction: ${contentToEvaluate.introduction}

Explanation: ${contentToEvaluate.explanation}

Analogy: ${contentToEvaluate.analogy}

Example: ${contentToEvaluate.example}

Key Takeaways: ${contentToEvaluate.key_takeaways}

Summary: ${contentToEvaluate.recap}
===

Please analyze each component and then provide a SINGLE NUMBER representing the overall quality score between 0 and 1.
Respond ONLY with this number.`;

      // Call OpenAI API for evaluation
      const completion = await openai.chat.completions.create({
        model: "gpt-4o" in openai.chat.completions ? "gpt-4o" : "gpt-3.5-turbo",
        messages: [{ role: "user", content: evaluationPrompt }],
        temperature: 0.3,
        max_tokens: 5
      });
      
      // Parse score from response
      const scoreText = completion.choices[0].message.content.trim();
      const score = parseFloat(scoreText);
      
      // Validate score is within range
      if (isNaN(score) || score < 0 || score > 1) {
        console.error('[Crowd Wisdom] Invalid quality score returned:', scoreText);
        return 0.5; // Default to middle score if invalid
      }
      
      console.log(`[Crowd Wisdom] Response quality evaluation score: ${score.toFixed(2)}`);
      return score;
    } catch (error) {
      console.error('Error evaluating response quality:', error);
      return 0.5; // Default to middle score on error
    }
  }
  
  /**
   * Evaluate the confusion level of a response
   * @param {Object} response - The response object
   * @param {Object} openai - OpenAI client instance 
   * @returns {Promise<number>} - Confusion score between 0 and 1 (higher means more confusing)
   */
  async evaluateConfusionScore(response, openai) {
    try {
      if (!openai) {
        console.log('[Crowd Wisdom] OpenAI client not available for confusion evaluation, using default score');
        return 0.3; // Default confusion score when evaluation not possible
      }
      
      // Prepare response content for evaluation
      const contentToEvaluate = {
        introduction: response.introduction || '',
        explanation: response.explanation || '',
        analogy: response.analogy || '',
        example: response.example || '',
        key_takeaways: Array.isArray(response.key_takeaways) ? response.key_takeaways.join('\n') : '',
        recap: response.recap || ''
      };
      
      // Create the confusion evaluation prompt
      const evaluationPrompt = `
You are an expert educator evaluating the clarity of an educational response.
Rate this response's confusion level on a scale from 0 to 1 where:
- 0 means perfectly clear, easy to understand
- 0.5 means moderately clear but could be improved
- 1 means very confusing, difficult to understand

Consider:
1. Language clarity: Is the language precise and accessible?
2. Logical flow: Does the explanation have a clear progression?
3. Analogy effectiveness: Is the analogy intuitive and helpful?
4. Example clarity: Are examples concrete and easy to follow?
5. Jargon usage: Is technical terminology appropriately explained?

The response content:
===
Introduction: ${contentToEvaluate.introduction}

Explanation: ${contentToEvaluate.explanation}

Analogy: ${contentToEvaluate.analogy}

Example: ${contentToEvaluate.example}

Key Takeaways: ${contentToEvaluate.key_takeaways}

Summary: ${contentToEvaluate.recap}
===

Provide ONLY a single number between 0 and 1 representing the confusion score.`;

      // Call OpenAI API for evaluation
      const completion = await openai.chat.completions.create({
        model: "gpt-4o" in openai.chat.completions ? "gpt-4o" : "gpt-3.5-turbo",
        messages: [{ role: "user", content: evaluationPrompt }],
        temperature: 0.3,
        max_tokens: 5
      });
      
      // Parse score from response
      const scoreText = completion.choices[0].message.content.trim();
      const score = parseFloat(scoreText);
      
      // Validate score is within range
      if (isNaN(score) || score < 0 || score > 1) {
        console.error('[Crowd Wisdom] Invalid confusion score returned:', scoreText);
        return 0.3; // Default to low-medium confusion if invalid
      }
      
      console.log(`[Crowd Wisdom] Response confusion evaluation score: ${score.toFixed(2)}`);
      return score;
    } catch (error) {
      console.error('Error evaluating response confusion:', error);
      return 0.3; // Default to low-medium confusion on error
    }
  }
  
  /**
   * Enhance a prompt with a template
   * @param {string} query - The user's query
   * @param {Object} template - The prompt template
   * @returns {string} - Enhanced prompt
   */
  enhancePromptWithTemplate(query, template) {
    try {
      // Parse the template structure
      const templateData = JSON.parse(template.template_text);
      
      // Create enhanced prompt guidance for natural conversation
      // No longer suggest specific structural elements like intro, explanation, etc.
      // The main system prompt will guide the overall conversational style.
      let enhancedPrompt = `${query}\\n\\nBased on successful past interactions on similar topics, please provide a clear, comprehensive, and engaging explanation. Respond naturally and conversationally, adapting your style to the query.`;
      
      // The 'templateData.structure' might still exist but 'is_structured' is false.
      // We avoid using 'has_introduction', 'has_explanation' etc. to suggest a sequence.
      // The original template_text's query_pattern is part of the template object but not directly used here to add more text to the prompt.
      
      return enhancedPrompt;
    } catch (error) {
      console.error('Error enhancing prompt with template:', error);
      return query; // Return original query if enhancement fails
    }
  }
  
  /**
   * Calculate confidence scores for all templates
   * Based on rating count and variance
   * @returns {Promise<number>} - Number of templates updated
   */
  async calculateConfidenceScores() {
    try {
      console.log('[Crowd Wisdom] Calculating confidence scores for templates');
      
      // Get all templates
      const { data: templates, error: templatesError } = await this.supabase
        .from('prompt_templates')
        .select('id');
      
      if (templatesError) throw templatesError;
      
      let updatedCount = 0;
      
      // Process each template
      for (const template of templates) {
        // Get all ratings for this template
        const { data: usages, error: usagesError } = await this.supabase
          .from('prompt_template_usage')
          .select('feedback_score')
          .eq('template_id', template.id)
          .not('feedback_score', 'is', null);
        
        if (usagesError) {
          console.error(`[Crowd Wisdom] Error getting usage data for template ${template.id}:`, usagesError);
          continue;
        }
        
        // Calculate confidence score based on sample size and variance
        const ratingCount = usages.length;
        const threshold = 10; // Minimum number for high confidence
        
        if (ratingCount === 0) {
          // No ratings yet
          await this.supabase
            .from('prompt_templates')
            .update({ confidence_score: 0 })
            .eq('id', template.id);
          continue;
        }
        
        // Calculate standard deviation of ratings
        const ratings = usages.map(u => u.feedback_score);
        const mean = ratings.reduce((sum, r) => sum + r, 0) / ratingCount;
        const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratingCount;
        const stdDev = Math.sqrt(variance);
        
        // Confidence formula: sample size factor * (1 - normalized std deviation)
        const sampleSizeFactor = Math.min(1, ratingCount / threshold);
        const stdDevFactor = 1 - (stdDev / 5); // Assuming ratings are 1-5
        
        const confidenceScore = sampleSizeFactor * Math.max(0.1, stdDevFactor); // Ensure minimum 0.1
        
        // Update the template
        const { error: updateError } = await this.supabase
          .from('prompt_templates')
          .update({ confidence_score: confidenceScore })
          .eq('id', template.id);
          
        if (updateError) {
          console.error(`[Crowd Wisdom] Error updating confidence score for template ${template.id}:`, updateError);
        } else {
          updatedCount++;
        }
      }
      
      console.log(`[Crowd Wisdom] Updated confidence scores for ${updatedCount} templates`);
      return updatedCount;
    } catch (error) {
      console.error('Error calculating confidence scores:', error);
      return 0;
    }
  }
  
  /**
   * Calculate follow-up rate for all templates
   * @returns {Promise<number>} - Number of templates updated
   */
  async calculateFollowUpRates() {
    try {
      console.log('[Crowd Wisdom] Calculating follow-up rates for templates');
      
      // Get all templates
      const { data: templates, error: templatesError } = await this.supabase
        .from('prompt_templates')
        .select('id');
      
      if (templatesError) throw templatesError;
      
      let updatedCount = 0;
      
      // Process each template
      for (const template of templates) {
        // Get usage count
        const { count: totalUsages, error: countError } = await this.supabase
          .from('prompt_template_usage')
          .select('*', { count: 'exact' })
          .eq('template_id', template.id);
          
        if (countError) {
          console.error(`[Crowd Wisdom] Error counting usages for template ${template.id}:`, countError);
          continue;
        }
        
        if (totalUsages === 0) {
          continue; // Skip if no usages
        }
        
        // Count follow-ups
        const { count: followUpCount, error: followUpError } = await this.supabase
          .from('prompt_template_usage')
          .select('*', { count: 'exact' })
          .eq('template_id', template.id)
          .eq('had_follow_up', true);
          
        if (followUpError) {
          console.error(`[Crowd Wisdom] Error counting follow-ups for template ${template.id}:`, followUpError);
          continue;
        }
        
        // Calculate follow-up rate
        const followUpRate = followUpCount / totalUsages;
        
        // Update the template
        const { error: updateError } = await this.supabase
          .from('prompt_templates')
          .update({ follow_up_rate: followUpRate })
          .eq('id', template.id);
          
        if (updateError) {
          console.error(`[Crowd Wisdom] Error updating follow-up rate for template ${template.id}:`, updateError);
        } else {
          updatedCount++;
        }
      }
      
      console.log(`[Crowd Wisdom] Updated follow-up rates for ${updatedCount} templates`);
      return updatedCount;
    } catch (error) {
      console.error('Error calculating follow-up rates:', error);
      return 0;
    }
  }
  
  /**
   * Calculate composite quality score for all templates
   * Combines multiple signals into a single quality metric
   * @param {Object} weights - Optional custom weights for each signal
   * @returns {Promise<number>} - Number of templates updated
   */
  async calculateCompositeQualityScores(weights = null) {
    try {
      console.log('[Crowd Wisdom] Calculating composite quality scores for templates');
      
      // Default weights for each signal - can be overridden
      const defaultWeights = {
        efficacy: 0.35,    // User ratings (traditional measure)
        followUp: 0.20,    // Lower follow-up rate is better
        confusion: 0.20,   // Lower confusion score is better
        confidence: 0.15,  // Higher confidence score is better
        components: 0.10   // Component-level ratings
      };
      
      // Use provided weights or defaults
      const signalWeights = weights || defaultWeights;
      
      // Get all templates
      const { data: templates, error: templatesError } = await this.supabase
        .from('prompt_templates')
        .select('*');
      
      if (templatesError) throw templatesError;
      
      let updatedCount = 0;
      
      // Process each template
      for (const template of templates) {
        try {
          // Normalize scores to 0-1 range where 1 is always better
          
          // Efficacy score (already 0-5, normalize to 0-1)
          const efficacyScore = (template.efficacy_score || 0) / 5;
          
          // Follow-up rate (0-1, invert so lower is better)
          const followUpScore = 1 - (template.follow_up_rate || 0);
          
          // Confusion score (0-1, invert so lower is better)
          const confusionScore = 1 - (template.confusion_score || 0);
          
          // Confidence score (already 0-1, higher is better)
          const confidenceScore = template.confidence_score || 0;
          
          // Component ratings (normalize and average)
          let componentScore = 0;
          if (template.component_rating && typeof template.component_rating === 'object') {
            const ratings = [
              template.component_rating.analogy || 0,
              template.component_rating.explanation || 0,
              template.component_rating.clarity || 0,
              template.component_rating.relevance || 0
            ].filter(r => r > 0);
            
            componentScore = ratings.length > 0 ? 
              (ratings.reduce((sum, r) => sum + r, 0) / ratings.length) / 5 : 0;
          }
          
          // Calculate weighted composite score
          const compositeScore = 
            (efficacyScore * signalWeights.efficacy) +
            (followUpScore * signalWeights.followUp) +
            (confusionScore * signalWeights.confusion) +
            (confidenceScore * signalWeights.confidence) +
            (componentScore * signalWeights.components);
          
          // Store metadata about calculation
          const scoreMetadata = {
            calculation_time: new Date().toISOString(),
            weights: signalWeights,
            component_scores: {
              efficacy: efficacyScore,
              follow_up: followUpScore,
              confusion: confusionScore,
              confidence: confidenceScore,
              component: componentScore
            }
          };
          
          // Update the template
          const { error: updateError } = await this.supabase
            .from('prompt_templates')
            .update({ 
              composite_quality_score: compositeScore,
              quality_score_metadata: scoreMetadata
            })
            .eq('id', template.id);
            
          if (updateError) {
            console.error(`[Crowd Wisdom] Error updating composite score for template ${template.id}:`, updateError);
          } else {
            updatedCount++;
            console.log(`[Crowd Wisdom] Updated composite score for template ${template.id}: ${compositeScore.toFixed(3)}`);
          }
        } catch (templateError) {
          console.error(`[Crowd Wisdom] Error processing template ${template.id}:`, templateError);
        }
      }
      
      console.log(`[Crowd Wisdom] Updated composite quality scores for ${updatedCount} templates`);
      return updatedCount;
    } catch (error) {
      console.error('Error calculating composite quality scores:', error);
      return 0;
    }
  }
}

export default new ResponseClusterManager(); 