/*
  # Initial schema for AbstructionAI

  1. New Tables
    - `users` - Extended user profile data
    - `sessions` - Learning sessions for users
    - `interactions` - User interactions (queries, feedback)
    - `suggested_activities` - Activities suggested to users

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access their own data
*/

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  field_of_study TEXT,
  education_level TEXT,
  learning_preferences JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  preferences JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Interactions table
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'query', 'feedback', etc.
  query TEXT,
  response JSONB,
  rating INTEGER,
  comments TEXT,
  related_to UUID REFERENCES interactions(id), -- For feedback related to a query
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own interactions"
  ON interactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = interactions.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own interactions"
  ON interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = interactions.session_id
      AND sessions.user_id = auth.uid()
    )
  );

-- Suggested activities table
CREATE TABLE IF NOT EXISTS suggested_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id UUID REFERENCES interactions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE suggested_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own suggested activities"
  ON suggested_activities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interactions
      JOIN sessions ON sessions.id = interactions.session_id
      WHERE interactions.id = suggested_activities.interaction_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own suggested activities"
  ON suggested_activities
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interactions
      JOIN sessions ON sessions.id = interactions.session_id
      WHERE interactions.id = suggested_activities.interaction_id
      AND sessions.user_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();