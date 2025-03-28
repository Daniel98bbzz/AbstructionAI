-- Function to create a new session
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
  
  -- Create new session
  INSERT INTO sessions (
    user_id,
    status,
    preferences
  )
  VALUES (
    user_id,
    'active',
    preferences
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

-- Function to get session data
CREATE OR REPLACE FUNCTION get_session(session_id UUID)
RETURNS JSONB AS $$
DECLARE
  session_data JSONB;
BEGIN
  -- Get session data
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
            'created_at', i.created_at
          )
        )
        FROM interactions i
        WHERE i.session_id = s.id
        ORDER BY i.created_at
      ),
      '[]'::jsonb
    )
  ) INTO session_data
  FROM sessions s
  WHERE s.id = session_id
  AND s.user_id = auth.uid();
  
  RETURN session_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add an interaction to a session
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
  WHERE s.id = session_id;
  
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Session not found or does not belong to the authenticated user';
  END IF;
  
  -- Add interaction
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
    session_id,
    interaction_type,
    query,
    response,
    rating,
    comments,
    related_to
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
  WHERE id = session_id;
  
  RETURN new_interaction;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end a session
CREATE OR REPLACE FUNCTION end_session(session_id UUID)
RETURNS JSONB AS $$
DECLARE
  updated_session JSONB;
  session_user_id UUID;
BEGIN
  -- Check if session belongs to the authenticated user
  SELECT s.user_id INTO session_user_id
  FROM sessions s
  WHERE s.id = session_id;
  
  IF session_user_id IS NULL OR session_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Session not found or does not belong to the authenticated user';
  END IF;
  
  -- End session
  UPDATE sessions
  SET 
    status = 'completed',
    ended_at = now(),
    updated_at = now()
  WHERE id = session_id
  RETURNING jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'status', status,
    'preferences', preferences,
    'created_at', created_at,
    'updated_at', updated_at,
    'ended_at', ended_at
  ) INTO updated_session;
  
  RETURN updated_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_session TO authenticated;
GRANT EXECUTE ON FUNCTION get_session TO authenticated;
GRANT EXECUTE ON FUNCTION add_interaction TO authenticated;
GRANT EXECUTE ON FUNCTION end_session TO authenticated;