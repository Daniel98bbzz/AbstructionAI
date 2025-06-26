-- Migration: Create gamification tables for streaks, leaderboards, and enhanced progress tracking
-- Created: 2025-01-31
-- Purpose: Add gamification features including user streaks, leaderboard, and adaptive mastery tracking

-- Create user_streaks table for tracking daily activity streaks
CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_active_date DATE DEFAULT CURRENT_DATE,
    streak_freeze_count INTEGER DEFAULT 0, -- For gamification: allow users to "freeze" streaks
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create leaderboard table for tracking user points and rankings
CREATE TABLE IF NOT EXISTS leaderboard (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    weekly_points INTEGER DEFAULT 0,
    monthly_points INTEGER DEFAULT 0,
    rank_position INTEGER,
    rank_tier VARCHAR(20) DEFAULT 'bronze', -- bronze, silver, gold, platinum, diamond
    last_point_activity TIMESTAMPTZ DEFAULT NOW(),
    achievements_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create user_achievements table for tracking accomplishments
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL, -- 'streak_7', 'mastery_expert', 'quiz_perfect', etc.
    achievement_name VARCHAR(100) NOT NULL,
    achievement_description TEXT,
    points_awarded INTEGER DEFAULT 0,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    topic_name VARCHAR(100), -- Optional: if achievement is topic-specific
    metadata JSONB DEFAULT '{}', -- Store additional achievement data
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create topic_mastery table for tracking detailed mastery information
CREATE TABLE IF NOT EXISTS topic_mastery (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_name VARCHAR(100) NOT NULL,
    mastery_score INTEGER DEFAULT 0, -- 0-100
    mastery_level VARCHAR(20) DEFAULT 'beginner', -- beginner, intermediate, advanced, expert
    confidence_score DECIMAL(3,2) DEFAULT 0.0, -- 0.0-1.0
    
    -- Spaced repetition data
    easiness_factor DECIMAL(3,2) DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    last_review_date TIMESTAMPTZ,
    next_review_date TIMESTAMPTZ,
    last_review_quality INTEGER, -- 0-5 scale
    
    -- Performance tracking
    total_time_spent INTEGER DEFAULT 0, -- in seconds
    review_count INTEGER DEFAULT 0,
    quiz_attempts INTEGER DEFAULT 0,
    quiz_successes INTEGER DEFAULT 0,
    avg_feedback_score DECIMAL(3,2) DEFAULT 0.0, -- 1.0-5.0
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, topic_name)
);

-- Create learning_sessions table for detailed session tracking
CREATE TABLE IF NOT EXISTS learning_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID, -- Link to existing sessions if available
    topic_name VARCHAR(100),
    session_type VARCHAR(30) DEFAULT 'learning', -- learning, review, quiz, practice
    duration_seconds INTEGER DEFAULT 0,
    interactions_count INTEGER DEFAULT 0,
    avg_feedback_score DECIMAL(3,2),
    completed_successfully BOOLEAN DEFAULT false,
    points_earned INTEGER DEFAULT 0,
    session_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create point_transactions table for tracking point earning/spending
CREATE TABLE IF NOT EXISTS point_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL, -- 'earn', 'spend', 'bonus', 'penalty'
    points_change INTEGER NOT NULL, -- can be negative for spending
    reason VARCHAR(100) NOT NULL, -- 'daily_streak', 'quiz_completion', 'mastery_level_up', etc.
    topic_name VARCHAR(100), -- Optional: if points are topic-specific
    reference_id UUID, -- Optional: reference to related record (achievement, session, etc.)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_streaks_last_active ON user_streaks(last_active_date);

