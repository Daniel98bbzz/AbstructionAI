import { OpenAI } from 'openai';
import { supabase } from '../lib/supabaseClient.js';
import CachedOpenAI from './cachedOpenAI.js';

class EmbeddingGenerator {
  constructor(openaiClient) {
    // Use cached OpenAI client if provided with API key, otherwise use provided client
    if (typeof openaiClient === 'string') {
      this.openai = new CachedOpenAI(openaiClient);
    } else if (openaiClient instanceof CachedOpenAI) {
      this.openai = openaiClient;
    } else {
      // Wrap existing OpenAI client with caching
      this.openai = new CachedOpenAI(process.env.OPENAI_API_KEY);
    }
    
    this.modelName = 'text-embedding-3-small';
    this.embeddingDimensions = 1536;
    this.rateLimitDelay = 100; // ms between requests to avoid rate limits
    this.cachingEnabled = true; // Enable caching for embeddings
  }

  /**
   * Generate embedding for text using OpenAI API
   * @param {string} text - Text to embed
   * @param {string} context - Context for logging (e.g., 'query', 'response')
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<Array>} - Embedding vector
   */
  async generateEmbedding(text, context = 'unknown', sessionId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', `Starting embedding generation for ${context}`, {
        textLength: text.length,
        context,
        sessionId
      });

      if (!text || text.trim().length === 0) {
        await this.logEvent('WARN', 'Empty or null text provided for embedding', {
          context,
          sessionId
        });
        return null;
      }

      // Clean and prepare text
      const cleanedText = this.preprocessText(text);
      
      await this.logEvent('DEBUG', 'Text preprocessed for embedding', {
        originalLength: text.length,
        cleanedLength: cleanedText.length,
        context,
        sessionId
      });

      // Generate embedding using OpenAI
      const response = await this.openai.embeddings.create({
        model: this.modelName,
        input: cleanedText,
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Embedding generated successfully', {
        context,
        sessionId,
        processingTimeMs: processingTime,
        embeddingDimensions: embedding.length,
        tokensUsed: response.usage?.total_tokens || 0
      });

      // Validate embedding
      if (!this.validateEmbedding(embedding)) {
        await this.logEvent('ERROR', 'Generated embedding failed validation', {
          context,
          sessionId,
          embeddingLength: embedding?.length,
          processingTimeMs: processingTime
        });
        return null;
      }

      return embedding;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Failed to generate embedding', {
        error: error.message,
        context,
        sessionId,
        processingTimeMs: processingTime,
        textLength: text?.length || 0
      });

      // Handle specific OpenAI errors
      if (error.message.includes('rate_limit')) {
        await this.logEvent('WARN', 'Rate limit hit, will retry with delay', {
          context,
          sessionId,
          retryDelayMs: this.rateLimitDelay * 2
        });
        
        // Wait and retry once
        await this.delay(this.rateLimitDelay * 2);
        return this.generateEmbedding(text, context, sessionId);
      }

      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {Array<string>} texts - Array of texts to embed
   * @param {string} context - Context for logging
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<Array<Array>>} - Array of embedding vectors
   */
  async generateBatchEmbeddings(texts, context = 'batch', sessionId = null) {
    const startTime = Date.now();
    
    await this.logEvent('INFO', 'Starting batch embedding generation', {
      batchSize: texts.length,
      context,
      sessionId
    });

    try {
      const embeddings = [];
      
      // Process in smaller batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        await this.logEvent('DEBUG', `Processing batch ${Math.floor(i/batchSize) + 1}`, {
          batchIndex: Math.floor(i/batchSize) + 1,
          batchSize: batch.length,
          totalBatches: Math.ceil(texts.length / batchSize),
          context,
          sessionId
        });

        const batchEmbeddings = await Promise.all(
          batch.map((text, index) => 
            this.generateEmbedding(text, `${context}_batch_${i + index}`, sessionId)
          )
        );

        embeddings.push(...batchEmbeddings);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await this.delay(this.rateLimitDelay);
        }
      }

      const processingTime = Date.now() - startTime;
      
      await this.logEvent('INFO', 'Batch embedding generation completed', {
        totalEmbeddings: embeddings.length,
        successfulEmbeddings: embeddings.filter(e => e !== null).length,
        failedEmbeddings: embeddings.filter(e => e === null).length,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return embeddings;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Batch embedding generation failed', {
        error: error.message,
        batchSize: texts.length,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      throw error;
    }
  }

  /**
   * Preprocess text before embedding generation
   * @param {string} text - Raw text
   * @returns {string} - Cleaned text
   */
  preprocessText(text) {
    if (!text) return '';
    
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long (OpenAI has token limits)
    const maxLength = 8000; // Conservative limit
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }
    
    return cleaned;
  }

  /**
   * Validate embedding vector
   * @param {Array} embedding - Embedding vector to validate
   * @returns {boolean} - Whether embedding is valid
   */
  validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      return false;
    }
    
    if (embedding.length !== this.embeddingDimensions) {
      return false;
    }
    
    // Check for NaN or infinite values
    return embedding.every(val => 
      typeof val === 'number' && 
      !isNaN(val) && 
      isFinite(val)
    );
  }

  /**
   * Delay function for rate limiting
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log events to the crowd wisdom system logs
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  async logEvent(level, message, metadata = {}) {
    try {
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'EmbeddingGenerator',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      // Don't let logging errors break the main flow
      console.error('[EmbeddingGenerator] Failed to log event:', error);
    }
  }

  /**
   * Get embedding generation statistics
   * @param {string} timeframe - Time frame for stats (e.g., '24 hours')
   * @returns {Promise<Object>} - Statistics object
   */
  async getEmbeddingStats(timeframe = '24 hours') {
    try {
      const { data, error } = await supabase
        .from('crowd_wisdom_system_logs')
        .select('*')
        .eq('component', 'EmbeddingGenerator')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageProcessingTime: 0,
        totalTokensUsed: 0,
        rateLimitHits: 0
      };

      let totalProcessingTime = 0;
      let processedRequests = 0;

      data.forEach(log => {
        if (log.message.includes('Starting embedding generation')) {
          stats.totalRequests++;
        }
        
        if (log.message.includes('generated successfully')) {
          stats.successfulRequests++;
          if (log.metadata?.processingTimeMs) {
            totalProcessingTime += log.metadata.processingTimeMs;
            processedRequests++;
          }
          if (log.metadata?.tokensUsed) {
            stats.totalTokensUsed += log.metadata.tokensUsed;
          }
        }
        
        if (log.log_level === 'ERROR') {
          stats.failedRequests++;
        }
        
        if (log.message.includes('rate_limit')) {
          stats.rateLimitHits++;
        }
      });

      if (processedRequests > 0) {
        stats.averageProcessingTime = Math.round(totalProcessingTime / processedRequests);
      }

      await this.logEvent('INFO', 'Embedding statistics calculated', {
        timeframe,
        stats
      });

      return stats;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to calculate embedding statistics', {
        error: error.message,
        timeframe
      });
      return null;
    }
  }
}

export default EmbeddingGenerator; 