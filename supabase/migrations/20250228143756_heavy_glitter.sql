/*
  # Add get_session_details function

  1. New Functions
    - `get_session_details` - Retrieves complete session data with all interactions
  
  2. Security
    - Function is security definer to ensure proper access control
    - Only authenticated users can access their own session data
*/

-- Function to get detailed session data with interactions
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
GRANT EXECUTE ON FUNCTION get_session_details TO authenticated;