import { generateEmbedding } from './embedding.js';
import { supabase } from '../lib/supabaseClient.js';

// Debug mode
const DEBUG = true;

// Profanity and spam detection patterns
const SPAM_PATTERNS = [
  /\b(spam|advertisement|ad|promotion|click here|buy now|free money|get rich)\b/gi,
  /\b(viagra|pharmacy|casino|gambling|lottery|winner)\b/gi,
  /(.)\1{4,}/g, // Repeated characters (e.g., "hellooooo")
  /^(.+)\1+$/g, // Repeated words
];

const PROFANITY_PATTERNS = [
  /\b(fuck|shit|damn|bitch|asshole|crap)\b/gi,
  // Add more as needed, but keep it reasonable
];

// Minimum content requirements
const MIN_MESSAGE_LENGTH = 3;
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Moderate content for spam and inappropriate material
 * @param {string} message - The message to moderate
 * @returns {boolean} - True if content is appropriate, false if spam/inappropriate
 */
export function moderateContent(message) {
  if (DEBUG) {
    console.log('[FEEDBACK ENHANCEMENT DEBUG] Moderating content:', message);
  }

  // Check message length
  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Message failed length check');
    }
    return false;
  }

  // Check for spam patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(message)) {
      if (DEBUG) {
        console.log('[FEEDBACK ENHANCEMENT DEBUG] Message matched spam pattern:', pattern);
      }
      return false;
    }
  }

  // Check for profanity (optional - you may want to be more lenient)
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(message)) {
      if (DEBUG) {
        console.log('[FEEDBACK ENHANCEMENT DEBUG] Message matched profanity pattern:', pattern);
      }
      return false;
    }
  }

  // Check for excessive capitalization
  const upperCaseRatio = (message.match(/[A-Z]/g) || []).length / message.length;
  if (upperCaseRatio > 0.7 && message.length > 10) {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Message has excessive capitalization');
    }
    return false;
  }

  // Check for suspicious patterns (all numbers, etc.)
  if (/^[0-9\s]+$/.test(message) && message.length > 5) {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Message is mostly numbers');
    }
    return false;
  }

  if (DEBUG) {
    console.log('[FEEDBACK ENHANCEMENT DEBUG] Content passed moderation');
  }

  return true;
}

/**
 * Classify feedback using pattern matching (client-side, no API calls)
 * @param {string} message - The message to classify
 * @returns {string} - The classification result
 */
export function classifyWithPatterns(message) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Using pattern classification for:', message);
    }

    const lowerMessage = message.toLowerCase();

    // Positive patterns
    const positivePatterns = [
      /\b(thank|thanks|great|good|excellent|amazing|helpful|love|perfect|awesome|fantastic)\b/gi,
      /\b(works? well|easy to use|user.?friendly|impressed|satisfied)\b/gi,
      /\b(exactly what|just what|perfect for)\b/gi
    ];

    // Negative patterns  
    const negativePatterns = [
      /\b(bug|error|problem|issue|broken|doesn.?t work|not working|confusing|frustrated|hate)\b/gi,
      /\b(difficult|hard to|can.?t find|can.?t figure|doesn.?t make sense)\b/gi,
      /\b(terrible|awful|horrible|worst|useless|annoying)\b/gi
    ];

    // Neutral patterns
    const neutralPatterns = [
      /\b(okay|ok|fine|alright|noticed|observed|see that|appears)\b/gi,
      /\b(suggestion|could|might|maybe|perhaps|consider)\b/gi
    ];

    // Count matches
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;

    for (const pattern of positivePatterns) {
      const matches = lowerMessage.match(pattern) || [];
      positiveScore += matches.length;
    }

    for (const pattern of negativePatterns) {
      const matches = lowerMessage.match(pattern) || [];
      negativeScore += matches.length;
    }

    for (const pattern of neutralPatterns) {
      const matches = lowerMessage.match(pattern) || [];
      neutralScore += matches.length;
    }

    // Determine classification
    let classification = 'unknown';
    if (positiveScore > negativeScore && positiveScore > neutralScore && positiveScore > 0) {
      classification = 'positive';
    } else if (negativeScore > positiveScore && negativeScore > neutralScore && negativeScore > 0) {
      classification = 'negative';
    } else if (neutralScore > 0 || (positiveScore === 0 && negativeScore === 0)) {
      classification = 'neutral';
    }

    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Pattern classification result:', classification, 
                  `(pos: ${positiveScore}, neg: ${negativeScore}, neu: ${neutralScore})`);
    }

    return classification;
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT DEBUG] Error in pattern classification:', error);
    return 'unknown';
  }
}

