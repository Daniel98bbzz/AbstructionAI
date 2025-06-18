import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for feedback content
 * @param {string} content - Feedback content to embed
 * @returns {Array} Embedding vector
 */
export async function generateFeedbackEmbedding(content) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content,
      encoding_format: "float",
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT] Error generating embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two embedding vectors
 * @param {Array} vecA - First embedding vector
 * @param {Array} vecB - Second embedding vector
 * @returns {number} Cosine similarity score (0-1)
 */
export function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Simple k-means clustering for feedback embeddings
 * @param {Array} feedbacks - Array of feedback objects with embeddings
 * @param {number} k - Number of clusters
 * @returns {Array} Array of clusters, each containing feedback objects
 */
export async function clusterFeedbackEmbeddings(feedbacks, k = 5) {
  if (!feedbacks || feedbacks.length < k) {
    return [feedbacks]; // Return all feedbacks in one cluster if not enough data
  }

  const embeddings = feedbacks.map(f => f.embedding);
  const dimensions = embeddings[0].length;

  // Initialize centroids randomly
  const centroids = [];
  for (let i = 0; i < k; i++) {
    const centroid = [];
    for (let j = 0; j < dimensions; j++) {
      centroid.push(Math.random() - 0.5);
    }
    centroids.push(centroid);
  }

  let clusters = [];
  let maxIterations = 100;
  let iteration = 0;

  while (iteration < maxIterations) {
    // Assign each point to closest centroid
    const newClusters = Array(k).fill().map(() => []);

    feedbacks.forEach((feedback, index) => {
      let minDistance = Infinity;
      let closestCentroid = 0;

      centroids.forEach((centroid, centroidIndex) => {
        const distance = 1 - calculateCosineSimilarity(embeddings[index], centroid);
        if (distance < minDistance) {
          minDistance = distance;
          closestCentroid = centroidIndex;
        }
      });

      newClusters[closestCentroid].push(feedback);
    });

    // Update centroids
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (newClusters[i].length === 0) continue;

      const newCentroid = Array(dimensions).fill(0);
      newClusters[i].forEach(feedback => {
        feedback.embedding.forEach((val, dim) => {
          newCentroid[dim] += val;
        });
      });

      newCentroid.forEach((val, dim) => {
        newCentroid[dim] = val / newClusters[i].length;
      });

      // Check if centroid changed significantly
      const centroidChange = calculateCosineSimilarity(centroids[i], newCentroid);
      if (centroidChange < 0.99) {
        changed = true;
      }

      centroids[i] = newCentroid;
    }

    clusters = newClusters;
    iteration++;

    // Stop if centroids haven't changed much
    if (!changed) break;
  }

  // Filter out empty clusters
  return clusters.filter(cluster => cluster.length > 0);
}

/**
 * Moderate content using OpenAI's moderation API
 * @param {string} content - Content to moderate
 * @returns {Object} Moderation results
 */
export async function moderateContent(content) {
  try {
    const response = await openai.moderations.create({
      input: content,
    });

    const result = response.results[0];
    
    return {
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.category_scores,
      safe: !result.flagged
    };
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT] Error moderating content:', error);
    return {
      flagged: false,
      categories: {},
      categoryScores: {},
      safe: true,
      error: error.message
    };
  }
}

/**
 * Classify feedback using NLP
 * @param {string} content - Feedback content
 * @returns {Object} Classification results
 */
export async function classifyWithNLP(content) {
  try {
    const prompt = `Analyze this user feedback and provide:
1. Sentiment (positive/negative/neutral)
2. Intent category (bug_report/feature_request/general_feedback/question/complaint/praise)
3. Urgency level (low/medium/high)
4. Key topics mentioned (up to 3)

Feedback: "${content}"

Respond in JSON format:
{
  "sentiment": "positive|negative|neutral",
  "intent": "bug_report|feature_request|general_feedback|question|complaint|praise",
  "urgency": "low|medium|high",
  "topics": ["topic1", "topic2", "topic3"],
  "confidence": 0.95
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      success: true,
      classification: result
    };
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT] Error classifying with NLP:', error);
    return {
      success: false,
      error: error.message,
      classification: {
        sentiment: 'neutral',
        intent: 'general_feedback',
        urgency: 'low',
        topics: [],
        confidence: 0
      }
    };
  }
}

/**
 * Score feedback quality based on multiple factors
 * @param {string} content - Feedback content
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Quality score and breakdown
 */
export async function scoreFeedbackQuality(content, metadata = {}) {
  try {
    let score = 0;
    const breakdown = {};

    // Length scoring (10-30 points)
    const wordCount = content.trim().split(/\s+/).length;
    if (wordCount >= 50) {
      breakdown.length = 30;
    } else if (wordCount >= 20) {
      breakdown.length = 20;
    } else if (wordCount >= 5) {
      breakdown.length = 10;
    } else {
      breakdown.length = 0;
    }

    // Specificity scoring (10-25 points)
    const specificityKeywords = [
      'when', 'where', 'how', 'why', 'specific', 'example', 'step',
      'reproduce', 'error', 'issue', 'problem', 'feature', 'improve'
    ];
    const specificityCount = specificityKeywords.filter(keyword =>
      content.toLowerCase().includes(keyword)
    ).length;
    breakdown.specificity = Math.min(specificityCount * 5, 25);

    // Constructiveness scoring (10-25 points)
    const constructiveKeywords = [
      'suggest', 'recommend', 'improve', 'better', 'would like',
      'could', 'should', 'perhaps', 'maybe', 'solution'
    ];
    const constructiveCount = constructiveKeywords.filter(keyword =>
      content.toLowerCase().includes(keyword)
    ).length;
    breakdown.constructiveness = Math.min(constructiveCount * 5, 25);

    // Clarity scoring (5-20 points)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = content.length / sentences.length;
    if (avgSentenceLength > 20 && avgSentenceLength < 150) {
      breakdown.clarity = 20;
    } else if (avgSentenceLength > 10 && avgSentenceLength < 200) {
      breakdown.clarity = 15;
    } else {
      breakdown.clarity = 5;
    }

    // Calculate total score
    score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    // Apply metadata bonuses
    if (metadata.hasScreenshot) {
      breakdown.hasScreenshot = 5;
      score += 5;
    }
    if (metadata.hasSteps) {
      breakdown.hasSteps = 5;
      score += 5;
    }

    return {
      success: true,
      score: Math.min(score, 100), // Cap at 100
      breakdown,
      grade: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
    };
  } catch (error) {
    console.error('[FEEDBACK ENHANCEMENT] Error scoring quality:', error);
    return {
      success: false,
      error: error.message,
      score: 0,
      breakdown: {},
      grade: 'poor'
    };
  }
} 