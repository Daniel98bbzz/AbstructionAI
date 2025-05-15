-- Tables for Crowd Wisdom feature

-- Table for storing prompt templates
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  topic VARCHAR NOT NULL,
  template_text TEXT NOT NULL,
  source VARCHAR NOT NULL, -- 'system', 'crowd', 'user'
  efficacy_score NUMERIC DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  metadata JSONB
);

-- Table for logging usage of prompt templates
CREATE TABLE prompt_template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES prompt_templates(id),
  session_id UUID NOT NULL,
  user_id UUID, -- Can be null for anonymous users
  query TEXT NOT NULL,
  response_id UUID, -- Reference to the response
  feedback_score INTEGER, -- User feedback rating 1-5
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX prompt_templates_topic_idx ON prompt_templates(topic);
CREATE INDEX prompt_template_usage_template_id_idx ON prompt_template_usage(template_id);
CREATE INDEX prompt_template_usage_user_id_idx ON prompt_template_usage(user_id);
CREATE INDEX prompt_template_usage_session_id_idx ON prompt_template_usage(session_id);

-- Grant access to authenticated users
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for prompt_templates
CREATE POLICY "Users can read prompt_templates"
  ON prompt_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert prompt_templates"
  ON prompt_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS policies for prompt_template_usage
CREATE POLICY "Users can read own prompt_template_usage"
  ON prompt_template_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert own prompt_template_usage"
  ON prompt_template_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL); 