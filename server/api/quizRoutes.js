// server/api/quizRoutes.js
import { v4 as uuidv4 } from 'uuid';
import { OpenAI } from 'openai';

// Initialize OpenAI with your API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default function setupQuizRoutes(app, supabase) {
  // Quiz generation endpoint
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { query, difficulty = 'medium' } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
      console.log('Generating quiz for query:', query);
      
      // Identify the user
      const userId = req.user?.id || req.body.userId;
      
      // Prepare quiz generation prompt
      const quizGenerationMessage = {
        role: "system",
        content: `You are a quiz creator specialized in generating educational quizzes based on topics.
        Create a multiple-choice quiz with 5 questions related to this topic: "${query}".
        
        For each question:
        1. Create 4 answer choices (A, B, C, D)
        2. Make sure only ONE answer is correct
        3. Make the incorrect answers plausible but clearly wrong upon inspection
        4. Vary the position of the correct answer (don't always make A or B the correct answer)
        5. Create questions of ${difficulty} difficulty level
        6. Base the questions on the provided content when available
        
        Format your response as a JSON object with the following structure:
        {
          "title": "Quiz title here",
          "description": "Brief description of the quiz",
          "questions": [
            {
              "question": "Question text here?",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "correctAnswer": 0,
              "explanation": "Brief explanation of why this answer is correct"
            },
            ...
          ]
        }
        
        The correctAnswer field should be the INDEX (0-3) of the correct option in the options array.
        Make sure the quiz questions cover different aspects of the topic.`
      };
      
      // Call OpenAI API to generate quiz
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          quizGenerationMessage,
          { role: "user", content: `Create a quiz about: ${query}` }
        ],
        temperature: 0.7,
        max_tokens: 3000
      });
      
      // Parse the response
      const responseText = completion.choices[0].message.content;
      
      try {
        // Try to parse the response as JSON
        const quizData = JSON.parse(responseText);
        
        // Add a unique ID to the quiz
        const quizId = uuidv4();
        const timestampedQuiz = {
          ...quizData,
          id: quizId,
          query: query,
          createdAt: new Date().toISOString(),
          userId: userId || 'anonymous'
        };
        
        // Store the quiz in the database if needed
        if (userId) {
          try {
            const { data, error } = await supabase
              .from('quizzes')
              .insert([{
                id: quizId,
                user_id: userId,
                title: quizData.title,
                description: quizData.description,
                questions: quizData.questions,
                query: query,
                difficulty: difficulty
              }])
              .select();
              
            if (error) {
              console.error('Error storing quiz in database:', error);
            } else {
              console.log('Quiz stored in database with ID:', quizId);
            }
          } catch (dbError) {
            console.error('Database operation failed:', dbError);
          }
        }
        
        res.json(timestampedQuiz);
      } catch (parseError) {
        console.error('Error parsing quiz JSON:', parseError);
        console.log('Raw response:', responseText);
        res.status(500).json({ 
          error: 'Failed to generate quiz format',
          rawResponse: responseText
        });
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      res.status(500).json({ 
        error: 'Failed to generate quiz',
        message: error.message 
      });
    }
  });

  // Quiz submission endpoint
  app.post('/api/submit-quiz', async (req, res) => {
    try {
      const { quizId, answers, userId } = req.body;
      
      if (!quizId || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Quiz ID and answers array are required' });
      }
      
      // Get the quiz data
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();
        
      if (quizError) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      
      // Calculate score
      let correctAnswers = 0;
      const results = quizData.questions.map((question, index) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === question.correctAnswer;
        
        if (isCorrect) {
          correctAnswers++;
        }
        
        return {
          question: question.question,
          userAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect,
          explanation: question.explanation
        };
      });
      
      const score = (correctAnswers / quizData.questions.length) * 100;
      
      // Store results if user is logged in
      if (userId) {
        const { error: resultError } = await supabase
          .from('quiz_results')
          .insert([{
            user_id: userId,
            quiz_id: quizId,
            score,
            answers: answers,
            results: results
          }]);
          
        if (resultError) {
          console.error('Error storing quiz results:', resultError);
        }
      }
      
      res.json({
        quizId,
        score,
        correctAnswers,
        totalQuestions: quizData.questions.length,
        results
      });
    } catch (error) {
      console.error('Error submitting quiz:', error);
      res.status(500).json({ error: 'Failed to process quiz submission' });
    }
  });

  // Add a route to get a specific quiz by ID
  app.get('/api/quiz/:quizId', async (req, res) => {
    try {
      const { quizId } = req.params;
      
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();
      
      if (error) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching quiz:', error);
      res.status(500).json({ error: 'Failed to fetch quiz' });
    }
  });

  console.log('✅ Quiz routes successfully initialized');
}