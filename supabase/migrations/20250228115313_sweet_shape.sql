/*
  # Fix feedback and history access

  1. Changes
    - Fix submit_feedback function to properly handle response IDs
    - Improve error handling in database functions
    - Add function to get session details with interactions
*/

-- Fix submit_feedback function to properly handle response IDs
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
  SELECT i.session_id, s.user_id INTO session_id, session_user_id
  FROM interactions i
  JOIN sessions s ON s.id = i.session_id
  WHERE i.id = response_id;
  
  -- Check if session belongs to the authenticated user
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    -- If not found by ID, try using the response as a string (for local IDs)
    BEGIN
      SELECT s.id, s.user_id INTO session_id, session_user_id
      FROM sessions s
      WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 1;
      
      IF session_id IS NULL THEN
        RAISE EXCEPTION 'No active session found for this user';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Response not found or does not belong to the authenticated user';
    END;
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

-- Function to get session details with interactions
CREATE OR REPLACE FUNCTION get_session_details(session_id UUID)
RETURNS JSONB AS $$
DECLARE
  session_data JSONB;
  session_user_id UUID;
BEGIN
  -- Check if session belongs to the authenticated user
  SELECT user_id INTO session_user_id
  FROM sessions
  WHERE id = session_id;
  
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Session not found or does not belong to the authenticated user';
  END IF;
  
  -- Get session data with interactions
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION submit_feedback TO authenticated;
GRANT EXECUTE ON FUNCTION get_session_details TO authenticated;