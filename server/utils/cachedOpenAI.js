import { OpenAI } from 'openai';
import completionsCache from './completionsCache.js';

class CachedOpenAI {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
    this.cachingEnabled = true;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalSavings: 0
    };
  }

  /**
   * Cached chat completions with automatic cache check and store
   * @param {Object} params - OpenAI chat completion parameters
   * @returns {Promise<Object>} - Completion response
   */
  async chatCompletions(params) {
    if (!this.cachingEnabled) {
      return await this.client.chat.completions.create(params);
    }

    try {
      // Check cache first
      console.log('[CACHED OPENAI] 🔍 Checking cache for completion request...');
      const cachedResult = await completionsCache.getCachedCompletion(params);
      
      if (cachedResult) {
        this.cacheStats.hits++;
        
        // Calculate savings
        const tokensUsed = cachedResult.usage?.total_tokens || 0;
        const estimatedCost = completionsCache.estimateCost(params.model, tokensUsed);
        this.cacheStats.totalSavings += estimatedCost;
        
        console.log('[CACHED OPENAI] ⚡ Cache hit! Returning cached completion:', {
          model: params.model,
          tokensUsed,
          estimatedSavings: estimatedCost,
          totalCacheHits: this.cacheStats.hits,
          totalSavings: this.cacheStats.totalSavings.toFixed(4)
        });
        
        return cachedResult;
      }

      // Cache miss - make API call
      console.log('[CACHED OPENAI] 📡 Cache miss, making OpenAI API call...');
      this.cacheStats.misses++;
      
      const result = await this.client.chat.completions.create(params);
      
      console.log('[CACHED OPENAI] ✅ OpenAI API call completed:', {
        model: params.model,
        tokensUsed: result.usage?.total_tokens || 0,
        totalCacheMisses: this.cacheStats.misses
      });

      // Store in cache asynchronously
      if (result && result.choices && result.choices.length > 0) {
        completionsCache.storeCompletion(params, result).catch(error => {
          console.error('[CACHED OPENAI] Error storing completion in cache:', error);
        });
      }

      return result;

    } catch (error) {
      console.error('[CACHED OPENAI] Error in cached completion:', error);
      throw error;
    }
  }

  /**
   * Cached embeddings creation
   * @param {Object} params - OpenAI embeddings parameters
   * @returns {Promise<Object>} - Embeddings response
   */
  async embeddings(params) {
    if (!this.cachingEnabled) {
      return await this.client.embeddings.create(params);
    }

    try {
      // Check cache for embeddings
      console.log('[CACHED OPENAI] 🔍 Checking cache for embeddings request...');
      const cachedResult = await completionsCache.getCachedCompletion({
        ...params,
        type: 'embeddings'
      });
      
      if (cachedResult) {
        this.cacheStats.hits++;
        
        console.log('[CACHED OPENAI] ⚡ Embeddings cache hit!');
        return cachedResult;
      }

      // Cache miss - make API call
      console.log('[CACHED OPENAI] 📡 Embeddings cache miss, making OpenAI API call...');
      this.cacheStats.misses++;
      
      const result = await this.client.embeddings.create(params);
      
      // Store in cache
      if (result && result.data && result.data.length > 0) {
        completionsCache.storeCompletion({
          ...params,
          type: 'embeddings'
        }, result).catch(error => {
          console.error('[CACHED OPENAI] Error storing embeddings in cache:', error);
        });
      }

      return result;

    } catch (error) {
      console.error('[CACHED OPENAI] Error in cached embeddings:', error);
      throw error;
    }
  }

  /**
   * Get the underlying OpenAI client for non-cached operations
   * @returns {OpenAI} - Original OpenAI client
   */
  getClient() {
    return this.client;
  }

  /**
   * Enable or disable caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCachingEnabled(enabled) {
    this.cachingEnabled = enabled;
    console.log(`[CACHED OPENAI] Caching ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 ? (this.cacheStats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.cacheStats,
      totalRequests,
      hitRate: hitRate.toFixed(2) + '%'
    };
  }

  /**
   * Clear cache statistics
   */
  clearStats() {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalSavings: 0
    };
  }

  // Proxy other methods to the original client
  get chat() {
    return {
      completions: {
        create: this.chatCompletions.bind(this)
      }
    };
  }

  get embeddings() {
    return {
      create: this.embeddings.bind(this)
    };
  }
}

export default CachedOpenAI; 