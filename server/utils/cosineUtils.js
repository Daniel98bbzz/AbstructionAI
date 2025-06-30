import { supabase } from '../lib/supabaseClient.js';
import vectorSimilarity from './vectorSimilarity.js';

class CosineUtils {
  constructor() {
    this.similarityThreshold = 0.75; // Default threshold for cluster assignment
    this.batchSize = 100; // For batch processing of similarities
    this.useVectorSearch = true; // Use pgvector for similarity search when possible
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   * @param {Array} vectorA - First embedding vector
   * @param {Array} vectorB - Second embedding vector
   * @param {string} context - Context for logging
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<number>} - Cosine similarity score (0-1)
   */
  async calculateCosineSimilarity(vectorA, vectorB, context = 'unknown', sessionId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('DEBUG', `Calculating cosine similarity for ${context}`, {
        vectorALength: vectorA?.length,
        vectorBLength: vectorB?.length,
        context,
        sessionId
      });

      // Validate input vectors
      const validation = this.validateVectors(vectorA, vectorB);
      if (!validation.isValid) {
        await this.logEvent('WARN', 'Invalid vectors provided for similarity calculation', {
          error: validation.error,
          context,
          sessionId
        });
        return 0;
      }

      // Calculate dot product
      let dotProduct = 0;
      for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
      }

      // Calculate magnitudes
      let magnitudeA = 0;
      let magnitudeB = 0;
      for (let i = 0; i < vectorA.length; i++) {
        magnitudeA += vectorA[i] * vectorA[i];
        magnitudeB += vectorB[i] * vectorB[i];
      }

      magnitudeA = Math.sqrt(magnitudeA);
      magnitudeB = Math.sqrt(magnitudeB);

      // Avoid division by zero
      if (magnitudeA === 0 || magnitudeB === 0) {
        await this.logEvent('WARN', 'Zero magnitude vector encountered', {
          magnitudeA,
          magnitudeB,
          context,
          sessionId
        });
        return 0;
      }

      // Calculate cosine similarity
      const similarity = dotProduct / (magnitudeA * magnitudeB);
      const processingTime = Date.now() - startTime;

      await this.logEvent('DEBUG', 'Cosine similarity calculated successfully', {
        similarity,
        processingTimeMs: processingTime,
        dotProduct,
        magnitudeA: magnitudeA.toFixed(4),
        magnitudeB: magnitudeB.toFixed(4),
        context,
        sessionId
      });

      // Ensure similarity is between -1 and 1, and handle floating point errors
      const clampedSimilarity = Math.max(-1, Math.min(1, similarity));
      
      if (clampedSimilarity !== similarity) {
        await this.logEvent('WARN', 'Similarity value clamped due to floating point errors', {
          originalSimilarity: similarity,
          clampedSimilarity,
          context,
          sessionId
        });
      }

