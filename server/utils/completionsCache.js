import crypto from 'crypto';
import { supabase } from '../lib/supabaseClient.js';

class CompletionsCache {
  constructor() {
    this.memoryCache = new Map();
    this.maxMemoryCacheSize = 100; // Keep last 100 completions in memory
    this.cacheHitSavings = 0; // Track cost savings
  }

  /**
   * Generate hash for a completion request
   * @param {Object} request - OpenAI completion request
   * @returns {string} - SHA-256 hash
   */
  generateHash(request) {
    // Create consistent hash from request parameters
    const hashInput = JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      response_format: request.response_format,
      // Add other relevant parameters that affect the response
    });
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Estimate cost for a completion
   * @param {string} model - Model name
   * @param {number} tokens - Token count
   * @returns {number} - Estimated cost in USD
   */
  estimateCost(model, tokens) {
    // Rough cost estimates (as of 2024)
    const costPerToken = {
      'gpt-4o': 0.00003, // $30/1M tokens
      'gpt-4': 0.00003,
      'gpt-3.5-turbo': 0.000002, // $2/1M tokens
      'text-embedding-3-small': 0.0000002 // $0.02/1M tokens
    };
    
    return (costPerToken[model] || 0.00001) * tokens;
  }

  /**
   * Check memory cache first for fastest access
   * @param {string} hash - Request hash
   * @returns {Object|null} - Cached completion or null
   */
  checkMemoryCache(hash) {
    const cached = this.memoryCache.get(hash);
    if (cached) {
      console.log('[COMPLETIONS CACHE] 🚀 Memory cache hit:', {
        hash: hash.substring(0, 8) + '...',
        ageMinutes: ((Date.now() - cached.timestamp) / (1000 * 60)).toFixed(1)
      });
      return cached.completion;
    }
    return null;
  }

  /**
   * Store completion in memory cache
   * @param {string} hash - Request hash
   * @param {Object} completion - Completion response
   */
  storeInMemoryCache(hash, completion) {
    // Implement LRU eviction
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(hash, {
      completion,
      timestamp: Date.now()
    });
  }

  /**
   * Check database cache for completion
   * @param {string} hash - Request hash
   * @returns {Promise<Object|null>} - Cached completion or null
   */
  async checkDatabaseCache(hash) {
    try {
      const { data: cached, error } = await supabase
        .from('crowd_wisdom_completions_cache')
        .select('*')
        .eq('prompt_hash', hash)
        .single();

      if (error || !cached) {
        return null;
      }

      // Update last accessed time and hit count
      await supabase
        .from('crowd_wisdom_completions_cache')
        .update({
          cache_hits: cached.cache_hits + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq('id', cached.id);

      console.log('[COMPLETIONS CACHE] 💾 Database cache hit:', {
        hash: hash.substring(0, 8) + '...',
        model: cached.model,
        hitCount: cached.cache_hits + 1,
        ageHours: ((Date.now() - new Date(cached.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1),
        tokensSaved: cached.tokens_used,
        costSaved: cached.cost_estimate
      });

      this.cacheHitSavings += cached.cost_estimate || 0;

      // Also store in memory cache for future hits
      const completion = {
        choices: [{ message: { content: cached.completion_text } }],
        usage: { total_tokens: cached.tokens_used },
        model: cached.model
      };
      
      this.storeInMemoryCache(hash, completion);
      
      return completion;

    } catch (error) {
      console.error('[COMPLETIONS CACHE] Error checking database cache:', error);
      return null;
    }
  }

  /**
   * Store completion in database cache
   * @param {string} hash - Request hash
   * @param {Object} request - Original request
   * @param {Object} completion - Completion response
   * @returns {Promise<boolean>} - Success status
   */
  async storeDatabaseCache(hash, request, completion) {
    try {
      const tokensUsed = completion.usage?.total_tokens || 0;
      const costEstimate = this.estimateCost(request.model, tokensUsed);

      await supabase
        .from('crowd_wisdom_completions_cache')
        .insert([
          {
            prompt_hash: hash,
            model: request.model,
            prompt_text: JSON.stringify(request.messages),
            completion_text: completion.choices[0]?.message?.content || '',
            tokens_used: tokensUsed,
            cost_estimate: costEstimate,
            cache_hits: 0
          }
        ]);

      console.log('[COMPLETIONS CACHE] 💾 Stored in database cache:', {
        hash: hash.substring(0, 8) + '...',
        model: request.model,
        tokens: tokensUsed,
        estimatedCost: costEstimate,
        promptLength: JSON.stringify(request.messages).length
      });

      // Log to system logs with cache metadata
      await supabase.rpc('log_crowd_wisdom_event', {
        p_component: 'CompletionsCache',
        p_log_level: 'INFO',
        p_message: 'Completion cached for future reuse',
        p_metadata: {
          hash: hash.substring(0, 12),
          model: request.model,
          tokens_used: tokensUsed,
          cost_estimate: costEstimate
        },
        p_session_id: null,
        p_processing_time_ms: null
      });

      await supabase
        .from('crowd_wisdom_system_logs')
        .update({ metadata_cached: true })
        .eq('component', 'CompletionsCache')
        .order('created_at', { ascending: false })
        .limit(1);

      return true;

    } catch (error) {
      console.error('[COMPLETIONS CACHE] Error storing in database cache:', error);
      return false;
    }
  }

  /**
   * Check cache and return completion if found
   * @param {Object} request - OpenAI completion request
   * @returns {Promise<Object|null>} - Cached completion or null
   */
  async getCachedCompletion(request) {
    const hash = this.generateHash(request);
    
    // Check memory cache first (fastest)
    const memoryResult = this.checkMemoryCache(hash);
    if (memoryResult) {
      return memoryResult;
    }
    
    // Check database cache
    const databaseResult = await this.checkDatabaseCache(hash);
    if (databaseResult) {
      return databaseResult;
    }
    
    return null;
  }

  /**
   * Store completion in cache
   * @param {Object} request - Original request
   * @param {Object} completion - Completion response
   * @returns {Promise<void>}
   */
  async storeCompletion(request, completion) {
    const hash = this.generateHash(request);
    
    // Store in memory cache immediately
    this.storeInMemoryCache(hash, completion);
    
    // Store in database cache asynchronously
    this.storeDatabaseCache(hash, request, completion).catch(error => {
      console.error('[COMPLETIONS CACHE] Failed to store in database:', error);
    });
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} - Cache stats
   */
  async getCacheStats() {
    try {
      const { data: stats, error } = await supabase
        .from('crowd_wisdom_completions_cache')
        .select('model, tokens_used, cost_estimate, cache_hits')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const totalEntries = stats.length;
      const totalTokensSaved = stats.reduce((sum, entry) => sum + (entry.tokens_used * entry.cache_hits), 0);
      const totalCostSaved = stats.reduce((sum, entry) => sum + (entry.cost_estimate * entry.cache_hits), 0);
      const memoryCacheSize = this.memoryCache.size;

      return {
        totalEntries,
        memoryCacheSize,
        totalTokensSaved,
        totalCostSaved: totalCostSaved + this.cacheHitSavings,
        averageHitsPerEntry: totalEntries > 0 ? stats.reduce((sum, entry) => sum + entry.cache_hits, 0) / totalEntries : 0,
        modelBreakdown: stats.reduce((acc, entry) => {
          acc[entry.model] = (acc[entry.model] || 0) + 1;
          return acc;
        }, {})
      };

    } catch (error) {
      console.error('[COMPLETIONS CACHE] Error getting cache stats:', error);
      return {
        totalEntries: 0,
        memoryCacheSize: this.memoryCache.size,
        totalTokensSaved: 0,
        totalCostSaved: this.cacheHitSavings,
        averageHitsPerEntry: 0,
        modelBreakdown: {}
      };
    }
  }

  /**
   * Clean up old cache entries
   * @param {number} maxAgeHours - Maximum age in hours
   * @returns {Promise<number>} - Number of entries cleaned up
   */
  async cleanupCache(maxAgeHours = 168) { // Default: 1 week
    try {
      const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
      
      const { data: toDelete, error: selectError } = await supabase
        .from('crowd_wisdom_completions_cache')
        .select('id')
        .lt('last_accessed_at', cutoffDate);

      if (selectError) {
        throw selectError;
      }

      if (toDelete && toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('crowd_wisdom_completions_cache')
          .delete()
          .lt('last_accessed_at', cutoffDate);

        if (deleteError) {
          throw deleteError;
        }

        console.log(`[COMPLETIONS CACHE] 🧹 Cleaned up ${toDelete.length} old cache entries`);
        return toDelete.length;
      }

      return 0;

    } catch (error) {
      console.error('[COMPLETIONS CACHE] Error cleaning up cache:', error);
      return 0;
    }
  }
}

// Export singleton instance
const completionsCache = new CompletionsCache();
export default completionsCache; 