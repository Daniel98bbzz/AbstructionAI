-- First, add query_id to feedbacks table
ALTER TABLE feedbacks
ADD COLUMN query_id UUID REFERENCES queries(id);

-- Create index for the new foreign key column in feedbacks
CREATE INDEX feedbacks_query_id_idx ON feedbacks(query_id);

-- Add comment for the new column in feedbacks
COMMENT ON COLUMN feedbacks.query_id IS 'Reference to the query that this feedback is for';

-- Now add prompt_id and feedback_id columns to queries table
ALTER TABLE queries
ADD COLUMN prompt_id UUID REFERENCES user_prompts(id),
ADD COLUMN feedback_id UUID REFERENCES feedbacks(id) ON DELETE SET NULL;

-- Create indexes for the new foreign key columns in queries
CREATE INDEX queries_prompt_id_idx ON queries(prompt_id);
CREATE INDEX queries_feedback_id_idx ON queries(feedback_id);

-- Add comments for the new columns in queries
COMMENT ON COLUMN queries.prompt_id IS 'Reference to the user prompt that generated this query';
COMMENT ON COLUMN queries.feedback_id IS 'Reference to the feedback provided for this query';

-- Update the existing queries to link with user_prompts
UPDATE queries q
SET prompt_id = up.id
FROM user_prompts up
WHERE up.query_id = q.id;

-- Update the existing queries to link with feedbacks
UPDATE queries q
SET feedback_id = f.id
FROM feedbacks f
WHERE f.query_id = q.id; 