      return clampedSimilarity;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Error calculating cosine similarity', {
        error: error.message,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return 0;
    }
  }

  /**
   * Find the most similar vector from a list of candidates
   * @param {Array} queryVector - Query vector to compare against
   * @param {Array} candidateVectors - Array of candidate vectors with metadata
   * @param {string} context - Context for logging
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<Object>} - Best match with similarity score and metadata
   */
  async findMostSimilar(queryVector, candidateVectors, context = 'search', sessionId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', `Finding most similar vector among ${candidateVectors.length} candidates`, {
        candidateCount: candidateVectors.length,
        context,
        useVectorSearch: this.useVectorSearch,
        sessionId
      });

      if (!candidateVectors || candidateVectors.length === 0) {
        await this.logEvent('WARN', 'No candidate vectors provided', {
          context,
          sessionId
        });
        return null;
      }

      // Use pgvector optimization for cluster matching when possible
      if (this.useVectorSearch && context === 'cluster_matching') {
        try {
          await this.logEvent('DEBUG', 'Using pgvector for cluster similarity search', {
            context,
            sessionId
          });

          const pgvectorResults = await vectorSimilarity.findSimilarClusters(
            queryVector,
            candidateVectors.length,
            0.0 // No threshold filtering here, we'll handle that later
          );

          if (pgvectorResults && pgvectorResults.length > 0) {
            const bestMatch = pgvectorResults[0];
            const processingTime = Date.now() - startTime;

            await this.logEvent('INFO', 'pgvector similarity search completed', {
              bestSimilarity: bestMatch.similarity,
              resultsCount: pgvectorResults.length,
              processingTimeMs: processingTime,
              context,
              sessionId
            });

            return {
              id: bestMatch.id,
              similarity: bestMatch.similarity,
              representativeQuery: bestMatch.representative_query,
              promptEnhancement: bestMatch.prompt_enhancement,
              totalQueries: bestMatch.total_queries,
              successRate: bestMatch.success_rate
            };
          }
        } catch (error) {
          await this.logEvent('WARN', 'pgvector search failed, falling back to manual calculation', {
            error: error.message,
            context,
            sessionId
          });
        }
      }

      let bestMatch = null;
      let bestSimilarity = -1;
      const similarities = [];

      // Calculate similarity with each candidate
      for (let i = 0; i < candidateVectors.length; i++) {
        const candidate = candidateVectors[i];
        
        if (!candidate.embedding) {
          await this.logEvent('WARN', `Candidate ${i} missing embedding`, {
            candidateId: candidate.id,
            context,
            sessionId
          });
          continue;
        }

        const similarity = await this.calculateCosineSimilarity(
          queryVector, 
          candidate.embedding, 
          `${context}_candidate_${i}`,
          sessionId
        );

        similarities.push({
          index: i,
          similarity,
          candidateId: candidate.id
        });

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = {
            ...candidate,
            similarity
          };
        }
      }

      const processingTime = Date.now() - startTime;

      // Calculate statistics
      const avgSimilarity = similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length;
      const maxSimilarity = Math.max(...similarities.map(s => s.similarity));
      const minSimilarity = Math.min(...similarities.map(s => s.similarity));

      await this.logEvent('INFO', 'Most similar vector search completed', {
        bestSimilarity,
        avgSimilarity: avgSimilarity.toFixed(4),
        maxSimilarity,
        minSimilarity,
        candidatesProcessed: similarities.length,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return bestMatch;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Error finding most similar vector', {
        error: error.message,
        candidateCount: candidateVectors?.length || 0,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return null;
    }
  }

  /**
   * Find all vectors above similarity threshold
   * @param {Array} queryVector - Query vector to compare against
   * @param {Array} candidateVectors - Array of candidate vectors with metadata
   * @param {number} threshold - Minimum similarity threshold
   * @param {string} context - Context for logging
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<Array>} - Array of matches above threshold
   */
  async findSimilarVectors(queryVector, candidateVectors, threshold = null, context = 'filter', sessionId = null) {
    const startTime = Date.now();
    const useThreshold = threshold || this.similarityThreshold;
    
    try {
      await this.logEvent('INFO', `Finding vectors above similarity threshold ${useThreshold}`, {
        candidateCount: candidateVectors.length,
        threshold: useThreshold,
        context,
        sessionId
      });

      const matches = [];
      const allSimilarities = [];

      for (let i = 0; i < candidateVectors.length; i++) {
        const candidate = candidateVectors[i];
        
        if (!candidate.embedding) {
          continue;
        }

        const similarity = await this.calculateCosineSimilarity(
          queryVector, 
          candidate.embedding, 
          `${context}_filter_${i}`,
          sessionId
        );

        allSimilarities.push(similarity);

        if (similarity >= useThreshold) {
          matches.push({
            ...candidate,
            similarity
          });
        }
      }

      // Sort matches by similarity (descending)
      matches.sort((a, b) => b.similarity - a.similarity);

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Similar vectors filtering completed', {
        totalCandidates: candidateVectors.length,
        matchesFound: matches.length,
        threshold: useThreshold,
        avgSimilarity: (allSimilarities.reduce((sum, s) => sum + s, 0) / allSimilarities.length).toFixed(4),
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return matches;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Error filtering similar vectors', {
        error: error.message,
        threshold: useThreshold,
        candidateCount: candidateVectors?.length || 0,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return [];
    }
  }

  /**
   * Validate that two vectors are suitable for similarity calculation
   * @param {Array} vectorA - First vector
   * @param {Array} vectorB - Second vector
   * @returns {Object} - Validation result with isValid flag and error message
   */
  validateVectors(vectorA, vectorB) {
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      return {
        isValid: false,
        error: 'Vectors must be arrays'
      };
    }

    if (vectorA.length === 0 || vectorB.length === 0) {
      return {
        isValid: false,
        error: 'Vectors cannot be empty'
      };
    }

    if (vectorA.length !== vectorB.length) {
      return {
        isValid: false,
        error: `Vector dimensions don't match: ${vectorA.length} vs ${vectorB.length}`
      };
    }

    // Check for valid numeric values
    const isValidNumber = (num) => typeof num === 'number' && !isNaN(num) && isFinite(num);
    
    if (!vectorA.every(isValidNumber) || !vectorB.every(isValidNumber)) {
      return {
        isValid: false,
        error: 'Vectors contain invalid numeric values'
      };
    }

    return {
      isValid: true,
      error: null
    };
  }

  /**
   * Calculate batch similarities for multiple query vectors against candidates
   * @param {Array} queryVectors - Array of query vectors
   * @param {Array} candidateVectors - Array of candidate vectors
   * @param {string} context - Context for logging
   * @param {string} sessionId - Session ID for tracking
   * @returns {Promise<Array>} - Matrix of similarities
   */
  async calculateBatchSimilarities(queryVectors, candidateVectors, context = 'batch', sessionId = null) {
    const startTime = Date.now();
    
    try {
      await this.logEvent('INFO', 'Starting batch similarity calculation', {
        queryCount: queryVectors.length,
        candidateCount: candidateVectors.length,
        totalCalculations: queryVectors.length * candidateVectors.length,
        context,
        sessionId
      });

      const similarityMatrix = [];

      for (let i = 0; i < queryVectors.length; i++) {
        const queryVector = queryVectors[i];
        const row = [];

        for (let j = 0; j < candidateVectors.length; j++) {
          const candidateVector = candidateVectors[j];
          
          const similarity = await this.calculateCosineSimilarity(
            queryVector,
            candidateVector.embedding || candidateVector,
            `${context}_batch_${i}_${j}`,
            sessionId
          );

          row.push(similarity);
        }

        similarityMatrix.push(row);

        // Log progress for large batches
        if (queryVectors.length > 10 && (i + 1) % 5 === 0) {
          await this.logEvent('DEBUG', `Batch progress: ${i + 1}/${queryVectors.length} queries processed`, {
            progress: ((i + 1) / queryVectors.length * 100).toFixed(1) + '%',
            context,
            sessionId
          });
        }
      }

      const processingTime = Date.now() - startTime;

      await this.logEvent('INFO', 'Batch similarity calculation completed', {
        totalCalculations: queryVectors.length * candidateVectors.length,
        processingTimeMs: processingTime,
        averageTimePerCalculation: Math.round(processingTime / (queryVectors.length * candidateVectors.length)),
        context,
        sessionId
      });

      return similarityMatrix;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      await this.logEvent('ERROR', 'Batch similarity calculation failed', {
        error: error.message,
        queryCount: queryVectors?.length || 0,
        candidateCount: candidateVectors?.length || 0,
        processingTimeMs: processingTime,
        context,
        sessionId
      });

      return [];
    }
  }

  /**
   * Get similarity calculation statistics
   * @param {string} timeframe - Time frame for stats
   * @returns {Promise<Object>} - Statistics object
   */
  async getSimilarityStats(timeframe = '24 hours') {
    try {
      const { data, error } = await supabase
        .from('crowd_wisdom_system_logs')
        .select('*')
        .eq('component', 'CosineUtils')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stats = {
        totalCalculations: 0,
        averageProcessingTime: 0,
        batchOperations: 0,
        averageSimilarity: 0,
        errors: 0
      };

      let totalTime = 0;
      let calculationCount = 0;
      const similarities = [];

      data.forEach(log => {
        if (log.message.includes('Cosine similarity calculated successfully')) {
          stats.totalCalculations++;
          if (log.metadata?.processingTimeMs) {
            totalTime += log.metadata.processingTimeMs;
            calculationCount++;
          }
          if (log.metadata?.similarity !== undefined) {
            similarities.push(log.metadata.similarity);
          }
        }
        
        if (log.message.includes('batch similarity')) {
          stats.batchOperations++;
        }
        
        if (log.log_level === 'ERROR') {
          stats.errors++;
        }
      });

      if (calculationCount > 0) {
        stats.averageProcessingTime = Math.round(totalTime / calculationCount);
      }

      if (similarities.length > 0) {
        stats.averageSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
      }

      await this.logEvent('INFO', 'Similarity statistics calculated', {
        timeframe,
        stats
      });

      return stats;

    } catch (error) {
      await this.logEvent('ERROR', 'Failed to calculate similarity statistics', {
        error: error.message,
        timeframe
      });
      return null;
    }
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
        p_component: 'CosineUtils',
        p_log_level: level,
        p_message: message,
        p_metadata: metadata,
        p_session_id: metadata.sessionId || null,
        p_processing_time_ms: metadata.processingTimeMs || null
      });
    } catch (error) {
      // Don't let logging errors break the main flow
      console.error('[CosineUtils] Failed to log event:', error);
    }
  }
}

export default CosineUtils; 