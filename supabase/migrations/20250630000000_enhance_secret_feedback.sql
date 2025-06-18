-- Enhance secret_feedback table with new features
-- Add quality_score column
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;

-- Add metadata column for storing additional context
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add embedding column for clustering/thematic analysis
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

-- Add conversation_id column if it doesn't exist (for better context tracking)
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS conversation_id TEXT;

-- Add processed_by column to track which system processed the feedback
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS processed_by TEXT DEFAULT 'phrase_matching';

-- Add confidence_score for classification confidence
ALTER TABLE secret_feedback ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 0.0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_secret_feedback_quality_score ON secret_feedback(quality_score);
CREATE INDEX IF NOT EXISTS idx_secret_feedback_conversation_id ON secret_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_secret_feedback_processed_by ON secret_feedback(processed_by);

-- Create index on metadata for JSONB queries
CREATE INDEX IF NOT EXISTS idx_secret_feedback_metadata ON secret_feedback USING GIN (metadata);

-- Create a table for feedback themes/clusters
CREATE TABLE IF NOT EXISTS feedback_clusters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    centroid VECTOR(1536),
    member_count INTEGER DEFAULT 0,
    avg_quality_score FLOAT DEFAULT 0.0,
    sentiment_distribution JSONB DEFAULT '{}',
    top_keywords JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a junction table for feedback-cluster relationships
CREATE TABLE IF NOT EXISTS feedback_cluster_assignments (
    feedback_id UUID REFERENCES secret_feedback(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES feedback_clusters(id) ON DELETE CASCADE,
    similarity_score FLOAT DEFAULT 0.0,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (feedback_id, cluster_id)
);

-- Enable RLS on new tables
ALTER TABLE feedback_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_cluster_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for feedback_clusters (admin can view/modify, users can view)
CREATE POLICY "Admin can manage feedback clusters" ON feedback_clusters
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can view feedback clusters" ON feedback_clusters
    FOR SELECT USING (true);

-- Create policies for feedback_cluster_assignments
CREATE POLICY "Admin can manage cluster assignments" ON feedback_cluster_assignments
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can view their cluster assignments" ON feedback_cluster_assignments
    FOR SELECT USING (
        feedback_id IN (
            SELECT id FROM secret_feedback WHERE user_id = auth.uid()::text
        )
    );

-- Create a function to automatically update cluster member counts
CREATE OR REPLACE FUNCTION update_cluster_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE feedback_clusters 
        SET member_count = member_count + 1,
            updated_at = NOW()
        WHERE id = NEW.cluster_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE feedback_clusters 
        SET member_count = member_count - 1,
            updated_at = NOW()
        WHERE id = OLD.cluster_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic member count updates
DROP TRIGGER IF EXISTS trigger_update_cluster_member_count ON feedback_cluster_assignments;
CREATE TRIGGER trigger_update_cluster_member_count
    AFTER INSERT OR DELETE ON feedback_cluster_assignments
    FOR EACH ROW EXECUTE FUNCTION update_cluster_member_count();

-- Create a view for enriched feedback with cluster information
CREATE OR REPLACE VIEW enriched_feedback AS
SELECT 
    sf.*,
    fc.name as cluster_name,
    fc.description as cluster_description,
    fca.similarity_score as cluster_similarity
FROM secret_feedback sf
LEFT JOIN feedback_cluster_assignments fca ON sf.id = fca.feedback_id
LEFT JOIN feedback_clusters fc ON fca.cluster_id = fc.id;

-- Grant permissions on the view
GRANT SELECT ON enriched_feedback TO authenticated;

SELECT 'Enhanced secret feedback system migration completed successfully' AS status; 