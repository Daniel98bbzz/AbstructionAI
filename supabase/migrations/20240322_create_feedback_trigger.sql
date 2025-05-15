-- Create function to update ratings
CREATE OR REPLACE FUNCTION update_ratings_on_feedback()
RETURNS TRIGGER AS $$
BEGIN
    -- Update query rating
    UPDATE queries
    SET rating = NEW.rating
    WHERE id = NEW.query_id;

    -- Update prompt rating through the query
    UPDATE user_prompts
    SET rating = NEW.rating
    FROM queries
    WHERE queries.id = NEW.query_id
    AND user_prompts.id = queries.prompt_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_ratings_trigger
    AFTER INSERT OR UPDATE OF rating
    ON feedbacks
    FOR EACH ROW
    EXECUTE FUNCTION update_ratings_on_feedback();

-- Add comment to the function
COMMENT ON FUNCTION update_ratings_on_feedback IS 'Updates query and prompt ratings when feedback is submitted or updated';

-- Add rating column to user_prompts if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'user_prompts' 
        AND column_name = 'rating'
    ) THEN
        ALTER TABLE user_prompts
        ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5);
        
        -- Add comment for the new column
        COMMENT ON COLUMN user_prompts.rating IS 'Rating given to the prompt (1-5)';
    END IF;
END $$; 