-- Quiz table enhancements for AbstructionAI
-- Run this after the main quiz tables migration

-- Add optional enhancements to quizzes table
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('ai_generated', 'user_created', 'crowd_wisdom')) DEFAULT 'ai_generated',
ADD COLUMN IF NOT EXISTS topic_category TEXT,
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS quiz_type TEXT CHECK (quiz_type IN ('knowledge_check', 'practice', 'assessment', 'review')) DEFAULT 'knowledge_check';

-- Add optional enhancements to quiz_results table  
ALTER TABLE quiz_results
ADD COLUMN IF NOT EXISTS time_taken_seconds INTEGER,
ADD COLUMN IF NOT EXISTS completion_percentage NUMERIC DEFAULT 100 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
ADD COLUMN IF NOT EXISTS quiz_session_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS retake_number INTEGER DEFAULT 1;

-- Create a quiz analytics view for better insights
CREATE OR REPLACE VIEW quiz_analytics AS
SELECT 
    q.id as quiz_id,
    q.title,
    q.query,
    q.difficulty,
    q.topic_category,
    q.tags,
    COUNT(qr.id) as total_attempts,
    COUNT(DISTINCT qr.user_id) as unique_users,
    ROUND(AVG(qr.score), 2) as average_score,
    ROUND(AVG(qr.time_taken_seconds), 0) as average_time_seconds,
    MAX(qr.score) as highest_score,
    MIN(qr.score) as lowest_score,
    COUNT(CASE WHEN qr.score >= 80 THEN 1 END) as high_scores_count,
    q.created_at as quiz_created_at,
    MAX(qr.created_at) as last_attempt_at
FROM quizzes q
LEFT JOIN quiz_results qr ON q.id = qr.quiz_id
GROUP BY q.id, q.title, q.query, q.difficulty, q.topic_category, q.tags, q.created_at;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS quizzes_tags_gin_idx ON quizzes USING GIN (tags);
CREATE INDEX IF NOT EXISTS quizzes_is_public_idx ON quizzes(is_public);
CREATE INDEX IF NOT EXISTS quizzes_source_type_idx ON quizzes(source_type);
CREATE INDEX IF NOT EXISTS quizzes_topic_category_idx ON quizzes(topic_category);
CREATE INDEX IF NOT EXISTS quiz_results_completion_percentage_idx ON quiz_results(completion_percentage);
CREATE INDEX IF NOT EXISTS quiz_results_time_taken_idx ON quiz_results(time_taken_seconds);

-- Update RLS policies for public quizzes
DROP POLICY IF EXISTS "Users can view all quizzes" ON quizzes;
CREATE POLICY "Users can view accessible quizzes"
    ON quizzes FOR SELECT
    TO authenticated
    USING (is_public = true OR auth.uid() = user_id);

-- Create a function to get quiz recommendations based on user performance
CREATE OR REPLACE FUNCTION get_quiz_recommendations(target_user_id UUID, limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
    quiz_id UUID,
    title TEXT,
    query TEXT,
    difficulty TEXT,
    average_score NUMERIC,
    recommendation_reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id,
        q.title,
        q.query,
        q.difficulty,
        COALESCE(qa.average_score, 0) as avg_score,
        CASE 
            WHEN NOT EXISTS (
                SELECT 1 FROM quiz_results qr 
                WHERE qr.quiz_id = q.id AND qr.user_id = target_user_id
            ) THEN 'New quiz for you to try'
            WHEN qa.average_score < 70 THEN 'Challenging quiz - good for practice'
            WHEN qa.average_score > 85 THEN 'Popular quiz with high scores'
            ELSE 'Recommended based on difficulty'
        END as reason
    FROM quizzes q
    LEFT JOIN quiz_analytics qa ON q.id = qa.quiz_id
    WHERE q.is_public = true
    ORDER BY 
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM quiz_results qr 
            WHERE qr.quiz_id = q.id AND qr.user_id = target_user_id
        ) THEN 1 ELSE 2 END,
        qa.total_attempts DESC NULLS LAST,
        q.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for new columns
COMMENT ON COLUMN quizzes.tags IS 'Array of tags for categorizing quizzes';
COMMENT ON COLUMN quizzes.is_public IS 'Whether the quiz can be shared with other users';
COMMENT ON COLUMN quizzes.source_type IS 'How the quiz was created (AI, user, crowd wisdom)';
COMMENT ON COLUMN quizzes.topic_category IS 'High-level category for the quiz topic';
COMMENT ON COLUMN quizzes.estimated_duration_minutes IS 'Estimated time to complete the quiz';
COMMENT ON COLUMN quizzes.quiz_type IS 'Type of quiz (knowledge check, practice, etc.)';

COMMENT ON COLUMN quiz_results.time_taken_seconds IS 'Time taken to complete the quiz in seconds';
COMMENT ON COLUMN quiz_results.completion_percentage IS 'Percentage of quiz completed (for partial submissions)';
COMMENT ON COLUMN quiz_results.quiz_session_data IS 'Additional session data (timestamps, navigation, etc.)';
COMMENT ON COLUMN quiz_results.retake_number IS 'Which attempt this is for the user (1st, 2nd, etc.)';

COMMENT ON VIEW quiz_analytics IS 'Aggregated analytics for quiz performance and usage';
COMMENT ON FUNCTION get_quiz_recommendations IS 'Provides personalized quiz recommendations for users'; 