-- SQL script to fix array fields in user_profiles table

-- First, check and fix the column types if needed
DO $$
BEGIN
  -- Check if interests column is not of type text[]
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'interests' 
    AND data_type <> 'ARRAY'
  ) THEN
    -- Convert string representations of arrays to actual arrays
    ALTER TABLE user_profiles 
    ALTER COLUMN interests TYPE text[] USING 
      CASE 
        WHEN interests IS NULL THEN '{}'::text[]
        WHEN interests::text = '[]' THEN '{}'::text[]
        ELSE string_to_array(trim(both '[]' from interests::text), ',')
      END;
  END IF;

  -- Check if preferred_analogy_domains column is not of type text[]
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'preferred_analogy_domains' 
    AND data_type <> 'ARRAY'
  ) THEN
    -- Convert string representations of arrays to actual arrays
    ALTER TABLE user_profiles 
    ALTER COLUMN preferred_analogy_domains TYPE text[] USING 
      CASE 
        WHEN preferred_analogy_domains IS NULL THEN '{}'::text[]
        WHEN preferred_analogy_domains::text = '[]' THEN '{}'::text[]
        ELSE string_to_array(trim(both '[]' from preferred_analogy_domains::text), ',')
      END;
  END IF;
END $$;

-- Now update any string representations in arrays
UPDATE user_profiles
SET interests = '{}' 
WHERE interests IS NULL OR interests::text = '[]';

UPDATE user_profiles
SET preferred_analogy_domains = '{}' 
WHERE preferred_analogy_domains IS NULL OR preferred_analogy_domains::text = '[]';

-- Fix any JSON string representations
UPDATE user_profiles
SET 
  interests = CASE 
    WHEN interests::text LIKE '[%]' AND interests::text <> '[]' 
    THEN string_to_array(trim(both '[]' from replace(interests::text, '"', '')), ',')
    ELSE interests
  END,
  preferred_analogy_domains = CASE 
    WHEN preferred_analogy_domains::text LIKE '[%]' AND preferred_analogy_domains::text <> '[]'
    THEN string_to_array(trim(both '[]' from replace(preferred_analogy_domains::text, '"', '')), ',')
    ELSE preferred_analogy_domains
  END
WHERE 
  interests::text LIKE '[%]' OR preferred_analogy_domains::text LIKE '[%]';

-- Create a function to properly handle arrays
CREATE OR REPLACE FUNCTION ensure_array_format() RETURNS TRIGGER AS $$
BEGIN
  -- Convert string arrays to proper arrays
  IF NEW.interests IS NOT NULL AND NOT array_length(NEW.interests, 1) IS NULL THEN
    NEW.interests := NEW.interests;
  ELSE
    NEW.interests := '{}'::text[];
  END IF;
  
  IF NEW.preferred_analogy_domains IS NOT NULL AND NOT array_length(NEW.preferred_analogy_domains, 1) IS NULL THEN
    NEW.preferred_analogy_domains := NEW.preferred_analogy_domains;
  ELSE
    NEW.preferred_analogy_domains := '{}'::text[];
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically format arrays before inserting or updating
DROP TRIGGER IF EXISTS format_arrays_trigger ON user_profiles;
CREATE TRIGGER format_arrays_trigger
BEFORE INSERT OR UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION ensure_array_format(); 