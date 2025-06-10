import dotenv from 'dotenv';
dotenv.config();

// This is a drop-in replacement for the feedback API endpoint in server/index.js

// Updated feedback API endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { responseId, rating, comments, sessionId } = req.body;
    
    if (!responseId || !rating) {
      return res.status(400).json({ error: 'Response ID and rating are required' });
    }
    
    // Generate a userId if not authenticated
    const userId = req.user?.id || `anonymous_${Date.now()}`;
    
    // Process feedback
    const feedback = await feedbackProcessor.processFeedback(
      responseId,
      rating,
      comments || '',
      userId
    );
    
    // Add feedback interaction to session if sessionId is provided
    if (sessionId) {
      await sessionManager.addInteraction(sessionId, {
        type: 'feedback',
        responseId,
        rating,
        comments,
        feedback
      });
    }
    
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Error processing feedback:', error);
    res.status(500).json({ error: 'Failed to process feedback' });
  }
}); 