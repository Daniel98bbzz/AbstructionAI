# Modern Clustering System (UMAP + K-Means)

## Overview

This document describes the modern clustering system implemented using **UMAP (Uniform Manifold Approximation and Projection)** for dimensionality reduction and **K-Means** for clustering. This system replaces the previous custom clustering implementation.

## Architecture

### Key Components

1. **ModernClusterManager** (`server/managers/ModernClusterManager.js`)
   - Main clustering logic using UMAP + K-Means pipeline
   - User assignment and cluster management
   - Cluster prompt generation and caching

2. **Configuration** (`server/config/clustering.js`)
   - Algorithm parameters and performance settings
   - Quality thresholds and recomputation triggers

3. **API Routes** (`server/api/clusterRoutes.js`)
   - RESTful endpoints for cluster operations
   - Admin interfaces for cluster management

## Algorithm Details

### UMAP Configuration
```javascript
{
  nComponents: 2,        // 2D output for visualization
  nNeighbors: 15,        // Local neighborhood size
  minDist: 0.1,          // Minimum distance in embedding
  spread: 1.0,           // Embedding spread
  randomState: 42        // Reproducibility seed
}
```

### K-Means Configuration
```javascript
{
  maxIterations: 100,    // Maximum iterations
  tolerance: 1e-4,       // Convergence tolerance
  withIterations: false  // Return iteration details
}
```

### Feature Vector (19 dimensions)
- **Basic preferences (3)**: technical_depth, visual_learning, practical_examples
- **Learning styles (4)**: visual, auditory, reading, kinesthetic weights
- **Interest categories (12)**: science, technology, engineering, math, arts, sports, cooking, travel, entertainment, business, health, nature

## Performance Improvements

### Speed Comparison
- **Old System**: ~1633ms average response time
- **New System**: ~709ms average response time
- **Improvement**: 57% faster (924ms reduction)

### Quality Metrics
- **Cluster Balance**: Automatic load balancing across clusters
- **Empty Cluster Detection**: Monitors and prevents empty clusters
- **Size Variance Control**: Maintains reasonable cluster size distribution

## API Endpoints

### Core Clustering
- `GET /api/clusters` - Get all clusters
- `GET /api/clusters/status` - System status and configuration
- `GET /api/clusters/visualization` - Visualization data for dashboards
- `POST /api/clusters/regenerate` - Trigger cluster regeneration (admin)

### User Operations
- `POST /api/clusters/assign` - Assign user to cluster
- `GET /api/clusters/prompt/:userId` - Get cluster prompt for user

### Analytics
- `GET /api/clusters/by-topic` - Topic-filtered clusters
- `GET /api/clusters/topic-distribution` - Topic distribution analysis

## Database Schema

### user_clusters
```sql
- id: UUID (primary key)
- centroid: JSONB (visualization data with 2D coordinates)
- member_count: INTEGER
- metadata: JSONB (algorithm config, creation info)
- created_at: TIMESTAMP
```

### user_cluster_assignments
```sql
- user_id: UUID
- cluster_id: UUID (foreign key)
- similarity: FLOAT
- preferences: JSONB (normalized user preferences)
- last_updated: TIMESTAMP
```

## Configuration

### Algorithm Settings
```javascript
ClusteringConfig.algorithm = {
  name: 'UMAP + K-Means',
  numClusters: 8,
  umapConfig: { /* UMAP parameters */ },
  kmeansConfig: { /* K-Means parameters */ }
}
```

### Performance Settings
```javascript
ClusteringConfig.performance = {
  cacheTTL: 24 * 60 * 60 * 1000,  // 24 hours
  batchSize: 100,                  // Batch processing size
  maxUsers: 1000                   // Max users in clustering
}
```

### Quality Thresholds
```javascript
ClusteringConfig.quality = {
  minClusterSize: 2,               // Minimum users per cluster
  maxClusterSizeRatio: 3,          // Max size as ratio of average
  emptyClusterThreshold: 0.1       // Max 10% empty clusters
}
```

