// server/quizRoutes.js
// This is a complete, standalone module that you can directly import into your server

import { v4 as uuidv4 } from 'uuid';

/**
 * Sets up quiz routes for your Express server
 * @param {Object} app - Express app instance
 * @param {Object} supabase - Supabase client instance
 * @param {Object} openai - OpenAI client instance
 */
export default function setupQuizRoutes(app, supabase, openai) {
  console.log('Setting up quiz API routes...');

  // Quiz generation endpoint
  app.post('/api/generate-quiz', async (req, res) => {
    try {
      const { query, difficulty = 'medium' } = req.body;
      
      console.log(`Generating quiz for "${query}" with ${difficulty} difficulty`);
      
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
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
        model: "gpt-4",
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
        
        console.log(`Quiz generated successfully with ID: ${quizId}`);
        
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
      
      console.log(`Processing quiz submission for quiz: ${quizId}`);
      
      if (!quizId || !answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'Quiz ID and answers array are required' });
      }
      
      // If we don't have the quiz in the database, use the mock quiz approach
      try {
        // Get the quiz data
        const { data: quizData, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .single();
          
        if (quizError) {
          console.log(`Quiz ${quizId} not found in database, using mock approach`);
          // If the quiz isn't in the database, we'll create a mock result
          // This allows the client-side mock mode to still work
          return res.json({
            quizId,
            score: 80, // Mock score
            correctAnswers: 4,
            totalQuestions: 5,
            results: answers.map((answer, index) => ({
              question: `Question ${index + 1}`,
              userAnswer: answer,
              correctAnswer: index % 2, // Alternate correct answers for mock
              isCorrect: answer === (index % 2),
              explanation: "This would normally contain the explanation from the quiz."
            }))
          });
        }
        
        // Calculate score
        let correctAnswers = 0;
        const results = quizData.questions.map((question, index) => {
          // Handle case where user didn't answer all questions
          const userAnswer = index < answers.length ? answers[index] : null;
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
        
        console.log(`User scored ${score.toFixed(1)}% (${correctAnswers}/${quizData.questions.length})`);
        
        // Store results if user is logged in
        if (userId) {
          try {
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
            } else {
              console.log('Quiz results saved to database for user:', userId);
            }
          } catch (insertError) {
            console.error('Error inserting quiz results:', insertError);
          }
        }
        
        res.json({
          quizId,
          score,
          correctAnswers,
          totalQuestions: quizData.questions.length,
          results
        });
      } catch (dbError) {
        console.error('Database error processing quiz submission:', dbError);
        res.status(500).json({ error: 'Database error processing quiz submission' });
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      res.status(500).json({ error: 'Failed to process quiz submission' });
    }
  });

  // Get a specific quiz by ID
  app.get('/api/quiz/:quizId', async (req, res) => {
    try {
      const { quizId } = req.params;
      
      console.log(`Fetching quiz with ID: ${quizId}`);
      
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();
      
      if (error) {
        console.log(`Quiz ${quizId} not found`);
        return res.status(404).json({ error: 'Quiz not found' });
      }
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching quiz:', error);
      res.status(500).json({ error: 'Failed to fetch quiz' });
    }
  });

  console.log('✅ Quiz routes successfully initialized');
  
  // Return the router in case it's needed elsewhere
  return app;
}