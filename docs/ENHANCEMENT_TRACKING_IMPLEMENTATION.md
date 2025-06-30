# Crowd Wisdom Enhancement Tracking Implementation

## Overview
This document describes the implementation of enhanced tracking for prompt enhancements in the Crowd Wisdom system. The system now tracks whether prompt enhancements are applied, their origin, and usage patterns.

## Database Changes

### `crowd_wisdom_query_assignments` Table - New Fields
- `prompt_enhancement_applied` (boolean): Whether a prompt enhancement was applied to this query
- `prompt_enhancement_used` (text): The actual prompt enhancement text that was used  
- `prompt_enhancement_hash` (text): SHA-256 hash of the enhancement for tracking/deduplication
- `cluster_name_at_time` (text): The cluster name when the query was processed (for historical tracking)

### `crowd_wisdom_clusters` Table - New Fields  
- `prompt_enhancement_hash` (text): Hash of the current prompt enhancement
- `prompt_enhancement_version` (integer): Version number of the enhancement (increments with updates)

## Code Changes

### CrowdWisdomManager.js - New Methods

#### `calculateHash(text)`
- Calculates SHA-256 hash of enhancement text for tracking and deduplication
- Used to identify unique enhancements across the system

#### `updateQueryAssignmentWithEnhancement(assignmentId, promptEnhancement, enhancementHash, clusterId, sessionId)`
- Updates query assignment records with enhancement tracking data
- Captures cluster name at the time of query processing
- Logs enhancement application events

#### `getEnhancementAnalytics(timeframe, clusterId)`
- Compiles analytics about enhancement usage patterns
- Tracks application rates, unique enhancements, and success patterns
- Returns detailed usage statistics by enhancement hash

### Enhanced Logging

#### Query Processing
- Now logs when enhancements are retrieved vs applied
- Tracks enhancement hash for traceability
- Records cluster context at query time

#### Prompt Updates
- Logs enhancement versioning information
- Tracks hash changes between versions
- Records version increments

## API Enhancements

### New Endpoint: `/api/crowd-wisdom/enhancement-analytics`
**GET** `/api/crowd-wisdom/enhancement-analytics?timeframe=24hours&clusterId=optional`

Returns:
```json
{
  "success": true,
  "data": {
    "timeframe": "24 hours",
    "clusterId": null,
    "total_queries": 7,
    "queries_with_enhancement": 1,
    "queries_without_enhancement": 6,
    "enhancement_application_rate": "14.29%",
    "unique_enhancements_used": 1,
    "enhancement_usage_patterns": {
      "b0280e23...": {
        "hash": "full_hash_here",
        "usage_count": 1,
        "cluster_names": ["Cluster Name"],
        "successful_queries": 0,
        "success_rate": "0.00"
      }
    }
  }
}
```

## What Can Now Be Measured

### 1. Enhancement Application Impact
- **Question**: Does a new template affect new questions in the same cluster?
- **Measurement**: Track `prompt_enhancement_applied` field by cluster over time
- **Query Example**:
  ```sql
  SELECT 
    cluster_id,
    cluster_name_at_time,
    COUNT(*) as total_queries,
    SUM(CASE WHEN prompt_enhancement_applied THEN 1 ELSE 0 END) as enhanced_queries,
    AVG(CASE WHEN prompt_enhancement_applied THEN 1.0 ELSE 0.0 END) * 100 as enhancement_rate
  FROM crowd_wisdom_query_assignments 
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY cluster_id, cluster_name_at_time;
  ```

### 2. Enhancement-Cluster Alignment  
- **Question**: Do created templates belong to the given answers based on cluster?
- **Measurement**: Cross-reference enhancement hashes with cluster success rates
- **Analysis**: Track if queries using specific enhancements in specific clusters show better success rates

### 3. Enhancement Effectiveness
- **Measurement**: Success rate comparison between enhanced vs non-enhanced queries
- **Query Example**:
  ```sql
  SELECT 
    prompt_enhancement_applied,
    COUNT(*) as query_count,
    AVG(CASE WHEN user_feedback_positive = true THEN 1.0 ELSE 0.0 END) * 100 as success_rate
  FROM crowd_wisdom_query_assignments 
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY prompt_enhancement_applied;
  ```

### 4. Enhancement Reuse Patterns
- **Measurement**: Track how often specific enhancement hashes are reused across clusters
- **Insight**: Identify universally effective enhancement patterns

## Logging Improvements

### Before
```
[CROWD WISDOM MANAGER] 🎨 Prompt enhancement retrieved: { hasEnhancement: false }
```

### After  
```
[CROWD WISDOM MANAGER] 🎨 Prompt enhancement retrieved: {
  clusterId: '69eadb0b...',
  hasEnhancement: false,
  enhancementLength: 0,
  enhancementPreview: 'None',
  enhancementHash: 'e3b0c442...'
}
```

## Usage Examples

### Check Enhancement Application Rate
```javascript
const analytics = await crowdWisdomManager.getEnhancementAnalytics('24 hours');
console.log(`Enhancement application rate: ${analytics.enhancement_application_rate}`);
```

### Track Specific Cluster Enhancement Usage
```javascript
const clusterAnalytics = await crowdWisdomManager.getEnhancementAnalytics('24 hours', 'cluster-id');
console.log('Cluster-specific enhancement patterns:', clusterAnalytics.enhancement_usage_patterns);
```

### Query Recent Enhancement Applications
```sql
SELECT 
  qa.query_text,
  qa.prompt_enhancement_applied,
  qa.cluster_name_at_time,
  qa.prompt_enhancement_hash,
  qa.user_feedback_positive,
  qa.created_at
FROM crowd_wisdom_query_assignments qa
WHERE qa.created_at >= NOW() - INTERVAL '1 hour'
  AND qa.prompt_enhancement_applied = true
ORDER BY qa.created_at DESC;
```

## Next Steps for Analysis

### Recommended Analytics Queries

1. **Track Enhancement Impact Over Time**
   - Compare success rates before/after enhancement deployment
   - Monitor how enhancement application affects cluster performance

2. **Enhancement Drift Detection**  
   - Track when enhancement hashes change frequently (possible instability)
   - Identify clusters with version churn

3. **Cross-Cluster Enhancement Analysis**
   - Find enhancement patterns that work across multiple clusters
   - Identify enhancement text that could be generalized

4. **Temporal Enhancement Effectiveness**
   - Track if enhancement effectiveness degrades over time
   - Identify when enhancements need refreshing

## Testing

The implementation includes comprehensive tracking that was verified through:
- ✅ Query processing tracks enhancement application
- ✅ Enhancement hashes are calculated and stored  
- ✅ Cluster names are captured at query time
- ✅ Analytics can track enhancement usage patterns
- ✅ Enhancement versioning is working
- ✅ Database records contain all tracking fields
- ✅ API endpoint returns proper analytics data

This implementation provides the foundation for measuring both enhancement effectiveness and cluster-enhancement alignment, addressing the core questions about template impact and belonging. 