-- Create queries table
CREATE TABLE queries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    query TEXT NOT NULL,
    response JSONB,
    explanation TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    category TEXT,
    difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own queries"
    ON queries FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queries"
    ON queries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queries"
    ON queries FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queries"
    ON queries FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_queries_updated_at
    BEFORE UPDATE ON queries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX queries_user_id_idx ON queries(user_id);
CREATE INDEX queries_created_at_idx ON queries(created_at);
CREATE INDEX queries_category_idx ON queries(category);
CREATE INDEX queries_difficulty_level_idx ON queries(difficulty_level);

-- Add comment to table
COMMENT ON TABLE queries IS 'Stores user queries and their responses with metadata';

-- Add comments to columns
COMMENT ON COLUMN queries.id IS 'Unique identifier for the query';
COMMENT ON COLUMN queries.user_id IS 'Reference to the user who created the query';
COMMENT ON COLUMN queries.query IS 'The actual query text submitted by the user';
COMMENT ON COLUMN queries.response IS 'JSON response from the AI model';
COMMENT ON COLUMN queries.explanation IS 'Detailed explanation of the response';
COMMENT ON COLUMN queries.rating IS 'User rating of the response (1-5)';
COMMENT ON COLUMN queries.category IS 'Category or topic of the query';
COMMENT ON COLUMN queries.difficulty_level IS 'Perceived difficulty level of the query';
COMMENT ON COLUMN queries.created_at IS 'Timestamp when the query was created';
COMMENT ON COLUMN queries.updated_at IS 'Timestamp when the query was last updated'; 