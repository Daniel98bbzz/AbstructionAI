# Secret Feedback System

## Overview

The Secret Feedback System is a comprehensive sentiment analysis tool that automatically classifies user messages in the background to understand user satisfaction and engagement patterns. The system operates transparently without interrupting the user experience.

## Features

### 🔍 Automatic Sentiment Analysis
- **Real-time Processing**: Every user message is analyzed automatically when submitted
- **Fuzzy Matching**: Uses Fuse.js for intelligent phrase matching with 0.3 threshold
- **Non-blocking**: Runs in background without affecting chat performance
- **Silent Operation**: Users are unaware their messages are being analyzed

### 📊 Sentiment Classification
Messages are classified into four categories:

1. **Positive** (`+1 score`)
   - "thank you", "got it", "makes sense", "very helpful"
   - "that helps", "perfect", "awesome", "great explanation"
   - "clear now", "brilliant", "excellent", "love it"

2. **Negative** (`-1 score`)
   - "i don't understand", "confusing", "explain again"
   - "makes no sense", "didn't get it", "i'm lost"
   - "that's wrong", "not helpful", "please elaborate"

3. **Neutral** (`0 score`)
   - "okay", "i see", "alright", "hmm", "interesting"
   - "noted", "fine", "right", "cool", "gotcha"

4. **Unknown** (`not stored`)
   - Messages that don't match any predefined patterns
   - System ignores these to avoid noise in data

### 📈 Analytics Dashboard
- **User Score**: Overall sentiment score (+positive, -negative)
- **Statistics Grid**: Counts of positive/negative/neutral/total messages
- **Recent History**: Last 10 classified messages with timestamps
- **Visual Indicators**: Color-coded progress bars and sentiment badges
- **Real-time Updates**: Refresh functionality for latest data

## Technical Implementation

### Database Schema

```sql
-- Supabase table: secret_feedback
CREATE TABLE secret_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_secret_feedback_user_id ON secret_feedback(user_id);
CREATE INDEX idx_secret_feedback_timestamp ON secret_feedback(timestamp);
CREATE INDEX idx_secret_feedback_type ON secret_feedback(feedback_type);

-- Row Level Security
ALTER TABLE secret_feedback ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own secret feedback" ON secret_feedback
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can view their own secret feedback" ON secret_feedback
    FOR SELECT USING (auth.uid()::text = user_id);
```

### Core Components

#### 1. Sentiment Classifier (`src/utils/secretFeedbackClassifier.js`)

```javascript
// Main classification function
export function classifyFeedback(message)

// Database operations
export async function storeSecretFeedback(userId, message, feedbackType)
export async function calculateScore(userId)
export async function getRecentFeedback(userId, limit = 50)

// Main processing function
export async function processUserMessage(userId, message)
```

#### 2. Analytics Dashboard (`src/components/SecretFeedbackDashboard.jsx`)

- React component with real-time data loading
- Score visualization with color coding
- Statistics grid layout
- Recent message history with sentiment badges
- Refresh functionality

#### 3. Chat Integration (`src/pages/QueryPage.jsx`)

```javascript
// Integrated into handleSubmit function
const result = await processUserMessage(user.id, query);
// Processed after user message creation (non-blocking)
```

### Dependencies

```json
{
  "@supabase/supabase-js": "^2.x.x",
  "fuse.js": "^7.x.x"
}
```

## Installation & Setup

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js fuse.js
```

### 2. Database Migration

```bash
# Apply the migration to create the secret_feedback table
supabase migration up
```

### 3. Import Components

```javascript
// In your dashboard or desired page
import SecretFeedbackDashboard from '../components/SecretFeedbackDashboard';

