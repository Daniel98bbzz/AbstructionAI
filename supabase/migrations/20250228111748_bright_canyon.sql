/*
  # Query and feedback functions

  1. New Functions
    - `get_query_history` - Function to get a user's query history
    - `submit_feedback` - Function to submit feedback for a response

  2. Security
    - All functions are SECURITY DEFINER to bypass RLS
    - Functions are granted to authenticated users
*/

-- Function to get query history
CREATE OR REPLACE FUNCTION get_query_history(
  limit_count INTEGER DEFAULT 10,
  offset_count INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  history JSONB;
BEGIN
  -- Get query history
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'created_at', i.created_at,
      'query', i.query,
      'response', i.response,
      'type', i.type,
      'rating', (
        SELECT rating 
        FROM interactions 
        WHERE related_to = i.id 
        AND type = 'feedback'
        LIMIT 1
      ),
      'session', jsonb_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'status', s.status
      )
    )
  ) INTO history
  FROM interactions i
  JOIN sessions s ON s.id = i.session_id
  WHERE i.type = 'query'
  AND s.user_id = auth.uid()
  ORDER BY i.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
  
  RETURN COALESCE(history, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to submit feedback
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
    RAISE EXCEPTION 'Response not found or does not belong to the authenticated user';
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_query_history TO authenticated;
GRANT EXECUTE ON FUNCTION submit_feedback TO authenticated;