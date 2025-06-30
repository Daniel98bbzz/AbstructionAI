import { OpenAI } from 'openai';
import { supabase } from '../lib/supabaseClient.js';
import QueryClusteringService from '../services/QueryClusteringService.js';
import SuccessAnalyzer from '../services/SuccessAnalyzer.js';
import EmbeddingGenerator from '../utils/embeddingGenerator.js';

class CrowdWisdomManager {
  constructor(openaiClient) {
    this.openai = openaiClient;
    this.queryClusteringService = new QueryClusteringService(openaiClient);
    this.successAnalyzer = new SuccessAnalyzer(openaiClient);
    this.embeddingGenerator = new EmbeddingGenerator(openaiClient);
    
    // Enhanced Configuration for Improved Learning
    this.learningEnabled = true;
    this.minFeedbackConfidence = 0.65; // Slightly lowered to capture more learning opportunities
    this.promptUpdateThreshold = 1; // Allow updates after each positive feedback for faster learning
    this.enhancedLearningMode = true; // Enable new domain-specific enhancements
    
    console.log('[CROWD WISDOM MANAGER] 🧠 Initialized with enhanced learning capabilities:', {
      learningEnabled: this.learningEnabled,
      minFeedbackConfidence: this.minFeedbackConfidence,
      promptUpdateThreshold: this.promptUpdateThreshold,
      enhancedLearningMode: this.enhancedLearningMode
    });
  }

