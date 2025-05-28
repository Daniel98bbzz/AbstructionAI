-- Create the secret_feedback table
CREATE TABLE IF NOT EXISTS secret_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_secret_feedback_user_id ON secret_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_secret_feedback_timestamp ON secret_feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_secret_feedback_type ON secret_feedback(feedback_type);

-- Enable Row Level Security
ALTER TABLE secret_feedback ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can insert their own secret feedback" ON secret_feedback;
DROP POLICY IF EXISTS "Users can view their own secret feedback" ON secret_feedback;

CREATE POLICY "Users can insert their own secret feedback" ON secret_feedback
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view their own secret feedback" ON secret_feedback
    FOR SELECT USING (auth.uid()::text = user_id);

-- Verify the table was created
SELECT 'secret_feedback table created successfully' AS status; 