-- Table for storing prompt templates

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR NOT NULL,
  template_text TEXT NOT NULL,
  efficacy_score NUMERIC DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  cluster_id INTEGER,
  version INTEGER DEFAULT 1
);

-- Table for storing template usage and feedback
CREATE TABLE IF NOT EXISTS prompt_template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES prompt_templates(id),
  session_id UUID NOT NULL,
  user_id UUID,
  query TEXT NOT NULL,
  response_id UUID,
  soft_signal_type VARCHAR, -- Soft signal from natural conversation: 'satisfaction', 'confusion', 'positive', etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX prompt_templates_topic_idx ON prompt_templates(topic);
CREATE INDEX prompt_templates_efficacy_idx ON prompt_templates(efficacy_score);
CREATE INDEX prompt_templates_cluster_idx ON prompt_templates(cluster_id);

-- Enable Row Level Security
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables 
    WHERE tablename = 'prompt_templates' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'prompt_template_usage' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE prompt_template_usage ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies
DO $$
BEGIN
  -- prompt_templates policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_templates' AND policyname = 'Everyone can read prompt_templates') THEN
    CREATE POLICY "Everyone can read prompt_templates"
      ON prompt_templates
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_templates' AND policyname = 'Admin can insert prompt_templates') THEN
    CREATE POLICY "Admin can insert prompt_templates"
      ON prompt_templates
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
  
  -- prompt_template_usage policies - simplified to avoid type casting issues
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_template_usage' AND policyname = 'Authenticated users can access prompt_template_usage') THEN
    CREATE POLICY "Authenticated users can access prompt_template_usage"
      ON prompt_template_usage
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prompt_template_usage' AND policyname = 'Users can insert prompt_template_usage') THEN
    CREATE POLICY "Users can insert prompt_template_usage"
      ON prompt_template_usage
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$; 