// In your chat component
import { processUserMessage } from '../utils/secretFeedbackClassifier';
```

### 4. Integration Example

```javascript
// In chat submission handler
const handleSubmit = async (e) => {
  e.preventDefault();
  
  const userMessage = {
    id: Date.now().toString(),
    content: query,
    role: 'user',
    timestamp: Date.now()
  };

  // Process secret feedback (non-blocking)
  if (user) {
    processUserMessage(user.id, query).then(result => {
      console.log('Secret feedback processed:', result);
    }).catch(error => {
      console.error('Error processing secret feedback:', error);
    });
  }

  // Continue with normal message processing...
};
```

## Usage Examples

### Testing the System

1. **Go to Dashboard**: Visit `/dashboard` to see the analytics
2. **Start Chatting**: Go to `/query` and send messages
3. **Try Different Sentiments**:

```
Positive: "Thank you, that makes perfect sense!"
Negative: "I don't understand this explanation"
Neutral: "Okay, I see what you mean"
Unknown: "What's the weather like today?" (won't be stored)
```

4. **Check Analytics**: Return to dashboard to see updated scores

### Score Interpretation

- **Score > 5**: Excellent user satisfaction
- **Score 1-5**: Positive user experience
- **Score 0**: Neutral interaction pattern
- **Score -1 to -5**: User experiencing difficulties
- **Score < -5**: Poor user experience, needs attention

## Data Privacy & Security

### Row Level Security (RLS)
- Users can only access their own feedback data
- Automatic user authentication through Supabase auth
- Admin policies can be added for moderation

### Data Minimization
- Only stores necessary message content and classification
- No sensitive personal information beyond user ID
- Automatic timestamp for data lifecycle management

### Transparent Processing
- All processing happens client-side before storage
- No third-party APIs involved in classification
- User maintains control over their data

## Analytics Insights

### Use Cases

1. **User Experience Monitoring**
   - Identify users struggling with explanations
   - Track satisfaction trends over time
   - Detect patterns in user feedback

2. **Content Optimization**
   - Find topics that generate negative sentiment
   - Improve explanations based on user reactions
   - Optimize learning materials

3. **Engagement Tracking**
   - Monitor user satisfaction without explicit feedback
   - Identify highly engaged vs. frustrated users
   - Personalize experience based on sentiment patterns

### Reporting Features

- **Real-time Dashboard**: Immediate feedback on user sentiment
- **Historical Trends**: Track changes in user satisfaction
- **Bulk Analytics**: Aggregate data across user base (admin)
- **Export Capabilities**: JSON data export for further analysis

## Configuration

### Customizing Phrase Libraries

Edit `src/utils/secretFeedbackClassifier.js`:

```javascript
const feedbackPhrases = {
  positive: [
    // Add your positive phrases
    "amazing", "wonderful", "exactly what I needed"
  ],
  negative: [
    // Add your negative phrases
    "too complicated", "doesn't work", "frustrating"
  ],
  neutral: [
    // Add your neutral phrases
    "noted", "understood", "acknowledged"
  ]
};
```

### Adjusting Fuzzy Matching

```javascript
const fuse = new Fuse(allPhrases, {
  keys: ['phrase'],
  threshold: 0.3,  // Adjust sensitivity (0.0 = exact match, 1.0 = match anything)
  includeScore: true
});
```

## Troubleshooting

### Common Issues

1. **No Data Appearing**
   - Check if user is authenticated
   - Verify Supabase connection
   - Ensure RLS policies are correctly set

2. **Classification Not Working**
   - Verify Fuse.js is properly imported
   - Check if message matches phrase patterns
   - Test with exact phrase matches first

3. **Dashboard Loading Issues**
   - Check browser console for errors
   - Verify component is properly imported
   - Ensure user has sent messages

### Debug Mode

Enable debug logging:

```javascript
// In secretFeedbackClassifier.js
const DEBUG = true;

export async function processUserMessage(userId, message) {
  const feedbackType = classifyFeedback(message);
  
  if (DEBUG) {
    console.log('Processing message:', message);
    console.log('Classified as:', feedbackType);
  }
  
  // ... rest of function
}
```

## Future Enhancements

### Planned Features

1. **Machine Learning Integration**
   - Train custom sentiment models
   - Improve classification accuracy
   - Context-aware sentiment analysis

2. **Advanced Analytics**
   - Sentiment trends over time
   - Topic-specific sentiment analysis
   - User journey sentiment mapping

3. **Real-time Alerts**
   - Notify admins of negative sentiment spikes
   - Automatic intervention triggers
   - Escalation workflows

4. **A/B Testing Integration**
   - Test different explanation styles
   - Measure sentiment impact of changes
   - Optimize based on feedback data

### Contributing

To add new features:

1. Follow existing code patterns
2. Add comprehensive error handling
3. Maintain non-blocking operation
4. Update documentation
5. Test with various message types

## License

Part of the AbstructionAI project. See main project license for details.

---

*Last Updated: 2025-01-28*
*Version: 1.0.0* 