CREATE INDEX IF NOT EXISTS idx_leaderboard_user_id ON leaderboard(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_total_points ON leaderboard(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_weekly_points ON leaderboard(weekly_points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank_position ON leaderboard(rank_position);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_type ON user_achievements(achievement_type);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked_at ON user_achievements(unlocked_at);

CREATE INDEX IF NOT EXISTS idx_topic_mastery_user_id ON topic_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_topic_name ON topic_mastery(topic_name);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_next_review ON topic_mastery(next_review_date);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_mastery_score ON topic_mastery(mastery_score DESC);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_session_date ON learning_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_topic ON learning_sessions(topic_name);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions(transaction_type);

-- Create update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_streaks_updated_at 
    BEFORE UPDATE ON user_streaks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leaderboard_updated_at 
    BEFORE UPDATE ON leaderboard 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topic_mastery_updated_at 
    BEFORE UPDATE ON topic_mastery 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

-- User streaks policies
CREATE POLICY "Users can view own streaks" ON user_streaks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own streaks" ON user_streaks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own streaks" ON user_streaks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Leaderboard policies (read-only for users, except their own record)
CREATE POLICY "Users can view leaderboard" ON leaderboard
    FOR SELECT USING (true); -- Anyone can view leaderboard

CREATE POLICY "Users can update own leaderboard record" ON leaderboard
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own leaderboard record" ON leaderboard
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User achievements policies
CREATE POLICY "Users can view own achievements" ON user_achievements
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements" ON user_achievements
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Topic mastery policies
CREATE POLICY "Users can view own topic mastery" ON topic_mastery
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own topic mastery" ON topic_mastery
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topic mastery" ON topic_mastery
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Learning sessions policies
CREATE POLICY "Users can view own learning sessions" ON learning_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own learning sessions" ON learning_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Point transactions policies
CREATE POLICY "Users can view own point transactions" ON point_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own point transactions" ON point_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create helpful functions for gamification

-- Function to update user streak
CREATE OR REPLACE FUNCTION update_user_streak(user_uuid UUID)
RETURNS TABLE (
    current_streak INTEGER,
    longest_streak INTEGER,
    streak_broken BOOLEAN,
    points_earned INTEGER
) AS $$
DECLARE
    today DATE := CURRENT_DATE;
    yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
    existing_streak record;
    new_current_streak INTEGER := 0;
    new_longest_streak INTEGER := 0;
    streak_was_broken BOOLEAN := false;
    points_to_award INTEGER := 0;
BEGIN
    -- Get current streak data
    SELECT * INTO existing_streak 
    FROM user_streaks 
    WHERE user_id = user_uuid;
    
    -- If no streak record exists, create one
    IF existing_streak IS NULL THEN
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_date)
        VALUES (user_uuid, 1, 1, today);
        
        new_current_streak := 1;
        new_longest_streak := 1;
        points_to_award := 10; -- Base points for starting a streak
    ELSE
        -- Check if user was active yesterday (continuing streak) or today is new activity
        IF existing_streak.last_active_date = yesterday THEN
            -- Continue streak
            new_current_streak := existing_streak.current_streak + 1;
            new_longest_streak := GREATEST(existing_streak.longest_streak, new_current_streak);
            points_to_award := LEAST(50, 10 + (new_current_streak * 2)); -- Increasing points, capped at 50
        ELSIF existing_streak.last_active_date = today THEN
            -- Already counted today, no change
            new_current_streak := existing_streak.current_streak;
            new_longest_streak := existing_streak.longest_streak;
            points_to_award := 0;
        ELSE
            -- Streak broken, restart
            new_current_streak := 1;
            new_longest_streak := existing_streak.longest_streak;
            streak_was_broken := true;
            points_to_award := 10; -- Base points for restarting
        END IF;
        
        -- Update the streak record
        UPDATE user_streaks 
        SET 
            current_streak = new_current_streak,
            longest_streak = new_longest_streak,
            last_active_date = today,
            updated_at = NOW()
        WHERE user_id = user_uuid;
    END IF;
    
    -- Award points if any earned
    IF points_to_award > 0 THEN
        INSERT INTO point_transactions (user_id, transaction_type, points_change, reason)
        VALUES (user_uuid, 'earn', points_to_award, 'daily_streak');
    END IF;
    
    RETURN QUERY SELECT new_current_streak, new_longest_streak, streak_was_broken, points_to_award;
END;
$$ LANGUAGE plpgsql;

-- Function to award achievement
CREATE OR REPLACE FUNCTION award_achievement(
    user_uuid UUID,
    achievement_type_param VARCHAR(50),
    achievement_name_param VARCHAR(100),
    achievement_description_param TEXT,
    points_param INTEGER DEFAULT 0,
    topic_name_param VARCHAR(100) DEFAULT NULL,
    metadata_param JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
    already_has_achievement BOOLEAN := false;
BEGIN
    -- Check if user already has this achievement
    SELECT EXISTS(
        SELECT 1 FROM user_achievements 
        WHERE user_id = user_uuid 
        AND achievement_type = achievement_type_param
        AND (topic_name_param IS NULL OR topic_name = topic_name_param)
    ) INTO already_has_achievement;
    
    -- If they don't have it, award it
    IF NOT already_has_achievement THEN
        INSERT INTO user_achievements (
            user_id, achievement_type, achievement_name, achievement_description,
            points_awarded, topic_name, metadata
        ) VALUES (
            user_uuid, achievement_type_param, achievement_name_param, 
            achievement_description_param, points_param, topic_name_param, metadata_param
        );
        
        -- Award points
        IF points_param > 0 THEN
            INSERT INTO point_transactions (user_id, transaction_type, points_change, reason)
            VALUES (user_uuid, 'earn', points_param, 'achievement_' || achievement_type_param);
        END IF;
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql; 