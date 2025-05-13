-- Add adaptive_prompt column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS adaptive_prompt TEXT DEFAULT ''; 