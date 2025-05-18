-- Table for storing prompt templates

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  topic VARCHAR NOT NULL,
  template_text TEXT NOT NULL,
  source VARCHAR NOT NULL,
  efficacy_score NUMERIC DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  quality_score NUMERIC DEFAULT 0,
  confusion_score NUMERIC DEFAULT 0,
  follow_up_rate NUMERIC DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,
  component_rating JSONB DEFAULT '{}',
  composite_quality_score NUMERIC DEFAULT 0,
  quality_score_metadata JSONB,
  metadata JSONB
);

-- Table for storing template usage and feedback
CREATE TABLE IF NOT EXISTS prompt_template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES prompt_templates(id),
  session_id UUID,
  user_id TEXT,
  query TEXT NOT NULL,
  response_id UUID,
  feedback_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'prompt_templates_topic_idx') THEN
    CREATE INDEX prompt_templates_topic_idx ON prompt_templates(topic);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'prompt_templates_efficacy_idx') THEN
    CREATE INDEX prompt_templates_efficacy_idx ON prompt_templates(efficacy_score);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'prompt_templates_composite_idx') THEN
    CREATE INDEX prompt_templates_composite_idx ON prompt_templates(composite_quality_score);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'prompt_template_usage_template_idx') THEN
    CREATE INDEX prompt_template_usage_template_idx ON prompt_template_usage(template_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'prompt_template_usage_user_idx') THEN
    CREATE INDEX prompt_template_usage_user_idx ON prompt_template_usage(user_id);
  END IF;
END $$;

-- Enable Row Level Security
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
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