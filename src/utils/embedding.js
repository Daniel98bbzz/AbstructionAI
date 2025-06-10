import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

export async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        input: text,
        model: 'text-embedding-3-small',
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const embedding = response.data?.data?.[0]?.embedding;
    return embedding || null;
  } catch (err) {
    console.error('[Embedding] Error generating embedding:', err.response?.data || err.message);
    return null;
  }
} 