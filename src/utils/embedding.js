// Frontend embedding utility - uses simple text hashing instead of OpenAI API
// For production use, embeddings should be generated server-side for security

/**
 * Generate a simple hash-based embedding for text (client-side only)
 * This is a fallback for when API-based embeddings are not available
 * @param {string} text - Text to embed
 * @returns {Array|null} - Simple hash-based embedding vector
 */
export function generateEmbedding(text) {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }

    // Create a simple hash-based embedding
    // This is NOT as sophisticated as OpenAI embeddings but works client-side
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    
    // Create a 384-dimensional vector (to match text-embedding-3-small dimensions)
    const embedding = new Array(384).fill(0);
    
    // Simple hash function for words
    function simpleHash(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash);
    }
    
    // Populate embedding based on word hashes
    words.forEach((word, wordIndex) => {
      const hash = simpleHash(word);
      const baseIndex = hash % 300; // Use first 300 dimensions for word positions
      
      // Set multiple positions to create word representation
      for (let i = 0; i < 3; i++) {
        const pos = (baseIndex + i * 97) % 384; // Use prime number for distribution
        embedding[pos] += 1 / Math.sqrt(words.length); // Normalize by document length
      }
    });
    
    // Add some text statistics to remaining dimensions
    embedding[380] = text.length / 1000; // Text length feature
    embedding[381] = words.length / 50; // Word count feature
    embedding[382] = new Set(words).size / words.length; // Vocabulary diversity
    embedding[383] = (text.match(/[.!?]/g) || []).length / 10; // Sentence count feature
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  } catch (err) {
    console.error('[Embedding] Error generating client-side embedding:', err.message);
    return null;
  }
} 