/*
  # Fix feedback submission

  1. Changes
    - Improve feedback submission function to better handle client-side IDs
    - Add better error reporting
*/

-- Updated submit_feedback function to handle non-standard IDs
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
    INSERT INTO sessions (user_id, status)
    VALUES (auth.uid(), 'active')
    RETURNING id INTO session_id;
    
    session_user_id := auth.uid();
  END IF;
  
  -- Verify the session belongs to the current user
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'No valid session found for this feedback';
  END IF;
  
  -- Add feedback interaction
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
    -- Check if response_id exists in interactions table
    -- If not, set to NULL to prevent foreign key constraint errors
    CASE 
      WHEN EXISTS (SELECT 1 FROM interactions WHERE id = response_id) THEN response_id
      ELSE NULL
    END
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
  
  RETURN feedback_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION submit_feedback TO authenticated; 