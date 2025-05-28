-- Create secret_feedback table
CREATE TABLE IF NOT EXISTS secret_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_secret_feedback_user_id ON secret_feedback(user_id);

-- Create index on timestamp for faster time-based queries
CREATE INDEX IF NOT EXISTS idx_secret_feedback_timestamp ON secret_feedback(timestamp);

-- Create index on feedback_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_secret_feedback_type ON secret_feedback(feedback_type);

-- Enable Row Level Security
ALTER TABLE secret_feedback ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to insert their own feedback
CREATE POLICY "Users can insert their own secret feedback" ON secret_feedback
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Create policy to allow users to read their own feedback
CREATE POLICY "Users can view their own secret feedback" ON secret_feedback
    FOR SELECT USING (auth.uid()::text = user_id);

-- Optional: Create policy for admin access (you can modify this as needed)
-- CREATE POLICY "Admin can view all secret feedback" ON secret_feedback
--     FOR ALL USING (auth.jwt() ->> 'role' = 'admin'); 