/**
 * Score feedback quality based on multiple factors
 * @param {string} message - The message to score
 * @returns {number} - Quality score from 0 to 100
 */
export function scoreFeedbackQuality(message) {
  if (DEBUG) {
    console.log('[FEEDBACK ENHANCEMENT DEBUG] Scoring feedback quality for:', message);
  }

  let score = 0;
  const factors = [];

  // Factor 1: Message length (optimal range: 10-200 characters)
  const length = message.length;
  let lengthScore = 0;
  if (length >= 10 && length <= 200) {
    lengthScore = 30;
  } else if (length > 200) {
    lengthScore = Math.max(0, 30 - (length - 200) * 0.1);
  } else {
    lengthScore = length * 3; // 3 points per character under 10
  }
  score += lengthScore;
  factors.push(`length: ${lengthScore.toFixed(1)}`);

  // Factor 2: Word count and vocabulary diversity
  const words = message.toLowerCase().match(/\b\w+\b/g) || [];
  const uniqueWords = new Set(words);
  const wordDiversity = uniqueWords.size / Math.max(words.length, 1);
  const diversityScore = Math.min(25, wordDiversity * 50);
  score += diversityScore;
  factors.push(`diversity: ${diversityScore.toFixed(1)}`);

  // Factor 3: Specificity indicators (nouns, adjectives, specific terms)
  const specificityPatterns = [
    /\b(problem|issue|bug|error|feature|function|interface|design)\b/gi,
    /\b(confusing|clear|helpful|difficult|easy|complex|simple)\b/gi,
    /\b(because|when|where|how|why|what)\b/gi,
  ];
  
  let specificityScore = 0;
  for (const pattern of specificityPatterns) {
    const matches = message.match(pattern) || [];
    specificityScore += matches.length * 5;
  }
  specificityScore = Math.min(20, specificityScore);
  score += specificityScore;
  factors.push(`specificity: ${specificityScore.toFixed(1)}`);

  // Factor 4: Emotional indicators (positive or negative)
  const emotionalPatterns = [
    /\b(love|hate|frustrated|excited|disappointed|impressed|amazing|terrible)\b/gi,
    /[!]{1,3}|[?]{1,3}/g, // Punctuation showing emotion
  ];
  
  let emotionalScore = 0;
  for (const pattern of emotionalPatterns) {
    const matches = message.match(pattern) || [];
    emotionalScore += matches.length * 3;
  }
  emotionalScore = Math.min(15, emotionalScore);
  score += emotionalScore;
  factors.push(`emotional: ${emotionalScore.toFixed(1)}`);

  // Factor 5: Constructiveness (suggestions, questions)
  const constructivePatterns = [
    /\b(suggest|recommend|could|should|might|perhaps|maybe)\b/gi,
    /\b(improve|better|enhance|fix|change)\b/gi,
  ];
  
  let constructiveScore = 0;
  for (const pattern of constructivePatterns) {
    const matches = message.match(pattern) || [];
    constructiveScore += matches.length * 4;
  }
  constructiveScore = Math.min(10, constructiveScore);
  score += constructiveScore;
  factors.push(`constructive: ${constructiveScore.toFixed(1)}`);

  // Normalize to 0-100 scale
  const finalScore = Math.min(100, Math.round(score));

  if (DEBUG) {
    console.log('[FEEDBACK ENHANCEMENT DEBUG] Quality score factors:', factors.join(', '));
    console.log('[FEEDBACK ENHANCEMENT DEBUG] Final quality score:', finalScore);
  }

  return finalScore;
}

/**
 * Generate embedding for feedback message using existing embedding utility
 * @param {string} message - The message to embed
 * @returns {Array|null} - The embedding vector or null if failed
 */
export function generateFeedbackEmbedding(message) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Generating embedding for feedback');
    }

    const embedding = generateEmbedding(message);
    
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Embedding generated successfully');
    }
    
    return embedding;
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT DEBUG] Error generating feedback embedding:', error);
    return null;
  }
}

/**
 * Calculate similarity between two embedding vectors using cosine similarity
 * @param {Array} embedding1 - First embedding vector
 * @param {Array} embedding2 - Second embedding vector
 * @returns {number} - Similarity score between 0 and 1
 */
