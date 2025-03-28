/*
  # Ensure feedback submission function works correctly

  1. Changes
    - Drop and recreate the submit_feedback function with improved error handling
    - Make sure it's granted to authenticated users
*/

-- Drop the function first to ensure a clean slate
DROP FUNCTION IF EXISTS submit_feedback(UUID, INTEGER, TEXT);

-- Create the updated submit_feedback function with better error handling
CREATE OR REPLACE FUNCTION submit_feedback(
  response_id UUID,
  rating INTEGER,
  comments TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  feedback_data JSONB;
  session_id UUID;
  session_user_id UUID;
  error_message TEXT;
BEGIN
  -- First try to get the active session for this user
  SELECT s.id, s.user_id INTO session_id, session_user_id
  FROM sessions s
  WHERE s.user_id = auth.uid()
  AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;
  
  -- If no active session, try to find any session
  IF session_id IS NULL THEN
    SELECT s.id, s.user_id INTO session_id, session_user_id
    FROM sessions s
    WHERE s.user_id = auth.uid()
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;
  
  -- Check if we found a valid session
  IF session_id IS NULL THEN
    -- Create a new session for this user if none exists
    BEGIN
      INSERT INTO sessions (user_id, status)
      VALUES (auth.uid(), 'active')
      RETURNING id INTO session_id;
      
      session_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      error_message := SQLERRM;
      RAISE EXCEPTION 'Failed to create a session: %', error_message;
    END;
  END IF;
  
  -- Verify the session belongs to the current user
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'No valid session found for this feedback';
  END IF;
  
  -- Double-check if responseId is a valid UUID that exists
  -- We'll set it to NULL if not valid to prevent foreign key errors
  IF response_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM interactions WHERE id = response_id
  ) THEN
    response_id := NULL;
  END IF;
  
  -- Add feedback interaction
  BEGIN
    INSERT INTO interactions (
      session_id,
      type,
      rating,
      comments,
      related_to
    )
    VALUES (
      session_id,
      'feedback',
      rating,
      comments,
      response_id
    )
    RETURNING jsonb_build_object(
      'id', id,
      'session_id', session_id,
      'type', type,
      'rating', rating,
      'comments', comments,
      'related_to', related_to,
      'created_at', created_at
    ) INTO feedback_data;
  EXCEPTION WHEN OTHERS THEN
    error_message := SQLERRM;
    RAISE EXCEPTION 'Failed to insert feedback: %', error_message;
  END;
  
  RETURN feedback_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION submit_feedback TO authenticated; 