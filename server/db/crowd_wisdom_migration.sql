-- Migration script for Crowd Wisdom feature

-- First, create the tables if they don't exist
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  topic VARCHAR NOT NULL,
  template_text TEXT NOT NULL,
  source VARCHAR NOT NULL, -- 'system', 'crowd', 'user'
  efficacy_score NUMERIC DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS prompt_template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  session_id UUID NOT NULL,
  user_id UUID, -- Can be null for anonymous users
  query TEXT NOT NULL,
  response_id UUID, -- Reference to the response
  feedback_score INTEGER, -- User feedback rating 1-5
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS prompt_templates_topic_idx ON prompt_templates(topic);
CREATE INDEX IF NOT EXISTS prompt_template_usage_template_id_idx ON prompt_template_usage(template_id);
CREATE INDEX IF NOT EXISTS prompt_template_usage_user_id_idx ON prompt_template_usage(user_id);
CREATE INDEX IF NOT EXISTS prompt_template_usage_session_id_idx ON prompt_template_usage(session_id);

-- Add foreign key constraint if possible, but don't fail if sessions table doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sessions') THEN
    BEGIN
      ALTER TABLE prompt_template_usage ADD CONSTRAINT prompt_template_usage_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'Foreign key constraint already exists';
    END;
  END IF;
END
$$;

-- Grant access to authenticated users
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for prompt_templates
DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users can read prompt_templates"
      ON prompt_templates
      FOR SELECT
      TO authenticated
      USING (true);
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can read prompt_templates" already exists';
  END;

  BEGIN
    CREATE POLICY "Users can insert prompt_templates"
      ON prompt_templates
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can insert prompt_templates" already exists';
  END;
END
$$;

-- RLS policies for prompt_template_usage
DO $$
BEGIN
  BEGIN
    CREATE POLICY "Users can read own prompt_template_usage"
      ON prompt_template_usage
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid() OR user_id IS NULL);
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can read own prompt_template_usage" already exists';
  END;

  BEGIN
    CREATE POLICY "Users can insert own prompt_template_usage"
      ON prompt_template_usage
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Policy "Users can insert own prompt_template_usage" already exists';
  END;
END
$$;

-- Insert some initial system templates for common topics
-- These will serve as fallbacks when no crowd-sourced templates exist yet
INSERT INTO prompt_templates (topic, template_text, source, efficacy_score, usage_count)
VALUES 
  ('computer_science', 
   '{"query_pattern":"Explain [ENTITY] in computer science","structure":{"has_introduction":true,"has_explanation":true,"has_analogy":true,"has_example":true,"has_key_takeaways":true,"is_structured":false}}',
   'system',
   4.5,
   10),
   
  ('mathematics', 
   '{"query_pattern":"What is [ENTITY] in mathematics","structure":{"has_introduction":true,"has_explanation":true,"has_analogy":true,"has_example":true,"has_key_takeaways":true,"is_structured":false}}',
   'system',
   4.5,
   10),
   
  ('physics', 
   '{"query_pattern":"How does [ENTITY] work in physics","structure":{"has_introduction":true,"has_explanation":true,"has_analogy":true,"has_example":true,"has_key_takeaways":true,"is_structured":false}}',
   'system',
   4.5,
   10),
   
  ('general', 
   '{"query_pattern":"Explain [ENTITY]","structure":{"has_introduction":true,"has_explanation":true,"has_analogy":true,"has_example":true,"has_key_takeaways":true,"is_structured":false}}',
   'system',
   4.0,
   5);

-- Create function to update template efficacy based on feedback
CREATE OR REPLACE FUNCTION update_template_efficacy()
RETURNS TRIGGER AS $$
BEGIN
  -- If a feedback score is provided, update the template efficacy
  IF NEW.feedback_score IS NOT NULL THEN
    UPDATE prompt_templates
    SET 
      efficacy_score = (
        -- Simple weighted average calculation
        (efficacy_score * usage_count + NEW.feedback_score) / (usage_count + 1)
      ),
      usage_count = usage_count + 1
    WHERE id = NEW.template_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run the function when feedback is provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE 
    tgname = 'template_feedback_trigger'
  ) THEN
    CREATE TRIGGER template_feedback_trigger
    AFTER UPDATE OF feedback_score ON prompt_template_usage
    FOR EACH ROW
    WHEN (OLD.feedback_score IS NULL AND NEW.feedback_score IS NOT NULL)
    EXECUTE FUNCTION update_template_efficacy();
  END IF;
END
$$; 