-- Create user_prompts table
CREATE TABLE user_prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    prompt_text TEXT NOT NULL,
    category TEXT,
    feedback_id UUID REFERENCES feedbacks(id),
    query_id UUID REFERENCES queries(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security (RLS)
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own prompts"
    ON user_prompts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prompts"
    ON user_prompts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompts"
    ON user_prompts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prompts"
    ON user_prompts FOR DELETE
    USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_user_prompts_updated_at
    BEFORE UPDATE ON user_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX user_prompts_user_id_idx ON user_prompts(user_id);
CREATE INDEX user_prompts_category_idx ON user_prompts(category);
CREATE INDEX user_prompts_feedback_id_idx ON user_prompts(feedback_id);
CREATE INDEX user_prompts_query_id_idx ON user_prompts(query_id);
CREATE INDEX user_prompts_created_at_idx ON user_prompts(created_at);

-- Add comment to table
COMMENT ON TABLE user_prompts IS 'Stores user prompts with relationships to users, categories, and feedback';

-- Add comments to columns
COMMENT ON COLUMN user_prompts.id IS 'Unique identifier for the prompt';
COMMENT ON COLUMN user_prompts.user_id IS 'Reference to the user who created the prompt';
COMMENT ON COLUMN user_prompts.prompt_text IS 'The actual prompt text submitted by the user';
COMMENT ON COLUMN user_prompts.category IS 'Category or topic of the prompt';
COMMENT ON COLUMN user_prompts.feedback_id IS 'Reference to associated feedback if any';
COMMENT ON COLUMN user_prompts.query_id IS 'Reference to associated query if any';
COMMENT ON COLUMN user_prompts.created_at IS 'Timestamp when the prompt was created';
COMMENT ON COLUMN user_prompts.updated_at IS 'Timestamp when the prompt was last updated';
COMMENT ON COLUMN user_prompts.metadata IS 'Additional metadata about the prompt as JSON'; 