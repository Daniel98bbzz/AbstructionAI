/*
  # Fix feedback submission and session details

  1. Updates
    - Fix submit_feedback function to handle cases where response_id might not be found
    - Improve error handling in get_session_details function
  
  2. Security
    - All functions remain security definer to ensure proper access control
*/

-- Fix submit_feedback function to better handle response IDs
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
  -- Get session ID from the response interaction
  BEGIN
    SELECT i.session_id, s.user_id INTO session_id, session_user_id
    FROM interactions i
    JOIN sessions s ON s.id = i.session_id
    WHERE i.id = response_id;
  EXCEPTION WHEN OTHERS THEN
    -- If there's an error, try to find the active session for this user
    SELECT s.id, s.user_id INTO session_id, session_user_id
    FROM sessions s
    WHERE s.user_id = auth.uid()
    AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;
  END;
  
  -- Check if we found a valid session
  IF session_id IS NULL OR session_user_id IS NULL OR session_user_id != auth.uid() THEN
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
  
  RETURN feedback_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Improve get_session_details function with better error handling
CREATE OR REPLACE FUNCTION get_session_details(session_id UUID)
RETURNS JSONB AS $$
DECLARE
  session_data JSONB;
  session_user_id UUID;
BEGIN
  -- Check if session belongs to the authenticated user
  BEGIN
    SELECT user_id INTO session_user_id
    FROM sessions
    WHERE id = session_id;
    
    IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
      RAISE EXCEPTION 'Session not found or does not belong to the authenticated user';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error retrieving session: %', SQLERRM;
  END;
  
  -- Get session data with interactions
  BEGIN
    SELECT jsonb_build_object(
      'id', s.id,
      'user_id', s.user_id,
      'status', s.status,
      'preferences', s.preferences,
      'created_at', s.created_at,
      'updated_at', s.updated_at,
      'ended_at', s.ended_at,
      'interactions', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'type', i.type,
              'query', i.query,
              'response', i.response,
              'rating', i.rating,
              'comments', i.comments,
              'created_at', i.created_at,
              'related_to', i.related_to
            ) ORDER BY i.created_at
          )
          FROM interactions i
          WHERE i.session_id = s.id
        ),
        '[]'::jsonb
      )
    ) INTO session_data
    FROM sessions s
    WHERE s.id = session_id;
    
    RETURN session_data;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error building session details: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION submit_feedback TO authenticated;
GRANT EXECUTE ON FUNCTION get_session_details TO authenticated;