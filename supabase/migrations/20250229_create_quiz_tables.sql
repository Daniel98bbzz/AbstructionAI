-- Create quiz tables for quiz functionality

-- Table for storing quizzes
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    questions JSONB NOT NULL,
    query TEXT NOT NULL,
    difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Table for storing quiz results
CREATE TABLE IF NOT EXISTS quiz_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    quiz_id UUID REFERENCES quizzes(id) NOT NULL,
    score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
    answers JSONB NOT NULL,
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for quizzes table
CREATE POLICY "Users can view all quizzes"
    ON quizzes FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert their own quizzes"
    ON quizzes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quizzes"
    ON quizzes FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quizzes"
    ON quizzes FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create permissive policies for quiz_results table
CREATE POLICY "Users can view all quiz results"
    ON quiz_results FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert their own quiz results"
    ON quiz_results FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz results"
    ON quiz_results FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quiz results"
    ON quiz_results FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Create updated_at trigger for quizzes
CREATE OR REPLACE FUNCTION update_quiz_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_quizzes_updated_at
    BEFORE UPDATE ON quizzes
    FOR EACH ROW
    EXECUTE FUNCTION update_quiz_updated_at();

-- Create indexes for better query performance
CREATE INDEX quizzes_user_id_idx ON quizzes(user_id);
CREATE INDEX quizzes_created_at_idx ON quizzes(created_at);
CREATE INDEX quizzes_difficulty_idx ON quizzes(difficulty);
CREATE INDEX quizzes_query_idx ON quizzes(query);

CREATE INDEX quiz_results_user_id_idx ON quiz_results(user_id);
CREATE INDEX quiz_results_quiz_id_idx ON quiz_results(quiz_id);
CREATE INDEX quiz_results_created_at_idx ON quiz_results(created_at);
CREATE INDEX quiz_results_score_idx ON quiz_results(score);

-- Add comments to tables
COMMENT ON TABLE quizzes IS 'Stores quizzes generated for users';
COMMENT ON TABLE quiz_results IS 'Stores results from completed quizzes';

-- Add comments to columns
COMMENT ON COLUMN quizzes.id IS 'Unique identifier for the quiz';
COMMENT ON COLUMN quizzes.user_id IS 'Reference to the user who created the quiz';
COMMENT ON COLUMN quizzes.title IS 'Title of the quiz';
COMMENT ON COLUMN quizzes.description IS 'Description of the quiz';
COMMENT ON COLUMN quizzes.questions IS 'JSON array of quiz questions and answers';
COMMENT ON COLUMN quizzes.query IS 'The original query/topic used to generate the quiz';
COMMENT ON COLUMN quizzes.difficulty IS 'Difficulty level of the quiz';
COMMENT ON COLUMN quizzes.created_at IS 'Timestamp when the quiz was created';
COMMENT ON COLUMN quizzes.updated_at IS 'Timestamp when the quiz was last updated';

COMMENT ON COLUMN quiz_results.id IS 'Unique identifier for the quiz result';
COMMENT ON COLUMN quiz_results.user_id IS 'Reference to the user who took the quiz';
COMMENT ON COLUMN quiz_results.quiz_id IS 'Reference to the quiz that was taken';
COMMENT ON COLUMN quiz_results.score IS 'Score achieved on the quiz (0-100)';
COMMENT ON COLUMN quiz_results.answers IS 'JSON array of user answers';
COMMENT ON COLUMN quiz_results.results IS 'JSON object with detailed results';
COMMENT ON COLUMN quiz_results.created_at IS 'Timestamp when the quiz was completed'; 