/*
  # Fix database functions

  1. Changes
    - Fix ambiguous column references in functions
    - Fix GROUP BY issues in query history function
    - Add additional error handling
*/

-- Fix get_query_history function to properly handle GROUP BY
CREATE OR REPLACE FUNCTION get_query_history(
  limit_count INTEGER DEFAULT 10,
  offset_count INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  history JSONB;
BEGIN
  -- Get query history with proper column references
  SELECT jsonb_agg(query_data)
  INTO history
  FROM (
    SELECT jsonb_build_object(
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
    ) AS query_data
    FROM interactions i
    JOIN sessions s ON s.id = i.session_id
    WHERE i.type = 'query'
    AND s.user_id = auth.uid()
    ORDER BY i.created_at DESC
    LIMIT limit_count
    OFFSET offset_count
  ) subquery;
  
  RETURN COALESCE(history, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix create_session function to avoid ambiguous column references
CREATE OR REPLACE FUNCTION create_session(
  user_id UUID,
  preferences JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  new_session JSONB;
  session_id UUID;
BEGIN
  -- Ensure user exists first
  PERFORM ensure_user_exists(user_id);
  
  -- Create new session with explicit table reference
  INSERT INTO sessions (
    user_id,
    status,
    preferences
  )
  VALUES (
    create_session.user_id,
    'active',
    create_session.preferences
  )
  RETURNING id INTO session_id;
  
  -- Get full session data
  SELECT jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'status', s.status,
    'preferences', s.preferences,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  ) INTO new_session
  FROM sessions s
  WHERE s.id = session_id;
  
  RETURN new_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix add_interaction function to avoid ambiguous column references
CREATE OR REPLACE FUNCTION add_interaction(
  session_id UUID,
  interaction_type TEXT,
  query TEXT DEFAULT NULL,
  response JSONB DEFAULT NULL,
  rating INTEGER DEFAULT NULL,
  comments TEXT DEFAULT NULL,
  related_to UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  new_interaction JSONB;
  interaction_id UUID;
  session_user_id UUID;
BEGIN
  -- Check if session belongs to the authenticated user
  SELECT s.user_id INTO session_user_id
  FROM sessions s
  WHERE s.id = add_interaction.session_id;
  
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Session not found or does not belong to the authenticated user';
  END IF;
  
  -- Add interaction with explicit parameter references
  INSERT INTO interactions (
    session_id,
    type,
    query,
    response,
    rating,
    comments,
    related_to
  )
  VALUES (
    add_interaction.session_id,
    add_interaction.interaction_type,
    add_interaction.query,
    add_interaction.response,
    add_interaction.rating,
    add_interaction.comments,
    add_interaction.related_to
  )
  RETURNING id INTO interaction_id;
  
  -- Get full interaction data
  SELECT jsonb_build_object(
    'id', i.id,
    'session_id', i.session_id,
    'type', i.type,
    'query', i.query,
    'response', i.response,
    'rating', i.rating,
    'comments', i.comments,
    'related_to', i.related_to,
    'created_at', i.created_at
  ) INTO new_interaction
  FROM interactions i
  WHERE i.id = interaction_id;
  
  -- Update session updated_at timestamp
  UPDATE sessions
  SET updated_at = now()
  WHERE id = add_interaction.session_id;
  
  RETURN new_interaction;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_query_history TO authenticated;
GRANT EXECUTE ON FUNCTION create_session TO authenticated;
GRANT EXECUTE ON FUNCTION add_interaction TO authenticated;