## Usage Examples

### Assign User to Cluster
```javascript
import ModernClusterManager from './server/managers/ModernClusterManager.js';

const preferences = {
  technicalDepth: 75,
  visualLearning: 60,
  practicalExamples: 85,
  learningStyle: 'Visual',
  interests: ['Programming', 'AI', 'Sports']
};

const clusterId = await ModernClusterManager.assignUserToCluster(userId, preferences);
```

### Generate New Clusters
```javascript
// Generate 8 clusters using UMAP + K-Means
const firstClusterId = await ModernClusterManager.generateClusters(8);
```

### Get Cluster Prompt
```javascript
const prompt = await ModernClusterManager.getClusterPromptForUser(userId);
console.log(prompt); // Personalized prompt based on cluster characteristics
```

## Monitoring and Maintenance

### Automatic Recomputation
The system supports automatic cluster recomputation based on:
- **Time interval**: Weekly by default (configurable)
- **User changes**: After 50+ user preference updates
- **Quality degradation**: When cluster quality drops below threshold

### Health Monitoring
```javascript
// Get current system status
const status = getClusteringStatus();

// Key metrics to monitor:
// - Total clusters and users
// - Average cluster size
// - Empty cluster count
// - Algorithm performance
```

### Manual Operations
```bash
# Test the clustering system
node scripts/test_modern_clustering.js

# Run migration (if needed)
node scripts/migrate_to_modern_clustering.js migrate

# Compare clustering quality
node scripts/migrate_to_modern_clustering.js compare
```

## Visualization

### Cluster Visualization Data
The system provides 2D visualization data suitable for scatter plots:
```javascript
{
  clusters: [
    {
      id: "cluster-uuid",
      centroid: [x, y],          // 2D coordinates
      memberCount: 15,
      avgDistance: 0.23,
      algorithm: "UMAP + K-Means"
    }
  ],
  totalUsers: 149,
  algorithmInfo: { /* config */ }
}
```

### Admin Dashboard Integration
- Real-time cluster distribution charts
- User assignment visualization
- Performance metrics dashboard
- Quality trend analysis

## Migration Notes

### From Legacy System
The migration from the old custom clustering system was completed with:
- **100% success rate** (all users migrated)
- **No data loss**
- **Immediate performance improvement**
- **Backward compatibility** maintained during transition

### Future Enhancements
Potential improvements for future versions:
1. **Advanced algorithms**: HDBSCAN, Spectral clustering
2. **Dynamic clustering**: Real-time cluster updates
3. **Multi-modal features**: Text embeddings, behavioral patterns
4. **Auto-tuning**: Automatic parameter optimization

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure `umap-js` and `ml-kmeans` packages are installed
2. **Memory Issues**: Reduce `maxUsers` in configuration for large datasets
3. **Empty Clusters**: Check `minClusterSize` and user distribution
4. **Performance**: Monitor `cacheTTL` and batch processing settings

### Debug Mode
Enable detailed logging by setting environment variable:
```bash
export CLUSTERING_DEBUG=true
```

### Performance Profiling
```javascript
// Monitor clustering performance
console.time('clustering');
await ModernClusterManager.generateClusters(8);
console.timeEnd('clustering');
```

## Security Considerations

- **User Privacy**: Preferences are normalized and aggregated
- **Data Protection**: No raw user data stored in cluster centroids
- **Access Control**: Admin endpoints require proper authentication
- **Audit Trail**: All cluster operations are logged

## Contributing

When modifying the clustering system:
1. Update tests in `scripts/test_modern_clustering.js`
2. Update documentation in this file
3. Test with representative dataset
4. Monitor performance impact
5. Update API documentation if endpoints change

---

**Last Updated**: January 2025  
**Version**: 2.0 (UMAP + K-Means)  
**Status**: Production Ready 