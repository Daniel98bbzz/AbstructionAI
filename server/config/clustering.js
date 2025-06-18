/**
 * Modern clustering system configuration (UMAP + K-Means)
 */
export const ClusteringConfig = {
  // Clustering algorithm settings
  algorithm: {
    name: 'UMAP + K-Means',
    description: 'Modern dimensionality reduction with k-means clustering',
    numClusters: 8,
    umapConfig: {
      nComponents: 2,
      nNeighbors: 15,
      minDist: 0.1,
      spread: 1.0,
      randomState: 42
    },
    kmeansConfig: {
      maxIterations: 100,
      tolerance: 1e-4,
      withIterations: false
    }
  },
  
  // Performance settings
  performance: {
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    batchSize: 100,
    maxUsers: 1000 // Maximum users to consider in clustering
  },
  
  // Quality thresholds
  quality: {
    minClusterSize: 2,
    maxClusterSizeRatio: 3, // Max cluster size as ratio of average
    emptyClusterThreshold: 0.1 // Max 10% empty clusters
  },
  
  // Automatic re-clustering settings
  recompute: {
    enabled: true,
    interval: 7 * 24 * 60 * 60 * 1000, // Weekly (7 days in milliseconds)
    minUserChanges: 50, // Trigger recompute after 50 user changes
    qualityThreshold: 0.1 // Recompute if quality drops below threshold
  }
};

/**
 * Get the cluster manager (always returns ModernClusterManager)
 */
export async function getClusterManager() {
  const { default: ModernClusterManager } = await import('../managers/ModernClusterManager.js');
  return ModernClusterManager;
}

/**
 * Get status information about the clustering system
 */
export function getClusteringStatus() {
  return {
    algorithm: ClusteringConfig.algorithm.name,
    description: ClusteringConfig.algorithm.description,
    config: ClusteringConfig.algorithm,
    performance: ClusteringConfig.performance,
    quality: ClusteringConfig.quality,
    recompute: ClusteringConfig.recompute
  };
} 