export function calculateCosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (norm1 * norm2);
}

/**
 * Cluster feedback using embeddings and existing clustering infrastructure
 * This will be used for thematic analysis
 * @param {Array} feedbackData - Array of feedback objects with embeddings
 * @param {number} numClusters - Number of clusters to create
 * @returns {Promise<Object>} - Clustering results
 */
export async function clusterFeedbackEmbeddings(feedbackData, numClusters = 5) {
  try {
    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Clustering feedback with', feedbackData.length, 'items');
    }

    if (feedbackData.length < numClusters) {
      console.warn('[FEEDBACK ENHANCEMENT DEBUG] Not enough feedback items for clustering');
      return {
        clusters: [],
        assignments: [],
        centroids: []
      };
    }

    // Extract embeddings
    const embeddings = feedbackData.map(item => item.embedding).filter(emb => emb);

    if (embeddings.length === 0) {
      console.warn('[FEEDBACK ENHANCEMENT DEBUG] No valid embeddings found');
      return {
        clusters: [],
        assignments: [],
        centroids: []
      };
    }

    // Use simple k-means clustering (we can integrate with ModernClusterManager later)
    const { UMAP } = await import('umap-js');
    const mlKmeans = await import('ml-kmeans');

    // Reduce dimensionality with UMAP for better clustering
    const umap = new UMAP({
      nComponents: Math.min(10, embeddings[0].length), // Reduce to 10D or less
      nNeighbors: Math.min(15, embeddings.length - 1),
      minDist: 0.1,
      spread: 1.0,
    });

    const reducedEmbeddings = umap.fit(embeddings);

    // Perform k-means clustering
    const kmeans = mlKmeans.default(reducedEmbeddings, numClusters, {
      maxIterations: 100,
      tolerance: 1e-4,
    });

    // Create cluster summaries
    const clusters = [];
    for (let i = 0; i < numClusters; i++) {
      const clusterFeedback = feedbackData.filter((_, idx) => kmeans.clusters[idx] === i);
      
      if (clusterFeedback.length > 0) {
        clusters.push({
          id: i,
          size: clusterFeedback.length,
          feedback: clusterFeedback,
          centroid: kmeans.centroids[i],
          // We'll add theme analysis later
          themes: await extractClusterThemes(clusterFeedback)
        });
      }
    }

    if (DEBUG) {
      console.log('[FEEDBACK ENHANCEMENT DEBUG] Created', clusters.length, 'feedback clusters');
    }

    return {
      clusters,
      assignments: kmeans.clusters,
      centroids: kmeans.centroids
    };

  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT DEBUG] Error clustering feedback:', error);
    return {
      clusters: [],
      assignments: [],
      centroids: []
    };
  }
}

/**
 * Extract themes from a cluster of feedback
 * @param {Array} clusterFeedback - Feedback items in the cluster
 * @returns {Promise<Object>} - Theme analysis
 */
async function extractClusterThemes(clusterFeedback) {
  try {
    // Extract common words/phrases
    const allText = clusterFeedback.map(item => item.message).join(' ').toLowerCase();
    const words = allText.match(/\b\w+\b/g) || [];
    
    // Count word frequency
    const wordFreq = {};
    words.forEach(word => {
      if (word.length > 2) { // Ignore very short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Get top words
    const topWords = Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    // Calculate average sentiment
    const sentiments = clusterFeedback.map(item => item.feedback_type);
    const sentimentCounts = {
      positive: sentiments.filter(s => s === 'positive').length,
      negative: sentiments.filter(s => s === 'negative').length,
      neutral: sentiments.filter(s => s === 'neutral').length
    };

    const totalSentiments = sentiments.length;
    const avgSentiment = {
      positive: sentimentCounts.positive / totalSentiments,
      negative: sentimentCounts.negative / totalSentiments,
      neutral: sentimentCounts.neutral / totalSentiments
    };

    return {
      topWords,
      avgSentiment,
      size: clusterFeedback.length,
      sampleMessages: clusterFeedback.slice(0, 3).map(item => item.message)
    };
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT DEBUG] Error extracting themes:', error);
    return {
      topWords: [],
      avgSentiment: { positive: 0, negative: 0, neutral: 0 },
      size: 0,
      sampleMessages: []
    };
  }
} 