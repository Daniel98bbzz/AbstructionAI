-- Migration: Ensure embedding column is vector(1536) in interactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'interactions' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE interactions ADD COLUMN embedding vector(1536);
  ELSE
    -- If the column exists but is not the correct type, alter it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'interactions' AND column_name = 'embedding' AND data_type <> 'vector'
    ) THEN
      ALTER TABLE interactions ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector;
    END IF;
  END IF;
END $$; 