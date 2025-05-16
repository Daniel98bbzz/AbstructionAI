-- Migration script for Multi-Signal Evaluation feature (Phase 2)

-- Step 1: Add new fields to prompt_templates table
ALTER TABLE prompt_templates
ADD COLUMN IF NOT EXISTS follow_up_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confusion_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS component_rating JSONB DEFAULT '{"analogy": 0, "explanation": 0, "clarity": 0, "relevance": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS composite_quality_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS quality_score_metadata JSONB;

-- Step 2: Add had_follow_up field to prompt_template_usage table
ALTER TABLE prompt_template_usage
ADD COLUMN IF NOT EXISTS had_follow_up BOOLEAN DEFAULT FALSE;

-- Step 3: Create template_component_feedback table for granular feedback
CREATE TABLE IF NOT EXISTS template_component_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_usage_id UUID NOT NULL REFERENCES prompt_template_usage(id) ON DELETE CASCADE,
  analogy_rating INTEGER,
  explanation_rating INTEGER,
  clarity_rating INTEGER,
  relevance_rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS template_component_feedback_usage_id_idx 
ON template_component_feedback(template_usage_id);

-- Add RLS policies for template_component_feedback table
ALTER TABLE template_component_feedback ENABLE ROW LEVEL SECURITY;

-- Create permissive RLS policy for template_component_feedback
CREATE POLICY IF NOT EXISTS "Allow all template_component_feedback access" 
ON template_component_feedback
FOR ALL 
TO public
USING (true)
WITH CHECK (true);

-- Create a function to calculate the initial composite quality score
-- This will calculate the score for all templates during migration
CREATE OR REPLACE FUNCTION calculate_initial_composite_scores()
RETURNS VOID AS $$
DECLARE
  template_record RECORD;
  efficacy_score NUMERIC;
  follow_up_score NUMERIC;
  confusion_score NUMERIC;
  confidence_score NUMERIC;
  component_score NUMERIC;
  composite_score NUMERIC;
  score_metadata JSONB;
BEGIN
  FOR template_record IN SELECT * FROM prompt_templates
  LOOP
    -- Normalize scores to 0-1 range where 1 is always better
    
    -- Efficacy score (already 0-5, normalize to 0-1)
    efficacy_score := COALESCE(template_record.efficacy_score, 0) / 5;
    
    -- Follow-up rate (0-1, invert so lower is better)
    follow_up_score := 1 - COALESCE(template_record.follow_up_rate, 0);
    
    -- Confusion score (0-1, invert so lower is better)
    confusion_score := 1 - COALESCE(template_record.confusion_score, 0);
    
    -- Confidence score (already 0-1, higher is better)
    confidence_score := COALESCE(template_record.confidence_score, 0);
    
    -- Component ratings (normalize and average)
    IF template_record.component_rating IS NOT NULL THEN
      component_score := (
        COALESCE((template_record.component_rating->>'analogy')::numeric, 0) +
        COALESCE((template_record.component_rating->>'explanation')::numeric, 0) +
        COALESCE((template_record.component_rating->>'clarity')::numeric, 0) +
        COALESCE((template_record.component_rating->>'relevance')::numeric, 0)
      ) / 20; -- Divide by 20 (4 components × max rating of 5)
    ELSE
      component_score := 0;
    END IF;
    
    -- Calculate weighted composite score with default weights
    composite_score := 
      (efficacy_score * 0.35) +
      (follow_up_score * 0.20) +
      (confusion_score * 0.20) +
      (confidence_score * 0.15) +
      (component_score * 0.10);
    
    -- Store metadata about calculation
    score_metadata := jsonb_build_object(
      'calculation_time', now(),
      'weights', jsonb_build_object(
        'efficacy', 0.35,
        'followUp', 0.20,
        'confusion', 0.20,
        'confidence', 0.15,
        'components', 0.10
      ),
      'component_scores', jsonb_build_object(
        'efficacy', efficacy_score,
        'follow_up', follow_up_score,
        'confusion', confusion_score,
        'confidence', confidence_score,
        'component', component_score
      )
    );
    
    -- Update the template
    UPDATE prompt_templates
    SET 
      composite_quality_score = composite_score,
      quality_score_metadata = score_metadata
    WHERE id = template_record.id;
    
    RAISE NOTICE 'Updated composite score for template %: %', 
      template_record.id, 
      composite_score;
  END LOOP;
  
  RAISE NOTICE 'Completed initial composite score calculation';
END;
$$ LANGUAGE plpgsql;

-- Execute the function to calculate initial scores
SELECT calculate_initial_composite_scores();

-- Add selection_method field to prompt_template_usage for A/B testing
ALTER TABLE prompt_template_usage
ADD COLUMN IF NOT EXISTS selection_method VARCHAR DEFAULT 'efficacy_score'; 