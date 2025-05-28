# Secret Topic Implementation Documentation

## Overview

The **Secret Topic System** is an automatic topic classification feature that analyzes user queries and conversations to categorize them into educational topics. This system operates behind the scenes to enable topic-based filtering, analytics, and clustering without requiring explicit user input.

## Table of Contents

1. [Core Implementation](#core-implementation)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Cluster Integration](#cluster-integration)
5. [Frontend Integration](#frontend-integration)
6. [Topic Management](#topic-management)
7. [Usage Examples](#usage-examples)
8. [Data Flow](#data-flow)

---

## Core Implementation

### 1. Automatic Topic Classification (server/index.js)

The main topic classification happens during query processing in the `/api/query` endpoint:

#### Process Flow:
1. **Query Processing**: After OpenAI generates a response to user query
2. **Topic Analysis**: System analyzes the query and response content
3. **Classification**: Uses OpenAI to classify into existing or new topics
4. **Storage**: Updates session with the classified topic
5. **Analytics**: Increments topic usage counters

#### Implementation Details:

```javascript
// Topic Classification - Classify the conversation topic using OpenAI
let secretTopic = null;
try {
  console.log('[Topic Classification] Starting topic classification...');
  
  // Get existing topics from database
  const { data: existingTopics, error: topicsError } = await supabase
    .from('topics')
    .select('name, description')
    .eq('is_active', true);
  
  const topicsList = existingTopics?.map(t => t.name) || [];
  const topicsContext = existingTopics?.map(t => `${t.name}: ${t.description}`).join('\n') || '';
  
  // Create topic classification prompt
  const topicClassificationPrompt = `You are a topic classifier for an educational AI tutoring system. 
Analyze the following query and conversation context to determine the most appropriate topic.

EXISTING TOPICS:
${topicsContext}

USER QUERY: ${query}
CONVERSATION CONTEXT: ${sections.explanation?.substring(0, 500) || ''}

INSTRUCTIONS:
1. If the query fits one of the existing topics above, respond with EXACTLY that topic name
2. If no existing topic fits well, create a new descriptive topic name (use underscores, lowercase)
3. Respond with ONLY the topic name, nothing else
4. Examples of good topic names: "linear_algebra", "organic_chemistry", "machine_learning", "calculus"

TOPIC:`;

  const topicCompletion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: topicClassificationPrompt }],
    temperature: 0.1,
    max_tokens: 50
  });
  
  secretTopic = topicCompletion.choices[0].message.content.trim();
  console.log(`[Topic Classification] Classified topic: ${secretTopic}`);
  
  // Auto-create new topics if needed
  if (!topicsList.includes(secretTopic)) {
    console.log(`[Topic Classification] Adding new topic: ${secretTopic}`);
    await supabase.from('topics').insert({
      name: secretTopic,
      description: `Automatically generated topic for: ${secretTopic.replace(/_/g, ' ')}`
    });
  }
  
  // Update topic usage count
  const { data: topicData } = await supabase
    .from('topics')
    .select('usage_count')
    .eq('name', secretTopic)
    .single();
  
  const currentCount = topicData?.usage_count || 0;
  await supabase
    .from('topics')
    .update({ 
      usage_count: currentCount + 1,
      updated_at: new Date().toISOString()
    })
    .eq('name', secretTopic);

} catch (topicError) {
  console.error('[Topic Classification] Error in topic classification:', topicError);
  secretTopic = 'general'; // Fallback topic
}

// Update session with secret_topic
await supabase
  .from('sessions')
  .update({ secret_topic: secretTopic })
  .eq('id', sessionData.id);

// Add secret_topic to response for frontend
response.secret_topic = secretTopic;
```

#### Key Features:
- **Intelligent Classification**: Uses GPT-4 to analyze query context
- **Dynamic Topic Creation**: Automatically creates new topics when needed
- **Usage Analytics**: Tracks topic usage frequency
- **Fallback Handling**: Defaults to 'general' topic on errors

---

## Database Schema

### Tables Involved

#### 1. `sessions` Table
```sql
-- Added secret_topic column to existing sessions table
ALTER TABLE sessions ADD COLUMN secret_topic TEXT;

-- Index for efficient topic-based queries
CREATE INDEX idx_sessions_secret_topic ON sessions(secret_topic);
```

#### 2. `topics` Table
```sql
CREATE TABLE topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_topics_updated_at();

-- Initial topic data
INSERT INTO topics (name, description) VALUES
  ('computer_science', 'Programming, algorithms, data structures, software engineering'),
  ('mathematics', 'Algebra, calculus, geometry, statistics, mathematical concepts'),
  ('algorithms', 'Algorithm design, complexity analysis, algorithmic problem solving'),
  ('geometry', 'Shapes, spatial relationships, geometric proofs and calculations'),
  ('physics', 'Mechanics, thermodynamics, electromagnetism, quantum physics'),
  ('chemistry', 'Chemical reactions, molecular structure, organic/inorganic chemistry'),
  ('biology', 'Life sciences, genetics, ecology, human biology'),
  ('history', 'Historical events, civilizations, historical analysis'),
  ('literature', 'Literary analysis, writing techniques, classic and modern literature'),
  ('art', 'Visual arts, art history, artistic techniques and movements');
```

---

## API Endpoints

### Topic Management Endpoints

#### 1. Get All Topics
```http
GET /api/topics
```
**Response:**
```json
{
  "success": true,
  "topics": [
    {
      "id": "uuid",
      "name": "algorithms",
      "description": "Algorithm design and analysis",
      "usage_count": 15,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### 2. Get Topic Statistics
```http
GET /api/topics/stats
```
**Response:**
```json
{
  "success": true,
  "totalTopics": 10,
  "totalSessions": 45,
  "mostUsedTopic": "algorithms",
  "topicStats": [
    {
      "name": "algorithms",
      "usage_count": 15,
      "session_count": 12
    }
  ]
}
```

#### 3. Get Session Topic
```http
GET /api/sessions/:sessionId/topic
```
**Response:**
```json
{
  "success": true,
  "topic": "algorithms"
}
```

#### 4. Create New Topic
```http
POST /api/topics
Content-Type: application/json

{
  "name": "machine_learning",
  "description": "ML algorithms, neural networks, data science"
}
```

---

## Cluster Integration

### 1. Topic-Based Cluster Filtering (server/api/clusterRoutes.js)

#### Get Clusters by Topic
```http
GET /api/clusters/by-topic?topic=algorithms&min_usage=2
```

**Implementation:**
```javascript
app.get('/api/clusters/by-topic', async (req, res) => {
  try {
    const { topic, min_usage } = req.query;
    
    // Get base clusters
    const { data: clusters } = await clusterManager.supabase
      .from('user_clusters')
      .select('*');
    
    // Get sessions with topics for analysis
    const { data: sessions } = await clusterManager.supabase
      .from('sessions')
      .select('user_id, secret_topic')
      .not('secret_topic', 'is', null);
    
    // Calculate topic statistics for each cluster
    const clusterTopicStats = {};
    clusters.forEach(cluster => {
      const clusterSessions = sessions.filter(s => 
        // Logic to match sessions to clusters via user assignments
      );
      
      // Count topics for this cluster
      const topicCounts = {};
      clusterSessions.forEach(session => {
        if (session.secret_topic) {
          topicCounts[session.secret_topic] = (topicCounts[session.secret_topic] || 0) + 1;
        }
      });
      
      clusterTopicStats[cluster.id] = {
        total_sessions: clusterSessions.length,
        topic_counts: topicCounts,
        dominant_topic: Object.keys(topicCounts).reduce((a, b) => 
          topicCounts[a] > topicCounts[b] ? a : b, null),
        unique_topics: Object.keys(topicCounts).length
      };
    });
    
    // Filter clusters based on topic and usage
    let filteredClusters = clusters.map(cluster => ({
      ...cluster,
      topic_stats: clusterTopicStats[cluster.id]
    }));
    
    if (topic) {
      filteredClusters = filteredClusters.filter(cluster => {
        const stats = cluster.topic_stats;
        return stats.topic_counts[topic] && 
               (!min_usage || stats.topic_counts[topic] >= parseInt(min_usage));
      });
    }
    
    res.json({ 
      clusters: filteredClusters,
      topic_stats: overallTopicStats,
      filter_applied: { topic, min_usage }
    });
  } catch (error) {
    console.error('Error fetching clusters by topic:', error);
    res.status(500).json({ error: 'Failed to fetch clusters by topic' });
  }
});
```

#### Get Topic Distribution
```http
GET /api/clusters/topic-distribution
```

**Response:**
```json
{
  "distribution": {
    "cluster-uuid-1": {
      "algorithms": 5,
      "geometry": 3,
      "algebra": 2
    },
    "cluster-uuid-2": {
      "physics": 4,
      "chemistry": 6
    }
  }
}
```

---

## Frontend Integration

### 1. Cluster Visualization (cluster-visualization.html)

#### Topic Filtering Controls
```html
<div class="control-group">
  <label for="topic-filter">Filter by Topic:</label>
  <select id="topic-filter">
    <option value="">All Topics</option>
    <!-- Populated dynamically with topics -->
  </select>
</div>

<div class="control-group">
  <label for="min-usage">Min Usage:</label>
  <input type="number" id="min-usage" min="1" max="50" value="1">
</div>

<div class="control-group">
  <button id="apply-dimensions" type="button">Apply Filters</button>
  <button id="reset-filters" type="button">Reset</button>
</div>
```

#### JavaScript Implementation
```javascript
// Populate topic select dropdowns
function populateTopicSelects() {
  const topicFilter = document.getElementById('topic-filter');
  const analysisTopicSelect = document.getElementById('analysis-topic-select');
  
  // Clear existing options
  topicFilter.innerHTML = '<option value="">All Topics</option>';
  analysisTopicSelect.innerHTML = '<option value="">-- Select Topic --</option>';
  
  // Add topics to both dropdowns
  topicsData.forEach(topic => {
    const option1 = document.createElement('option');
    option1.value = topic.name;
    option1.textContent = `${topic.name} (${topic.usage_count} uses)`;
    topicFilter.appendChild(option1);
    
    const option2 = document.createElement('option');
    option2.value = topic.name;
    option2.textContent = `${topic.name} (${topic.usage_count} uses)`;
    analysisTopicSelect.appendChild(option2);
  });
}

// Fetch filtered data based on topic
async function fetchFilteredData() {
  try {
    setLoading(true);
    
    const topic = document.getElementById('topic-filter').value;
    const minUsage = document.getElementById('min-usage').value;
    currentTopicFilter = topic;
    
    let url = 'http://localhost:3001/api/clusters/by-topic';
    const params = new URLSearchParams();
    
    if (topic) {
      params.append('topic', topic);
    }
    if (minUsage && parseInt(minUsage) > 1) {
      params.append('min_usage', minUsage);
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }
    
    const response = await fetch(url);
    const data = await response.json();
    clusterData = data.clusters || [];
    
    // Show filter status
    if (topic || (minUsage && parseInt(minUsage) > 1)) {
      const filterStatus = document.getElementById('topic-filter-status');
      const topicName = topic || 'All Topics';
      const usageText = minUsage && parseInt(minUsage) > 1 ? ` (min ${minUsage} uses)` : '';
      
      filterStatus.innerHTML = `
        <div class="topic-filter-applied">
          <span class="filter-info">Filtering by: ${topicName}${usageText}</span>
          <span class="clear-filter" onclick="clearTopicFilter()">Clear Filter</span>
        </div>
      `;
      filterStatus.style.display = 'block';
    }
    
    // Re-render visualization
    renderVisualization();
    
  } catch (error) {
    console.error('Error fetching filtered data:', error);
    showStatus(`Error applying filter: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
}
```

### 2. Topic Analysis Tab

#### Individual Topic Analysis
```javascript
async function analyzeTopic(topicName) {
  try {
    setLoading(true);
    showTopicAnalysisStatus('Analyzing topic: ' + topicName);
    
    // Get topic-specific cluster data
    const response = await fetch(`http://localhost:3001/api/clusters/by-topic?topic=${encodeURIComponent(topicName)}`);
    const data = await response.json();
    
    // Show topic statistics
    displayTopicStats(topicName, data);
    
    // Show cluster distribution for this topic
    displayTopicClusterDistribution(topicName, data);
    
    // Generate insights
    generateTopicInsights(topicName, data);
    
    hideTopicAnalysisStatus();
  } catch (error) {
    console.error('Error analyzing topic:', error);
    showTopicAnalysisStatus(`Error analyzing topic: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
}

function displayTopicStats(topicName, data) {
  const statsContainer = document.getElementById('topic-stats-content');
  
  let totalSessions = 0;
  let clustersWithTopic = 0;
  
  data.clusters.forEach(cluster => {
    if (cluster.topic_stats && cluster.topic_stats.topic_counts[topicName]) {
      totalSessions += cluster.topic_stats.topic_counts[topicName];
      clustersWithTopic++;
    }
  });
  
  const topicInfo = topicsData.find(t => t.name === topicName);
  const globalUsage = topicInfo ? topicInfo.usage_count : totalSessions;
  
  statsContainer.innerHTML = `
    <div class="topic-stat-card">
      <h4>${topicName}</h4>
      <div class="stat-value">${globalUsage}</div>
      <div class="stat-label">Total Usage</div>
    </div>
    <div class="topic-stat-card">
      <h4>Cluster Presence</h4>
      <div class="stat-value">${clustersWithTopic}</div>
      <div class="stat-label">Clusters Using Topic</div>
    </div>
    <div class="topic-stat-card">
      <h4>Average per Cluster</h4>
      <div class="stat-value">${clustersWithTopic > 0 ? Math.round(totalSessions / clustersWithTopic) : 0}</div>
      <div class="stat-label">Sessions per Cluster</div>
    </div>
    <div class="topic-stat-card">
      <h4>Popularity</h4>
      <div class="stat-value">${Math.round((clustersWithTopic / data.clusters.length) * 100)}%</div>
      <div class="stat-label">Cluster Coverage</div>
    </div>
  `;
}
```

---

## Topic Management

### 1. Automatic Topic Creation

When a new topic is identified:
1. **Validation**: Check if topic already exists
2. **Creation**: Insert new topic with auto-generated description
3. **Activation**: Set as active by default
4. **Usage Tracking**: Initialize usage count

### 2. Topic Lifecycle

- **Creation**: Automatic during classification or manual via API
- **Usage Tracking**: Incremented with each classification
- **Deactivation**: Can be marked inactive (soft delete)
- **Analytics**: Usage patterns tracked for insights

### 3. Topic Naming Conventions

- **Format**: `lowercase_with_underscores`
- **Examples**: `linear_algebra`, `organic_chemistry`, `machine_learning`
- **Descriptive**: Clear and specific topic names
- **Hierarchical**: Can include subtopics (e.g., `calculus_derivatives`)

---

## Usage Examples

### 1. User Query Classification

**Scenario**: User asks "How does binary search work?"

**Process**:
1. Query processed by AI system
2. Topic classifier analyzes query and response
3. Classified as "algorithms" topic
4. Session updated with `secret_topic: 'algorithms'`
5. Topic usage count incremented
6. Available for filtering and analytics

### 2. Cluster Filtering

**Scenario**: Admin wants to see clusters focused on geometry

**Steps**:
1. Open cluster visualization
2. Select "geometry" from topic filter
3. Apply filter
4. View only clusters with geometry sessions
5. Analyze geometric learning patterns

### 3. Topic Analytics

**Scenario**: Analyzing learning patterns

**Queries**:
```sql
-- Most popular topics
SELECT name, usage_count 
FROM topics 
ORDER BY usage_count DESC;

-- Topic distribution by time
SELECT secret_topic, DATE(created_at), COUNT(*) 
FROM sessions 
WHERE secret_topic IS NOT NULL 
GROUP BY secret_topic, DATE(created_at);

-- User engagement by topic
SELECT secret_topic, AVG(interaction_count) 
FROM sessions 
WHERE secret_topic IS NOT NULL 
GROUP BY secret_topic;
```

---

## Data Flow

### 1. Classification Flow

```
User Query → OpenAI Response → Topic Analysis → Classification → Database Update
     ↓              ↓               ↓              ↓              ↓
Query Text    Response Text    Context Analysis   Topic Name    Session Update
```

### 2. Analytics Flow

```
Database Sessions → Topic Aggregation → Statistics → Visualization
        ↓                 ↓               ↓            ↓
   Topic Data        Usage Counts     Analytics    Frontend Charts
```

### 3. Filtering Flow

```
User Filter Selection → API Request → Database Query → Filtered Results → UI Update
         ↓                 ↓             ↓              ↓            ↓
    Topic + Criteria    Parameters    Topic-based    Matching     Visual
                                        JOIN        Clusters     Update
```

---

## Benefits

### 1. Automatic Organization
- **No Manual Tagging**: Topics assigned automatically
- **Consistent Classification**: AI-driven standardization
- **Dynamic Growth**: New topics created as needed

### 2. Enhanced Analytics
- **Learning Patterns**: Identify popular topics
- **Cluster Insights**: Topic-based user grouping
- **Trend Analysis**: Topic usage over time

### 3. Improved User Experience
- **Relevant Filtering**: Find related conversations
- **Topic Discovery**: Explore learning areas
- **Personalized Insights**: Topic-based recommendations

### 4. System Intelligence
- **Content Organization**: Automatic categorization
- **Pattern Recognition**: Learning behavior analysis
- **Adaptive Classification**: Improves over time

---

## Future Enhancements

### 1. Advanced Classification
- **Hierarchical Topics**: Parent-child relationships
- **Multi-topic Support**: Multiple topics per session
- **Confidence Scores**: Classification certainty

### 2. Machine Learning
- **Classification Model**: Custom ML model training
- **Pattern Learning**: Improve from user feedback
- **Predictive Analytics**: Topic trend prediction

### 3. User Features
- **Topic Preferences**: User-selected interests
- **Topic Recommendations**: Suggest related topics
- **Learning Paths**: Topic-based progression

### 4. Advanced Analytics
- **Cross-topic Analysis**: Topic correlation
- **Seasonal Trends**: Time-based patterns
- **Performance Metrics**: Topic effectiveness

---

*This documentation covers the complete secret-topic implementation across the educational AI tutoring system, from automatic classification to advanced analytics and visualization.* 