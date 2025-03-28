-- Enhance the feedback submission system with better handling of message IDs
-- First, drop the existing function if it exists
DROP FUNCTION IF EXISTS public.submit_feedback;

-- Create updated function for feedback submission
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_message_id TEXT,
  p_session_id UUID,
  p_feedback_content JSONB,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feedback_id UUID;
  v_result JSONB;
BEGIN
  -- Input validation
  IF p_message_id IS NULL OR p_session_id IS NULL OR p_feedback_content IS NULL THEN
    RAISE EXCEPTION 'Missing required parameters: message_id, session_id, and feedback_content are required';
  END IF;

  -- Validate session exists
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Invalid session ID: %', p_session_id;
  END IF;

  -- Insert the feedback record
  INSERT INTO interactions (
    session_id,
    type,
    message_id,
    feedback_content,
    user_id
  )
  VALUES (
    p_session_id,
    'feedback',
    p_message_id,
    p_feedback_content,
    p_user_id
  )
  RETURNING id INTO v_feedback_id;

  -- Create result JSON
  v_result := jsonb_build_object(
    'success', TRUE,
    'feedback_id', v_feedback_id,
    'message', 'Feedback submitted successfully'
  );

  RETURN v_result;
END;
$$;

-- Add message_id column to interactions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'interactions'
    AND column_name = 'message_id'
  ) THEN
    ALTER TABLE interactions ADD COLUMN message_id TEXT;
  END IF;
  
  -- Add feedback_content column to interactions table if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'interactions'
    AND column_name = 'feedback_content'
  ) THEN
    ALTER TABLE interactions ADD COLUMN feedback_content JSONB;
  END IF;
END
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_feedback TO authenticated;

-- Comment on function
COMMENT ON FUNCTION public.submit_feedback IS 'Submits user feedback for a specific message in a session'; 