  /**
   * Process a query through the crowd wisdom system
   * @param {string} queryText - User's query
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Processing result with cluster info and prompt enhancement
   */
  async processQuery(queryText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      console.log('[CROWD WISDOM MANAGER] 🚀 Starting crowd wisdom query processing:', {
        query: queryText.substring(0, 80) + (queryText.length > 80 ? '...' : ''),
        queryLength: queryText.length,
        sessionId,
        userId
      });
      
      await this.logEvent('INFO', '🚀 Starting crowd wisdom query processing', {
        queryText: queryText,
        queryLength: queryText.length,
        sessionId,
        userId
      });

      // Step 1: Process query through clustering service
      const clusterResult = await this.queryClusteringService.processQuery(
        queryText, 
        sessionId, 
        userId
      );

      if (!clusterResult) {
        await this.logEvent('ERROR', 'Query clustering failed', {
          queryText: queryText.substring(0, 100),
          sessionId,
          userId
        });
        return null;
      }

      // Step 2: Get cluster-specific prompt enhancement
      console.log('[CROWD WISDOM MANAGER] 📝 Retrieving prompt enhancement for cluster:', clusterResult.clusterId.substring(0, 8) + '...');
      const promptEnhancement = await this.getClusterPromptEnhancement(
        clusterResult.clusterId,
        sessionId
      );
      
      console.log('[CROWD WISDOM MANAGER] 🎨 Prompt enhancement retrieved:', {
        clusterId: clusterResult.clusterId.substring(0, 8) + '...',
        hasEnhancement: !!promptEnhancement && promptEnhancement.length > 0,
        enhancementLength: promptEnhancement ? promptEnhancement.length : 0,
        enhancementPreview: promptEnhancement ? promptEnhancement.substring(0, 100) + '...' : 'None'
      });

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Crowd wisdom query processing completed', {
        clusterId: clusterResult.clusterId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        hasPromptEnhancement: promptEnhancement.length > 0,
        promptEnhancementLength: promptEnhancement.length,
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        clusterId: clusterResult.clusterId,
        assignmentId: clusterResult.assignmentId,
        similarity: clusterResult.similarity,
        isNewCluster: clusterResult.isNewCluster,
        promptEnhancement,
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Crowd wisdom query processing failed', {
        error: error.message,
        queryText: queryText?.substring(0, 100),
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return null;
    }
  }

  /**
   * Process user feedback and trigger learning if positive
   * @param {string} assignmentId - Query assignment ID
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response that was given
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Feedback processing result
   */
  async processFeedback(assignmentId, feedbackText, responseText, sessionId, userId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', 'Starting crowd wisdom feedback processing', {
        assignmentId,
        feedbackLength: feedbackText.length,
        responseLength: responseText.length,
        sessionId,
        userId
      });

      // Step 1: Analyze feedback for positive sentiment
      const feedbackAnalysis = await this.successAnalyzer.analyzeFeedback(
        feedbackText,
        sessionId,
        userId
      );

      await this.logEvent('DEBUG', 'Feedback analysis completed', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        method: feedbackAnalysis.method,
        assignmentId,
        sessionId,
        userId
      });

      // Step 2: Update query assignment with feedback results
      await this.updateQueryAssignmentWithFeedback(
        assignmentId,
        feedbackAnalysis,
        sessionId
      );

      // Step 3: If feedback is positive and confident, trigger learning
      let learningResult = null;
      const shouldTriggerLearning = feedbackAnalysis.isPositive && 
          feedbackAnalysis.confidence >= this.minFeedbackConfidence &&
          this.learningEnabled;
          
      console.log('[CROWD WISDOM MANAGER] 🎓 Learning trigger evaluation:', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        minRequired: this.minFeedbackConfidence,
        learningEnabled: this.learningEnabled,
        shouldTriggerLearning: shouldTriggerLearning
      });
      
      if (shouldTriggerLearning) {
        console.log('[CROWD WISDOM MANAGER] ✅ Positive feedback detected - triggering learning process!');
        await this.logEvent('INFO', '✅ Positive feedback detected, triggering learning process', {
          confidence: feedbackAnalysis.confidence,
          feedbackText: feedbackText,
          assignmentId,
          sessionId,
          userId
        });

        learningResult = await this.triggerLearning(
          assignmentId,
          feedbackText,
          responseText,
          feedbackAnalysis,
          sessionId,
          userId
        );
        
        console.log('[CROWD WISDOM MANAGER] 🎉 Learning process completed:', {
          success: !!learningResult && !learningResult.error,
          clusterId: learningResult?.clusterId?.substring(0, 8) + '...' || 'Unknown',
          promptUpdated: !!learningResult?.promptUpdate,
          learningEventLogged: learningResult?.learningEventLogged || false
        });
      } else {
        console.log('[CROWD WISDOM MANAGER] ❌ Learning not triggered:', {
          reason: !feedbackAnalysis.isPositive ? 'Negative feedback' :
                  feedbackAnalysis.confidence < this.minFeedbackConfidence ? 'Low confidence' :
                  !this.learningEnabled ? 'Learning disabled' : 'Unknown'
        });
      }

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Crowd wisdom feedback processing completed', {
        isPositive: feedbackAnalysis.isPositive,
        confidence: feedbackAnalysis.confidence,
        learningTriggered: learningResult !== null,
        processingTimeMs: processingTime,
        assignmentId,
        sessionId,
        userId
      });

      return {
        feedbackAnalysis,
        learningResult,
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Crowd wisdom feedback processing failed', {
        error: error.message,
        assignmentId,
        processingTimeMs: processingTime,
        sessionId,
        userId
      });

      return {
        feedbackAnalysis: { isPositive: false, confidence: 0, error: error.message },
        learningResult: null,
        error: error.message
      };
    }
  }

  /**
   * Trigger the learning process for successful responses
   * @param {string} assignmentId - Query assignment ID
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response
   * @param {Object} feedbackAnalysis - Feedback analysis result
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Learning result
   */
  async triggerLearning(assignmentId, feedbackText, responseText, feedbackAnalysis, sessionId, userId) {
    try {
      await this.logEvent('INFO', 'Starting learning process', {
        assignmentId,
        feedbackConfidence: feedbackAnalysis.confidence,
        sessionId,
        userId
      });

      // Step 1: Get the cluster for this assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('cluster_id, query_text')
        .eq('id', assignmentId)
        .single();

      if (assignmentError) {
        await this.logEvent('ERROR', 'Failed to get assignment for learning', {
          error: assignmentError.message,
          assignmentId,
          sessionId
        });
        return null;
      }

      // Step 2: Analyze what made the response successful
      const successFactors = await this.analyzeSuccessFactors(
        feedbackText,
        responseText,
        assignment.query_text,
        sessionId,
        userId
      );

      // Step 3: Check if we should update the cluster's prompt
      const shouldUpdate = await this.shouldUpdateClusterPrompt(
        assignment.cluster_id,
        sessionId
      );

      if (shouldUpdate) {
        await this.logEvent('INFO', '🎓 Triggering enhanced learning - building upon previous patterns', {
          clusterId: assignment.cluster_id,
          assignmentId,
          enhancedLearningMode: this.enhancedLearningMode,
          identifiedDomain: successFactors.identifiedDomain,
          extractedTechniques: successFactors.teachingTechniques?.length || 0,
          specificStrengths: successFactors.specificStrengths?.length || 0,
          sessionId,
          userId
        });

        const promptUpdate = await this.updateClusterPrompt(
          assignment.cluster_id,
          successFactors,
          responseText,
          sessionId,
          userId
        );

        // Step 4: Log the learning event with enhanced context
        await this.logLearningEvent(
          assignment.cluster_id,
          assignmentId,
          successFactors,
          promptUpdate,
          feedbackAnalysis.confidence,
          sessionId
        );

        console.log('[CROWD WISDOM MANAGER] 🌟 Enhanced learning completed successfully:', {
          clusterId: assignment.cluster_id.substring(0, 8) + '...',
          domain: successFactors.identifiedDomain,
          techniques: successFactors.teachingTechniques?.slice(0, 2),
          promptLength: promptUpdate?.length || 0,
          confidenceScore: feedbackAnalysis.confidence
        });

        return {
          clusterId: assignment.cluster_id,
          successFactors,
          promptUpdate,
          learningEventLogged: true,
          enhancedLearning: true,
          domain: successFactors.identifiedDomain
        };
      } else {
        await this.logEvent('DEBUG', 'Cluster prompt update not needed at this time', {
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });

        return {
          clusterId: assignment.cluster_id,
          successFactors,
          promptUpdate: null,
          learningEventLogged: false
        };
      }

    } catch (error) {
      await this.logEvent('ERROR', 'Learning process failed', {
        error: error.message,
        assignmentId,
        sessionId,
        userId
      });

      return {
        error: error.message,
        learningEventLogged: false
      };
    }
  }

  /**
   * Analyze what factors made the response successful with enhanced detail
   * @param {string} feedbackText - User feedback
   * @param {string} responseText - AI response
   * @param {string} queryText - Original query
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Success factors
   */
  async analyzeSuccessFactors(feedbackText, responseText, queryText, sessionId, userId) {
    try {
      // Identify the domain for context-aware analysis
      const domain = this.identifyDomain(queryText, '');
      
      const prompt = `You are an expert educational consultant analyzing a successful teaching interaction in the ${domain} domain.

CONTEXT:
- Subject Domain: ${domain}
- Original Query: "${queryText}"
- User's Positive Feedback: "${feedbackText}"

AI RESPONSE TO ANALYZE:
"${responseText.substring(0, 1200)}..."

ANALYSIS TASK:
Conduct a deep analysis of why this response was effective for ${domain} topics. Extract specific, actionable patterns that can be replicated.

Respond with detailed JSON:
{
  "successFactors": {
    "usedAnalogy": boolean,
    "clearStructure": boolean,
    "appropriateLevel": boolean,
    "goodExamples": boolean,
    "stepByStep": boolean,
    "visualElements": boolean,
    "realWorldApplications": boolean,
    "conceptualConnections": boolean
  },
  "specificStrengths": [
    "Exactly what worked well - be specific about content, structure, examples, etc.",
    "Focus on ${domain}-specific strengths"
  ],
  "teachingTechniques": [
    "Specific pedagogical methods used effectively",
    "Domain-appropriate teaching strategies"
  ],
  "domainSpecificApproaches": [
    "What worked specifically for ${domain} topics",
    "Subject-matter-specific techniques"
  ],
  "exampleTypes": [
    "Types of examples that were effective",
    "How examples were structured and presented"
  ],
  "promptGuidance": "Detailed instruction for how AI should handle similar ${domain} queries, incorporating the successful patterns identified",
  "replicablePatterns": [
    "Specific patterns that can be applied to other ${domain} questions",
    "Structural or content approaches that worked"
  ]
}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: `You are an expert educational consultant specializing in ${domain} pedagogy. You analyze successful teaching interactions to extract detailed, domain-specific patterns that can improve future responses.` 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.05,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      // Ensure all expected fields exist with defaults
      const enhancedAnalysis = {
        successFactors: {
          usedAnalogy: false,
          clearStructure: false,
          appropriateLevel: false,
          goodExamples: false,
          stepByStep: false,
          visualElements: false,
          realWorldApplications: false,
          conceptualConnections: false,
          ...analysis.successFactors
        },
        specificStrengths: analysis.specificStrengths || [],
        teachingTechniques: analysis.teachingTechniques || [],
        domainSpecificApproaches: analysis.domainSpecificApproaches || [],
        exampleTypes: analysis.exampleTypes || [],
        promptGuidance: analysis.promptGuidance || '',
        replicablePatterns: analysis.replicablePatterns || [],
        identifiedDomain: domain
      };
      
      await this.logEvent('DEBUG', 'Enhanced success factors analyzed', {
        domain,
        analysis: enhancedAnalysis,
        tokensUsed: response.usage?.total_tokens || 0,
        sessionId,
        userId
      });

      return enhancedAnalysis;

    } catch (error) {
      await this.logEvent('ERROR', 'Success factor analysis failed', {
        error: error.message,
        sessionId,
        userId
      });

      return {
        successFactors: {
          usedAnalogy: false,
          clearStructure: false,
          appropriateLevel: false,
          goodExamples: false,
          stepByStep: false,
          visualElements: false,
          realWorldApplications: false,
          conceptualConnections: false
        },
        specificStrengths: [],
        teachingTechniques: [],
        domainSpecificApproaches: [],
        exampleTypes: [],
        promptGuidance: '',
        replicablePatterns: [],
        identifiedDomain: 'unknown'
      };
    }
  }

  /**
   * Check if cluster prompt should be updated
   * @param {string} clusterId - Cluster ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Whether to update
   */
  async shouldUpdateClusterPrompt(clusterId, sessionId) {
    try {
      // Get cluster statistics
      const { data: cluster, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('success_count, total_queries, updated_at')
        .eq('id', clusterId)
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to get cluster stats for update decision', {
          error: error.message,
          clusterId,
          sessionId
        });
        return false;
      }

      // Check if we have enough successful responses
      const hasEnoughSuccesses = cluster.success_count >= this.promptUpdateThreshold;
      
      // Check if it's been a while since last update
      const lastUpdate = new Date(cluster.updated_at);
      const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      const hasBeenAWhile = daysSinceUpdate >= 0; // Temporarily removed for testing (production: 0.5 = 12 hours)

      const shouldUpdate = hasEnoughSuccesses && hasBeenAWhile;

      await this.logEvent('DEBUG', 'Cluster prompt update decision', {
        clusterId,
        successCount: cluster.success_count,
        threshold: this.promptUpdateThreshold,
        daysSinceUpdate: daysSinceUpdate.toFixed(1),
        shouldUpdate,
        sessionId
      });

      return shouldUpdate;

    } catch (error) {
      await this.logEvent('ERROR', 'Error checking cluster prompt update criteria', {
        error: error.message,
        clusterId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Update cluster prompt with enhanced template
   * @param {string} clusterId - Cluster ID
   * @param {Object} successFactors - Success factors analysis
   * @param {string} responseText - Successful response text
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Enhanced prompt template
   */
  async updateClusterPrompt(clusterId, successFactors, responseText, sessionId, userId) {
    try {
      // Get current cluster data including recent learning history
      const { data: cluster, error } = await supabase
        .from('crowd_wisdom_clusters')
        .select('prompt_enhancement, representative_query, cluster_name, success_count, total_queries')
        .eq('id', clusterId)
        .single();

      if (error) {
        await this.logEvent('ERROR', 'Failed to get current cluster prompt', {
          error: error.message,
          clusterId,
          sessionId
        });
        return '';
      }

      // Get recent learning patterns for this cluster to build upon
      const { data: recentLearning, error: learningError } = await supabase
        .from('crowd_wisdom_learning_logs')
        .select('extracted_patterns, prompt_update, created_at')
        .eq('cluster_id', clusterId)
        .order('created_at', { ascending: false })
        .limit(3); // Get last 3 learning events

      if (learningError) {
        await this.logEvent('WARN', 'Failed to get recent learning history', {
          error: learningError.message,
          clusterId,
          sessionId
        });
      }

      // Log the pre-enhancement state
      await this.logEvent('INFO', '🔄 STARTING CLUSTER PROMPT UPDATE PROCESS', {
        clusterId,
        clusterInfo: {
          name: cluster.cluster_name,
          representativeQuery: cluster.representative_query?.substring(0, 100) + '...',
          successCount: cluster.success_count,
          totalQueries: cluster.total_queries,
          successRate: cluster.total_queries > 0 ? (cluster.success_count / cluster.total_queries * 100).toFixed(1) + '%' : '0%'
        },
        currentPromptState: {
          exists: !!(cluster.prompt_enhancement && cluster.prompt_enhancement.trim().length > 0),
          length: cluster.prompt_enhancement?.length || 0,
          content: cluster.prompt_enhancement || 'No enhancement yet'
        },
        learningHistory: {
          previousEnhancements: recentLearning?.length || 0,
          lastLearningDate: recentLearning?.[0]?.created_at || 'Never'
        },
        sessionId,
        userId
      });

      // Generate enhanced prompt building upon previous learning
      const enhancedPrompt = await this.generateEnhancedPromptTemplate(
        cluster.representative_query,
        cluster.cluster_name,
        cluster.prompt_enhancement,
        successFactors,
        responseText,
        recentLearning || [],
        sessionId,
        userId
      );

      // Update cluster with enhanced prompt
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          prompt_enhancement: enhancedPrompt,
          updated_at: new Date().toISOString()
        })
        .eq('id', clusterId);

      if (updateError) {
        await this.logEvent('ERROR', '❌ Failed to save enhanced prompt to database', {
          error: updateError.message,
          clusterId,
          enhancedPromptLength: enhancedPrompt.length,
          sessionId
        });
        return cluster.prompt_enhancement || '';
      }

      // Calculate improvement metrics for database update logging
      const improvementMetrics = {
        wasEmpty: !cluster.prompt_enhancement || cluster.prompt_enhancement.trim().length === 0,
        previousLength: cluster.prompt_enhancement?.length || 0,
        newLength: enhancedPrompt.length,
        growthAmount: enhancedPrompt.length - (cluster.prompt_enhancement?.length || 0),
        enhancementNumber: (recentLearning?.length || 0) + 1
      };

      // Log successful database update with detailed before/after
      await this.logEvent('INFO', '✅ CLUSTER PROMPT SUCCESSFULLY UPDATED IN DATABASE', {
        clusterId,
        clusterName: cluster.cluster_name,
        DATABASE_UPDATE: {
          BEFORE: {
            promptExists: !!cluster.prompt_enhancement,
            promptLength: cluster.prompt_enhancement?.length || 0,
            promptContent: cluster.prompt_enhancement || 'Empty'
          },
          AFTER: {
            promptLength: enhancedPrompt.length,
            promptContent: enhancedPrompt
          },
          CHANGES: {
            type: improvementMetrics.wasEmpty ? 'FIRST_CREATION' : 'ENHANCEMENT',
            lengthChange: improvementMetrics.growthAmount,
            enhancementNumber: improvementMetrics.enhancementNumber,
            percentageGrowth: improvementMetrics.previousLength > 0 
              ? ((improvementMetrics.growthAmount / improvementMetrics.previousLength) * 100).toFixed(1) + '%'
              : 'New prompt'
          }
        },
        CLUSTER_PERFORMANCE: {
          successCount: cluster.success_count,
          totalQueries: cluster.total_queries,
          successRate: cluster.total_queries > 0 ? (cluster.success_count / cluster.total_queries * 100).toFixed(1) + '%' : '0%',
          learningEvents: improvementMetrics.enhancementNumber
        },
        sessionId,
        userId
      });

      // Enhanced console logging for database updates
      console.log('\n' + '🗄️'.repeat(25) + ' DATABASE UPDATE ' + '🗄️'.repeat(25));
      console.log('✅ CLUSTER PROMPT SAVED TO DATABASE');
      console.log('━'.repeat(80));
      console.log('🏷️  Cluster:', cluster.cluster_name);
      console.log('🔢 Enhancement #:', improvementMetrics.enhancementNumber);
      console.log('📊 Performance:', cluster.success_count + '/' + cluster.total_queries, 'successes');
      
      if (improvementMetrics.wasEmpty) {
        console.log('🎉 STATUS: FIRST PROMPT CREATED!');
        console.log('📏 Length:', enhancedPrompt.length, 'characters');
      } else {
        console.log('🔄 STATUS: PROMPT ENHANCED!');
        console.log('📏 Length change:', improvementMetrics.previousLength, '→', enhancedPrompt.length);
        console.log('📈 Growth:', '+' + improvementMetrics.growthAmount, 'characters');
      }
      
      console.log('💾 Saved at:', new Date().toISOString());
      console.log('━'.repeat(80));

      return enhancedPrompt;

    } catch (error) {
      await this.logEvent('ERROR', '❌ Error in cluster prompt update process', {
        error: error.message,
        clusterId,
        sessionId,
        userId
      });
      return '';
    }
  }

  /**
   * Generate enhanced prompt template that builds upon previous learning
   * @param {string} representativeQuery - Cluster's representative query
   * @param {string} clusterName - Name/theme of the cluster
   * @param {string} currentPrompt - Current prompt enhancement
   * @param {Object} successFactors - Success factors analysis
   * @param {string} successfulResponse - The successful response
   * @param {Array} recentLearning - Recent learning events for this cluster
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Enhanced prompt template
   */
  async generateEnhancedPromptTemplate(representativeQuery, clusterName, currentPrompt, successFactors, successfulResponse, recentLearning, sessionId, userId) {
    try {
      // Extract domain/subject from representative query and cluster name
      const domain = this.identifyDomain(representativeQuery, clusterName);
      
      // If there's no current prompt, create the first one
      if (!currentPrompt || currentPrompt.trim().length === 0) {
        const initialTemplate = await this.generateInitialPromptTemplate(domain, representativeQuery, successFactors, successfulResponse, sessionId, userId);
        
        await this.logEvent('INFO', '🎯 FIRST PROMPT TEMPLATE CREATED for cluster', {
          domain,
          representativeQuery: representativeQuery.substring(0, 100) + '...',
          initialTemplate,
          templateLength: initialTemplate.length,
          triggerFactors: {
            usedAnalogy: successFactors.successFactors?.usedAnalogy || false,
            clearStructure: successFactors.successFactors?.clearStructure || false,
            goodExamples: successFactors.successFactors?.goodExamples || false,
            stepByStep: successFactors.successFactors?.stepByStep || false
          },
          sessionId,
          userId
        });
        
        console.log('[CROWD WISDOM] 🎯 FIRST PROMPT TEMPLATE CREATED:');
        console.log('Domain:', domain);
        console.log('Template:', initialTemplate);
        console.log('Length:', initialTemplate.length, 'characters');
        
        return initialTemplate;
      }

      // Check if prompt is getting too long (prevent infinite growth)
      const MAX_PROMPT_LENGTH = 1200; // Reasonable limit for prompt enhancement
      if (currentPrompt.length > MAX_PROMPT_LENGTH) {
        await this.logEvent('INFO', '📏 Prompt reached maximum length, creating condensed version', {
          currentLength: currentPrompt.length,
          maxLength: MAX_PROMPT_LENGTH,
          clusterId: 'unknown',
          sessionId
        });
        
        const condensedPrompt = await this.condenseAndExtendPrompt(currentPrompt, domain, successFactors, sessionId, userId);
        
        await this.logEvent('INFO', '🔄 PROMPT CONDENSED AND ENHANCED', {
          domain,
          previousPrompt: currentPrompt,
          previousLength: currentPrompt.length,
          condensedPrompt,
          newLength: condensedPrompt.length,
          spaceSaved: currentPrompt.length - condensedPrompt.length,
          compressionRatio: ((currentPrompt.length - condensedPrompt.length) / currentPrompt.length * 100).toFixed(1) + '%',
          sessionId,
          userId
        });
        
        console.log('[CROWD WISDOM] 🔄 PROMPT CONDENSED AND ENHANCED:');
        console.log('Previous length:', currentPrompt.length, '→ New length:', condensedPrompt.length);
        console.log('Space saved:', currentPrompt.length - condensedPrompt.length, 'characters');
        
        return condensedPrompt;
      }
      
      // Compile key insights from latest success
      const newInsights = this.extractKeyInsights(successFactors, domain);

      await this.logEvent('INFO', '🧠 ANALYZING SUCCESS FOR PROMPT ENHANCEMENT', {
        domain,
        currentPromptLength: currentPrompt.length,
        extractedInsights: newInsights,
        successFactors: {
          usedAnalogy: successFactors.successFactors?.usedAnalogy || false,
          clearStructure: successFactors.successFactors?.clearStructure || false,
          goodExamples: successFactors.successFactors?.goodExamples || false,
          stepByStep: successFactors.successFactors?.stepByStep || false,
          realWorldApplications: successFactors.successFactors?.realWorldApplications || false
        },
        teachingTechniques: successFactors.teachingTechniques || [],
        specificStrengths: successFactors.specificStrengths || [],
        sessionId,
        userId
      });

      // Ask GPT-4o to generate ONLY new content to append
      const prompt = `You are improving a teaching prompt by adding NEW insights based on recent successful interactions.

DOMAIN: ${domain}
REPRESENTATIVE QUERY: "${representativeQuery}"

EXISTING PROMPT ENHANCEMENT (DO NOT REPEAT THIS):
"${currentPrompt}"

LATEST SUCCESS ANALYSIS:
${JSON.stringify(successFactors, null, 2)}

KEY NEW INSIGHTS TO INCORPORATE:
${newInsights.join('\n')}

TASK: Generate ONLY new content to APPEND to the existing prompt enhancement. 

Requirements:
1. Do NOT repeat any content from the existing prompt
2. Add 1-2 NEW specific techniques or insights that complement what's already there
3. Focus on what specifically worked in this latest success
4. Keep additions concise but specific to ${domain}
5. Start with a connecting phrase like "Additionally," or "Furthermore," or "Building on this,"

Generate ONLY the new content to append (1-2 sentences max):`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You generate concise additions to existing teaching prompts. You never repeat existing content, only add new insights. Be specific and actionable.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 150, // Smaller limit for just the addition
        temperature: 0.2 // Slightly higher for more variation
      });

      const newContent = response.choices[0].message.content.trim();
      
      // Combine existing prompt with new content
      const enhancedTemplate = `${currentPrompt} ${newContent}`;
      
      // Calculate improvement metrics
      const improvementMetrics = {
        previousLength: currentPrompt.length,
        additionLength: newContent.length,
        finalLength: enhancedTemplate.length,
        growthPercentage: ((newContent.length / currentPrompt.length) * 100).toFixed(1) + '%',
        newInsightsCount: newInsights.length,
        tokensUsed: response.usage?.total_tokens || 0
      };
      
      await this.logEvent('INFO', '✨ PROMPT TEMPLATE SUCCESSFULLY ENHANCED', {
        domain,
        representativeQuery: representativeQuery.substring(0, 80) + '...',
        BEFORE: {
          prompt: currentPrompt,
          length: currentPrompt.length
        },
        ADDITION: {
          newContent: newContent,
          length: newContent.length,
          insights: newInsights
        },
        AFTER: {
          enhancedPrompt: enhancedTemplate,
          length: enhancedTemplate.length
        },
        IMPROVEMENT_SUMMARY: {
          contentGrowth: improvementMetrics.growthPercentage,
          newTechniquesAdded: newInsights.length,
          specificImprovements: this.analyzeImprovementType(successFactors),
          cumulativeLearning: `This is enhancement #${recentLearning.length + 1} for this cluster`
        },
        sessionId,
        userId
      });

      // Enhanced console logging for easy monitoring
      console.log('\n' + '='.repeat(80));
      console.log('✨ CROWD WISDOM: PROMPT TEMPLATE ENHANCED');
      console.log('='.repeat(80));
      console.log('📍 Domain:', domain);
      console.log('📝 Query:', representativeQuery.substring(0, 60) + '...');
      console.log('\n📜 BEFORE (', currentPrompt.length, 'chars):');
      console.log('"' + currentPrompt + '"');
      console.log('\n➕ NEW ADDITION (', newContent.length, 'chars):');
      console.log('"' + newContent + '"');
      console.log('\n📜 AFTER (', enhancedTemplate.length, 'chars):');
      console.log('"' + enhancedTemplate + '"');
      console.log('\n📊 IMPROVEMENT METRICS:');
      console.log('   • Growth:', improvementMetrics.growthPercentage);
      console.log('   • New insights:', newInsights.length);
      console.log('   • Enhancement #:', recentLearning.length + 1, 'for this cluster');
      console.log('   • Key improvement:', this.analyzeImprovementType(successFactors));
      console.log('='.repeat(80) + '\n');
      
      return enhancedTemplate;

    } catch (error) {
      await this.logEvent('ERROR', '❌ Failed to extend prompt template', {
        error: error.message,
        currentPromptLength: currentPrompt?.length || 0,
        domain,
        sessionId,
        userId
      });
      return currentPrompt || '';
    }
  }

  /**
   * Analyze what type of improvement was made based on success factors
   * @param {Object} successFactors - Success factors analysis
   * @returns {string} - Description of the improvement type
   */
  analyzeImprovementType(successFactors) {
    const factors = successFactors.successFactors || {};
    const techniques = successFactors.teachingTechniques || [];
    const strengths = successFactors.specificStrengths || [];
    
    // Determine primary improvement type
    if (factors.usedAnalogy) return 'Better analogies and metaphors';
    if (factors.stepByStep) return 'Improved step-by-step guidance';
    if (factors.goodExamples) return 'Enhanced examples and illustrations';
    if (factors.clearStructure) return 'Better content organization';
    if (factors.realWorldApplications) return 'More practical applications';
    if (techniques.length > 0) return `Teaching technique: ${techniques[0].substring(0, 50)}...`;
    if (strengths.length > 0) return `Strength: ${strengths[0].substring(0, 50)}...`;
    
    return 'General teaching effectiveness improvements';
  }

  /**
   * Generate initial prompt template for new clusters
   * @param {string} domain - Identified domain
   * @param {string} representativeQuery - Representative query
   * @param {Object} successFactors - Success factors analysis
   * @param {string} successfulResponse - Successful response
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Initial prompt template
   */
  async generateInitialPromptTemplate(domain, representativeQuery, successFactors, successfulResponse, sessionId, userId) {
    try {
      const prompt = `Create a concise teaching prompt enhancement for an AI assistant specializing in ${domain} topics.

DOMAIN: ${domain}
REPRESENTATIVE QUERY: "${representativeQuery}"

SUCCESS ANALYSIS:
${JSON.stringify(successFactors, null, 2)}

SUCCESSFUL RESPONSE EXCERPT:
"${successfulResponse.substring(0, 600)}..."

Create a specific 2-3 sentence prompt enhancement that captures what made this response effective for ${domain} topics. Focus on concrete teaching techniques, not generic advice.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: `You create specific, actionable teaching prompts for ${domain} education. Be concrete and domain-specific.` 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1
      });

      const initialTemplate = response.choices[0].message.content.trim();
      
      await this.logEvent('DEBUG', 'Initial prompt template created', {
        domain,
        templateLength: initialTemplate.length,
        tokensUsed: response.usage?.total_tokens || 0,
        sessionId,
        userId
      });

      return initialTemplate;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to create initial prompt template', {
        error: error.message,
        sessionId,
        userId
      });
      return '';
    }
  }

  /**
   * Condense an overly long prompt while adding new insights
   * @param {string} currentPrompt - Current prompt that's too long
   * @param {string} domain - Domain
   * @param {Object} successFactors - Success factors
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Condensed and enhanced prompt
   */
  async condenseAndExtendPrompt(currentPrompt, domain, successFactors, sessionId, userId) {
    try {
      const newInsights = this.extractKeyInsights(successFactors, domain);

      const prompt = `The following teaching prompt for ${domain} has grown too long. Create a condensed version that preserves the key teaching techniques while incorporating new insights.

CURRENT PROMPT (TOO LONG):
"${currentPrompt}"

NEW INSIGHTS TO INCORPORATE:
${newInsights.join('\n')}

Create a condensed prompt (3-4 sentences max) that:
1. Preserves the most effective techniques from the current prompt
2. Incorporates the new insights
3. Remains specific to ${domain} teaching
4. Is actionable and concrete`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You condense teaching prompts while preserving key insights and adding new ones. Keep prompts actionable and domain-specific.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 250,
        temperature: 0.1
      });

      const condensedTemplate = response.choices[0].message.content.trim();
      
      await this.logEvent('INFO', 'Prompt condensed and enhanced', {
        originalLength: currentPrompt.length,
        condensedLength: condensedTemplate.length,
        domain,
        tokensUsed: response.usage?.total_tokens || 0,
        sessionId,
        userId
      });

      return condensedTemplate;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to condense prompt', {
        error: error.message,
        sessionId,
        userId
      });
      return currentPrompt;
    }
  }

  /**
   * Extract key insights from success factors for domain-specific improvements
   * @param {Object} successFactors - Success factors analysis
   * @param {string} domain - Domain
   * @returns {Array<string>} - Key insights to incorporate
   */
  extractKeyInsights(successFactors, domain) {
    const insights = [];
    
    // Extract domain-specific techniques that worked
    if (successFactors.domainSpecificApproaches && successFactors.domainSpecificApproaches.length > 0) {
      insights.push(`Domain-specific approach: ${successFactors.domainSpecificApproaches[0]}`);
    }
    
    // Extract successful teaching techniques
    if (successFactors.teachingTechniques && successFactors.teachingTechniques.length > 0) {
      insights.push(`Effective technique: ${successFactors.teachingTechniques[0]}`);
    }
    
    // Extract what specifically worked well
    if (successFactors.specificStrengths && successFactors.specificStrengths.length > 0) {
      insights.push(`What worked: ${successFactors.specificStrengths[0]}`);
    }
    
    // Extract successful factors
    const factors = successFactors.successFactors || {};
    const workingFactors = Object.entries(factors)
      .filter(([key, value]) => value === true)
      .map(([key, value]) => key);
    
    if (workingFactors.length > 0) {
      insights.push(`Successful elements: ${workingFactors.slice(0, 2).join(', ')}`);
    }
    
    return insights.length > 0 ? insights : [`New successful pattern identified for ${domain} topics`];
  }

  /**
   * Identify the domain/subject area from query and cluster context
   * @param {string} representativeQuery - The representative query
   * @param {string} clusterName - Cluster name/theme
   * @returns {string} - Identified domain
   */
  identifyDomain(representativeQuery, clusterName) {
    const text = (representativeQuery + ' ' + (clusterName || '')).toLowerCase();
    
    // Enhanced domain keywords mapping with priority weights
    const domains = {
      'mathematics': {
        keywords: ['math', 'calculus', 'algebra', 'geometry', 'derivative', 'integral', 'equation', 'theorem', 'formula', 'statistics', 'trigonometry', 'logarithm', 'matrix', 'vector'],
        priority: 1
      },
      'signal processing': {
        keywords: ['signal', 'frequency', 'fourier', 'transform', 'filter', 'audio', 'processing', 'spectrum', 'fft', 'frequency domain', 'time domain'],
        priority: 2 // Higher priority for specific domains
      },
      'computer science': {
        keywords: ['programming', 'algorithm', 'data structure', 'software', 'code', 'computing', 'database', 'ai', 'machine learning', 'python', 'javascript', 'programming language'],
        priority: 1
      },
      'physics': {
        keywords: ['physics', 'quantum', 'mechanics', 'energy', 'force', 'momentum', 'wave', 'particle', 'electromagnetic', 'thermodynamics', 'relativity'],
        priority: 1
      },
      'engineering': {
        keywords: ['engineering', 'circuit', 'system design', 'mechanical', 'electrical', 'structural', 'control system', 'automation'],
        priority: 1
      },
      'cloud computing': {
        keywords: ['aws', 'gcp', 'azure', 'cloud', 'kubernetes', 'docker', 'serverless', 'microservices', 'devops'],
        priority: 2
      },
      'blockchain': {
        keywords: ['blockchain', 'cryptocurrency', 'bitcoin', 'ethereum', 'smart contract', 'decentralized', 'web3', 'crypto'],
        priority: 2
      },
      'biology': {
        keywords: ['biology', 'cell', 'dna', 'protein', 'organism', 'evolution', 'genetics', 'molecular', 'ecosystem'],
        priority: 1
      },
      'chemistry': {
        keywords: ['chemistry', 'molecule', 'reaction', 'compound', 'element', 'bond', 'catalyst', 'organic', 'inorganic'],
        priority: 1
      },
      'data science': {
        keywords: ['data science', 'analytics', 'visualization', 'pandas', 'numpy', 'statistics', 'data analysis', 'big data'],
        priority: 2
      }
    };

    // Find the domain with the best weighted score
    let maxScore = 0;
    let identifiedDomain = 'general academic';
    let detectedKeywords = [];

    for (const [domain, config] of Object.entries(domains)) {
      const matches = config.keywords.filter(keyword => text.includes(keyword));
      const score = matches.length * config.priority;
      
      if (score > maxScore) {
        maxScore = score;
        identifiedDomain = domain;
        detectedKeywords = matches;
      }
    }

    // If no strong domain match, try to identify based on question type
    if (maxScore === 0) {
      if (text.includes('explain') || text.includes('what is') || text.includes('how does')) {
        if (text.includes('work') || text.includes('function')) {
          identifiedDomain = 'technical explanation';
        } else {
          identifiedDomain = 'conceptual explanation';
        }
      }
    }

    console.log(`[DOMAIN IDENTIFICATION] Query: "${representativeQuery.substring(0, 60)}..." → Domain: ${identifiedDomain} (keywords: ${detectedKeywords.join(', ')})`);

    return identifiedDomain;
  }

  /**
   * Get cluster prompt enhancement
   * @param {string} clusterId - Cluster ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<string>} - Prompt enhancement text
   */
  async getClusterPromptEnhancement(clusterId, sessionId) {
    try {
      const enhancement = await this.queryClusteringService.getClusterPromptEnhancement(
        clusterId,
        sessionId
      );

      await this.logEvent('DEBUG', 'Retrieved cluster prompt enhancement', {
        clusterId,
        enhancementLength: enhancement.length,
        hasEnhancement: enhancement.length > 0,
        sessionId
      });

      return enhancement;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to get cluster prompt enhancement', {
        error: error.message,
        clusterId,
        sessionId
      });
      return '';
    }
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
      const success = await this.successAnalyzer.updateQueryAssignmentWithFeedback(
        assignmentId,
        feedbackAnalysis,
        sessionId
      );

      if (success && feedbackAnalysis.isPositive) {
        // Also update cluster success count
        await this.incrementClusterSuccessCount(assignmentId, sessionId);
      }

      return success;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to update query assignment with feedback', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Increment cluster success count for positive feedback
   * @param {string} assignmentId - Assignment ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async incrementClusterSuccessCount(assignmentId, sessionId) {
    try {
      // Get cluster ID from assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('cluster_id')
        .eq('id', assignmentId)
        .single();

      if (assignmentError) {
        await this.logEvent('ERROR', 'Failed to get cluster ID for success count increment', {
          error: assignmentError.message,
          assignmentId,
          sessionId
        });
        return false;
      }

      // Get current cluster data first
      const { data: currentCluster, error: selectError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('success_count, total_queries')
        .eq('id', assignment.cluster_id)
        .single();

      if (selectError) {
        await this.logEvent('ERROR', 'Failed to get current cluster data for increment', {
          error: selectError.message,
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });
        return false;
      }

      // Calculate new values
      const newSuccessCount = (currentCluster.success_count || 0) + 1;
      const newSuccessRate = currentCluster.total_queries > 0 
        ? newSuccessCount / currentCluster.total_queries 
        : 0;

      // Update cluster with incremented success count
      const { error: updateError } = await supabase
        .from('crowd_wisdom_clusters')
        .update({
          success_count: newSuccessCount,
          success_rate: newSuccessRate,
          last_success_at: new Date().toISOString()
        })
        .eq('id', assignment.cluster_id);

      if (updateError) {
        await this.logEvent('ERROR', 'Failed to increment cluster success count', {
          error: updateError.message,
          clusterId: assignment.cluster_id,
          assignmentId,
          sessionId
        });
        return false;
      }

      await this.logEvent('INFO', 'Cluster success count incremented successfully', {
        clusterId: assignment.cluster_id,
        previousSuccessCount: currentCluster.success_count || 0,
        newSuccessCount: newSuccessCount,
        newSuccessRate: newSuccessRate.toFixed(2),
        assignmentId,
        sessionId
      });

      return true;

    } catch (error) {
      await this.logEvent('ERROR', 'Error incrementing cluster success count', {
        error: error.message,
        assignmentId,
        sessionId
      });
      return false;
    }
  }

  /**
   * Log learning event to database with previous prompt enhancement
   * @param {string} clusterId - Cluster ID
   * @param {string} assignmentId - Assignment ID
   * @param {Object} successFactors - Success factors
   * @param {string} promptUpdate - New prompt update
   * @param {number} confidence - Confidence score
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - Success status
   */
  async logLearningEvent(clusterId, assignmentId, successFactors, promptUpdate, confidence, sessionId) {
    try {
      // Get the previous prompt enhancement to track learning progression
      const { data: cluster, error: clusterError } = await supabase
        .from('crowd_wisdom_clusters')
        .select('prompt_enhancement, cluster_name, success_count, total_queries')
        .eq('id', clusterId)
        .single();

      if (clusterError) {
        await this.logEvent('WARN', 'Could not retrieve previous prompt for learning log', {
          error: clusterError.message,
          clusterId,
          sessionId
        });
      }

      // Get the associated response text for this learning event
      const { data: assignment, error: assignmentError } = await supabase
        .from('crowd_wisdom_query_assignments')
        .select('response_text, query_text, similarity_score')
        .eq('id', assignmentId)
        .single();

      if (assignmentError) {
        await this.logEvent('WARN', 'Could not retrieve response text for learning log', {
          error: assignmentError.message,
          assignmentId,
          sessionId
        });
      }

      // Get count of previous learning events for this cluster
      const { count: previousLearningCount } = await supabase
        .from('crowd_wisdom_learning_logs')
        .select('*', { count: 'exact', head: true })
        .eq('cluster_id', clusterId);

      const learningEventNumber = (previousLearningCount || 0) + 1;

      // Log pre-insertion state
      await this.logEvent('INFO', '📚 PREPARING TO LOG LEARNING EVENT', {
        clusterId,
        assignmentId,
        learningEventDetails: {
          eventNumber: learningEventNumber,
          clusterName: cluster?.cluster_name || 'Unknown',
          confidenceScore: confidence,
          queryText: assignment?.query_text?.substring(0, 100) + '...' || 'Unknown',
          similarityScore: assignment?.similarity_score || 0
        },
        promptEvolution: {
          previousPromptExists: !!(cluster?.prompt_enhancement),
          previousPromptLength: cluster?.prompt_enhancement?.length || 0,
          newPromptLength: promptUpdate?.length || 0,
          isFirstPromptCreation: !cluster?.prompt_enhancement || cluster.prompt_enhancement.trim().length === 0
        },
        extractedPatterns: {
          hasSuccessFactors: !!(successFactors?.successFactors),
          hasTeachingTechniques: !!(successFactors?.teachingTechniques?.length > 0),
          hasSpecificStrengths: !!(successFactors?.specificStrengths?.length > 0),
          hasDomainApproaches: !!(successFactors?.domainSpecificApproaches?.length > 0)
        },
        sessionId
      });

      const { error } = await supabase
        .from('crowd_wisdom_learning_logs')
        .insert([
          {
            cluster_id: clusterId,
            query_assignment_id: assignmentId,
            successful_response: assignment?.response_text || null,
            extracted_patterns: successFactors,
            prompt_update: promptUpdate,
            previous_prompt_enhancement: cluster?.prompt_enhancement || null,
            confidence_score: confidence,
            learning_trigger: 'positive_feedback'
          }
        ]);

      if (error) {
        await this.logEvent('ERROR', '❌ Failed to log learning event to database', {
          error: error.message,
          clusterId,
          assignmentId,
          confidenceScore: confidence,
          sessionId
        });
        return false;
      }

      // Log successful learning event with comprehensive details
      await this.logEvent('INFO', '🎓 LEARNING EVENT SUCCESSFULLY LOGGED TO DATABASE', {
        clusterId,
        assignmentId,
        LEARNING_EVENT_SUMMARY: {
          eventNumber: learningEventNumber,
          clusterName: cluster?.cluster_name || 'Unknown',
          confidenceScore: confidence,
          trigger: 'positive_feedback'
        },
        QUERY_CONTEXT: {
          queryText: assignment?.query_text?.substring(0, 150) + '...' || 'Unknown',
          similarityScore: assignment?.similarity_score || 0,
          responseLength: assignment?.response_text?.length || 0
        },
        PROMPT_EVOLUTION_LOGGED: {
          previousPrompt: {
            existed: !!(cluster?.prompt_enhancement && cluster.prompt_enhancement.trim().length > 0),
            length: cluster?.prompt_enhancement?.length || 0,
            content: cluster?.prompt_enhancement?.substring(0, 200) + '...' || 'Empty'
          },
          newPrompt: {
            length: promptUpdate?.length || 0,
            content: promptUpdate?.substring(0, 200) + '...' || 'Empty'
          },
          evolutionType: (!cluster?.prompt_enhancement || cluster.prompt_enhancement.trim().length === 0) 
            ? 'FIRST_CREATION' 
            : 'ENHANCEMENT',
          growthAmount: (promptUpdate?.length || 0) - (cluster?.prompt_enhancement?.length || 0)
        },
        PATTERNS_CAPTURED: {
          successFactors: Object.keys(successFactors?.successFactors || {}),
          teachingTechniques: successFactors?.teachingTechniques?.length || 0,
          specificStrengths: successFactors?.specificStrengths?.length || 0,
          domainApproaches: successFactors?.domainSpecificApproaches?.length || 0,
          identifiedDomain: successFactors?.identifiedDomain || 'Unknown'
        },
        CLUSTER_LEARNING_PROGRESS: {
          totalLearningEvents: learningEventNumber,
          clusterSuccessCount: cluster?.success_count || 0,
          clusterTotalQueries: cluster?.total_queries || 0,
          clusterSuccessRate: cluster?.total_queries > 0 
            ? ((cluster.success_count / cluster.total_queries) * 100).toFixed(1) + '%'
            : '0%'
        },
        sessionId
      });

      // Enhanced console logging for learning events
      console.log('\n' + '📚'.repeat(25) + ' LEARNING EVENT ' + '📚'.repeat(25));
      console.log('🎓 CROWD WISDOM LEARNING EVENT LOGGED');
      console.log('━'.repeat(80));
      console.log('🏷️  Cluster:', cluster?.cluster_name || 'Unknown');
      console.log('🔢 Learning Event #:', learningEventNumber);
      console.log('📊 Confidence Score:', confidence.toFixed(2));
      console.log('🎯 Query Similarity:', (assignment?.similarity_score || 0).toFixed(3));
      
      const evolutionType = (!cluster?.prompt_enhancement || cluster.prompt_enhancement.trim().length === 0) 
        ? 'FIRST PROMPT CREATION' 
        : 'PROMPT ENHANCEMENT';
      
      console.log('🔄 Evolution Type:', evolutionType);
      
      if (evolutionType === 'PROMPT ENHANCEMENT') {
        console.log('📏 Prompt Growth:', 
          (cluster?.prompt_enhancement?.length || 0), 
          '→', 
          (promptUpdate?.length || 0), 
          'chars (+' + ((promptUpdate?.length || 0) - (cluster?.prompt_enhancement?.length || 0)) + ')'
        );
      } else {
        console.log('📏 Initial Prompt Length:', promptUpdate?.length || 0, 'characters');
      }
      
      console.log('🧠 Patterns Captured:');
      console.log('   • Teaching Techniques:', successFactors?.teachingTechniques?.length || 0);
      console.log('   • Specific Strengths:', successFactors?.specificStrengths?.length || 0);
      console.log('   • Domain Approaches:', successFactors?.domainSpecificApproaches?.length || 0);
      console.log('   • Domain:', successFactors?.identifiedDomain || 'Unknown');
      
      console.log('📈 Cluster Progress:', 
        cluster?.success_count || 0, 
        '/', 
        cluster?.total_queries || 0, 
        'successes (',
        cluster?.total_queries > 0 ? ((cluster.success_count / cluster.total_queries) * 100).toFixed(1) : '0',
        '%)'
      );
      
      console.log('💾 Logged at:', new Date().toISOString());
      console.log('━'.repeat(80));

      return true;

    } catch (error) {
      await this.logEvent('ERROR', '❌ Error in learning event logging process', {
        error: error.message,
        clusterId,
        assignmentId,
        confidenceScore: confidence,
        sessionId
      });
      return false;
    }
  }

  /**
   * Get crowd wisdom system statistics
   * @param {string} timeframe - Timeframe for statistics
   * @returns {Promise<Object>} - System statistics
   */
  async getSystemStats(timeframe = '24 hours') {
    try {
      const [clusteringStats, analysisStats] = await Promise.all([
        this.queryClusteringService.getClusteringStats(timeframe),
        this.successAnalyzer.getSuccessAnalysisStats(timeframe)
      ]);

      // Get learning events count
      const { count: learningEvents } = await supabase
        .from('crowd_wisdom_learning_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const stats = {
        clustering: clusteringStats,
        analysis: analysisStats,
        learning: {
          eventsInTimeframe: learningEvents || 0
        },
        system: {
          learningEnabled: this.learningEnabled,
          minFeedbackConfidence: this.minFeedbackConfidence,
          promptUpdateThreshold: this.promptUpdateThreshold
        }
      };

      await this.logEvent('INFO', 'System statistics compiled', {
        timeframe,
        stats
      });

      return stats;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to compile system statistics', {
        error: error.message,
        timeframe
      });
      return null;
    }
  }

  /**
   * Log events to the crowd wisdom system logs
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  async logEvent(level, message, metadata = {}) {
    try {
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'CrowdWisdomManager',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      console.error('[CrowdWisdomManager] Failed to log event:', error);
    }
  }
}

export default CrowdWisdomManager; 