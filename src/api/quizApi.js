import axios from 'axios';

/**
 * Generate quiz questions based on conversation content
 * @param {string} query - The main topic/query to generate questions about
 * @param {Object} options - Additional options for quiz generation
 * @returns {Promise<Object>} - The generated quiz questions
 */
export async function generateQuizQuestions(query, options = {}) {
  try {
    const response = await axios.post(`http://localhost:3001/api/generate-quiz`, {
      query,
      difficulty: options.difficultyLevel || 'medium',
      userId: options.userId,
      content: options.content
    });
    
    return response.data;
  } catch (error) {
    console.error('Error generating quiz questions:', error);
    const errorMessage = error.response?.data?.error || error.message;
    if (errorMessage.includes('quota exceeded') || error.response?.status === 429) {
      throw new Error('API quota exceeded - try again later');
    }
    throw new Error('Failed to generate quiz questions: ' + errorMessage);
  }
} 