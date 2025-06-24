// Frontend embedding utility - uses simple text hashing instead of OpenAI API
// For production use, embeddings should be generated server-side for security

/**
 * Generate a simple hash-based embedding for text (client-side only)
 * This is a fallback for when API-based embeddings are not available
 * @param {string} text - Text to embed
 * @returns {Array|null} - Simple hash-based embedding vector (1536D to match text-embedding-ada-002)
 */
export function generateEmbedding(text) {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }

    // Create a simple hash-based embedding
    // This is NOT as sophisticated as OpenAI embeddings but works client-side
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    
    // Create a 1536-dimensional vector (to match text-embedding-ada-002 dimensions)
    const embedding = new Array(1536).fill(0);
    
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
      const baseIndex = hash % 1500; // Use first 1500 dimensions for word positions
      
      // Set multiple positions to create word representation
      for (let i = 0; i < 3; i++) {
        const pos = (baseIndex + i * 97) % 1536; // Use prime number for distribution
        embedding[pos] += 1 / Math.sqrt(words.length); // Normalize by document length
      }
    });
    
    // Add some text statistics to remaining dimensions
    embedding[1532] = text.length / 1000; // Text length feature
    embedding[1533] = words.length / 50; // Word count feature
    embedding[1534] = new Set(words).size / words.length; // Vocabulary diversity
    embedding[1535] = (text.match(/[.!?]/g) || []).length / 10; // Sentence count feature
    
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

// Create a 1536-dimensional vector (to match text-embedding-ada-002 dimensions)
function createRandomEmbedding() {
  const dimensions = 1536; // text-embedding-ada-002 dimensions
  const embedding = [];
  for (let i = 0; i < dimensions; i++) {
    // Generate random values between -1 and 1
    embedding.push((Math.random() - 0.5) * 2);
  }
  return embedding;
} 