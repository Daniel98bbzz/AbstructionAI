import { supabase } from '../lib/supabaseClient.js';
import { UMAP } from 'umap-js';
import * as mlKmeans from 'ml-kmeans';

/**
 * Modern clustering manager using UMAP + K-Means pipeline
 * Replaces custom clustering with proven ML algorithms
 */
class ModernClusterManager {
  constructor() {
    // Connect to the database
    this.supabase = supabase;
    
    // In-memory cache of user clusters
    this.userClusters = new Map();
    
    // Cache for cluster-level prompts
    this.clusterPrompts = new Map();
    
    // Default number of clusters
    this.numClusters = 5;
    
    // UMAP configuration
    this.umapConfig = {
      nComponents: 2,        // 2D for visualization, can be 3D if needed
      nNeighbors: 15,        // Local neighborhood size
      minDist: 0.1,          // Minimum distance in embedding
      spread: 1.0,           // How tightly packed the embedding is
      randomState: 42        // For reproducibility
    };
    
    // K-Means configuration
    this.kmeansConfig = {
      maxIterations: 100,
      tolerance: 1e-4,
      withIterations: false
    };
    
    // Fitted UMAP model (for transforming new users)
    this.fittedUMAP = null;
    
    // Current cluster centroids in reduced space
    this.clusterCentroids = null;
    
    // Feature statistics for normalization
    this.featureStats = null;
  }

  /**
   * Convert normalized preferences to feature vector
   * @param {Object} normalizedPreferences - The normalized user preferences
   * @returns {Array} - Feature vector
   */
  preferencesToVector(normalizedPreferences) {
    const vector = [];
    
    // Basic preference values (3 features)
    vector.push(normalizedPreferences.technical_depth || 0.5);
    vector.push(normalizedPreferences.visual_learning || 0.5);
    vector.push(normalizedPreferences.practical_examples || 0.5);
    
    // Learning style weights (4 features)
    const learningStyles = normalizedPreferences.learning_style_weights || {};
    vector.push(learningStyles.visual || 0.5);
    vector.push(learningStyles.auditory || 0.5);
    vector.push(learningStyles.reading || 0.5);
    vector.push(learningStyles.kinesthetic || 0.5);
    
    // Interest weights (12 features)
    const interests = normalizedPreferences.interest_weights || {};
    vector.push(interests.science || 0.2);
    vector.push(interests.technology || 0.2);
    vector.push(interests.engineering || 0.2);
    vector.push(interests.math || 0.2);
    vector.push(interests.arts || 0.2);
    vector.push(interests.sports || 0.2);
    vector.push(interests.cooking || 0.2);
    vector.push(interests.travel || 0.2);
    vector.push(interests.entertainment || 0.2);
    vector.push(interests.business || 0.2);
    vector.push(interests.health || 0.2);
    vector.push(interests.nature || 0.2);
    
    return vector;
  }

  /**
   * Normalize user preferences for consistent clustering (kept from original)
   * @param {Object} preferences - The user's preferences
   * @returns {Object} - Normalized preferences
   */
  normalizePreferences(preferences) {
    const normalized = {};
    
    // Handle different preference formats
    if (preferences.technicalDepth !== undefined) {
      normalized.technical_depth = preferences.technicalDepth / 100;
    } else if (preferences.technical_depth !== undefined) {
      normalized.technical_depth = preferences.technical_depth / 100;
    } else {
      normalized.technical_depth = 0.5; // Default
    }
    
    // Visual learning preference
    if (preferences.visualLearning !== undefined) {
      normalized.visual_learning = preferences.visualLearning / 100;
    } else if (preferences.visual_learning !== undefined) {
      normalized.visual_learning = preferences.visual_learning / 100;
    } else {
      normalized.visual_learning = 0.5; // Default
    }
    
    // Practical examples preference
    if (preferences.practicalExamples !== undefined) {
      normalized.practical_examples = preferences.practicalExamples / 100;
    } else if (preferences.practical_examples !== undefined) {
      normalized.practical_examples = preferences.practical_examples / 100;
    } else {
      normalized.practical_examples = 0.5; // Default
    }
    
    // Learning style weights
    const learningStyle = preferences.learning_style || preferences.learningStyle;
    normalized.learning_style_weights = {
      visual: learningStyle === 'Visual' ? 1.0 : 0.3,
      auditory: learningStyle === 'Auditory' ? 1.0 : 0.3,
      reading: learningStyle === 'Reading/Writing' ? 1.0 : 0.3,
      kinesthetic: learningStyle === 'Kinesthetic' ? 1.0 : 0.3
    };
    
    // Interest categories
    const interests = preferences.interests || [];
    normalized.interest_weights = {
      science: this.calculateInterestWeight(interests, ['Physics', 'Chemistry', 'Biology', 'Astronomy']),
      technology: this.calculateInterestWeight(interests, ['Programming', 'AI', 'Robotics', 'Computers']),
      engineering: this.calculateInterestWeight(interests, ['Mechanical', 'Electrical', 'Civil', 'Engineering']),
      math: this.calculateInterestWeight(interests, ['Mathematics', 'Statistics', 'Algebra', 'Calculus']),
      arts: this.calculateInterestWeight(interests, ['Art', 'Music', 'Literature', 'History']),
      sports: this.calculateInterestWeight(interests, ['Sports', 'Basketball', 'Football', 'Soccer', 'Tennis', 'Swimming', 'Fitness']),
      cooking: this.calculateInterestWeight(interests, ['Cooking', 'Baking', 'Food', 'Cuisine', 'Recipe', 'Culinary']),
      travel: this.calculateInterestWeight(interests, ['Travel', 'Adventure', 'Exploration', 'Geography', 'Countries', 'Tourism']),
      entertainment: this.calculateInterestWeight(interests, ['Movies', 'TV', 'Series', 'Gaming', 'Video Games', 'Entertainment']),
      business: this.calculateInterestWeight(interests, ['Business', 'Finance', 'Economics', 'Marketing', 'Management', 'Entrepreneurship']),
      health: this.calculateInterestWeight(interests, ['Health', 'Wellness', 'Nutrition', 'Medical', 'Fitness', 'Mental Health']),
      nature: this.calculateInterestWeight(interests, ['Nature', 'Environment', 'Outdoors', 'Animals', 'Plants', 'Ecology'])
    };
    
    return normalized;
  }

  /**
   * Calculate interest weight for a category (kept from original)
   * @param {Array} interests - User interests
   * @param {Array} categoryInterests - Interests in this category
   * @returns {number} - Weight between 0 and 1
   */
  calculateInterestWeight(interests, categoryInterests) {
    if (!interests || interests.length === 0) return 0.2; // Default weight
    
    // Count how many interests match this category
    let matches = 0;
    for (const interest of interests) {
      for (const categoryInterest of categoryInterests) {
        if (interest.toLowerCase().includes(categoryInterest.toLowerCase())) {
          matches++;
          break;
        }
      }
    }
    
    // Return normalized weight
    return Math.min(1, matches / categoryInterests.length);
  }

  /**
   * Normalize feature vectors using z-score normalization
   * @param {Array<Array>} vectors - Array of feature vectors
   * @returns {Object} - Normalized vectors and statistics
   */
  normalizeVectors(vectors) {
    if (!vectors || vectors.length === 0 || !vectors[0]) {
      throw new Error('Invalid vectors provided for normalization');
    }
    
    const numFeatures = vectors[0].length;
    const means = new Array(numFeatures).fill(0);
    const stds = new Array(numFeatures).fill(0);
    
    // Calculate means
    for (let i = 0; i < numFeatures; i++) {
      means[i] = vectors.reduce((sum, vec) => sum + vec[i], 0) / vectors.length;
    }
    
    // Calculate standard deviations
    for (let i = 0; i < numFeatures; i++) {
      const variance = vectors.reduce((sum, vec) => sum + Math.pow(vec[i] - means[i], 2), 0) / vectors.length;
      stds[i] = Math.sqrt(variance);
      // Avoid division by zero
      if (stds[i] === 0) stds[i] = 1;
    }
    
    // Normalize vectors
    const normalizedVectors = vectors.map(vec => 
      vec.map((val, i) => (val - means[i]) / stds[i])
    );
    
    this.featureStats = { means, stds };
    
    return {
      vectors: normalizedVectors,
      stats: { means, stds }
    };
  }

  /**
   * Apply normalization to a single vector using stored statistics
   * @param {Array} vector - Feature vector to normalize
   * @returns {Array} - Normalized vector
   */
  normalizeVector(vector) {
    if (!this.featureStats) {
      throw new Error('Feature statistics not available. Run clustering first.');
    }
    
    const { means, stds } = this.featureStats;
    return vector.map((val, i) => (val - means[i]) / stds[i]);
  }

  /**
   * Find the nearest cluster centroid for a reduced vector
   * @param {Array} reducedVector - UMAP-reduced vector
   * @param {Array<Array>} centroids - Cluster centroids in reduced space
   * @returns {number} - Cluster index
   */
  findNearestCluster(reducedVector, centroids) {
    let bestCluster = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < centroids.length; i++) {
      const distance = Math.sqrt(
        centroids[i].reduce((sum, val, j) => sum + Math.pow(val - reducedVector[j], 2), 0)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        bestCluster = i;
      }
    }
    
    return bestCluster;
  }

  /**
   * Generate clusters using UMAP + K-Means pipeline
   * @param {number} numClusters - Number of clusters to generate
   * @returns {Promise<string>} - ID of the first cluster
   */
  async generateClusters(numClusters = 5) {
    try {
      this.numClusters = numClusters;
      
      console.log(`[Modern Clusters] Starting UMAP + K-Means clustering with ${numClusters} clusters`);
      
      // Step 1: Get all user preferences from database
      const { data: userAssignments, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('user_id, preferences')
        .order('last_updated', { ascending: false })
        .limit(1000); // Consider up to 1000 most recent users
      
      if (error) throw error;
      
      if (!userAssignments || userAssignments.length < numClusters * 2) {
        console.log(`[Modern Clusters] Not enough users (${userAssignments?.length || 0}) for ${numClusters} clusters`);
        return this.createDefaultCluster();
      }
      
      console.log(`[Modern Clusters] Processing ${userAssignments.length} users`);
      
      // Step 2: Convert preferences to feature vectors
      const featureVectors = userAssignments.map(user => 
        this.preferencesToVector(user.preferences)
      );
      
      // Step 3: Normalize feature vectors
      const { vectors: normalizedVectors } = this.normalizeVectors(featureVectors);
      
      // Step 4: Apply UMAP dimensionality reduction
      console.log('[Modern Clusters] Applying UMAP dimensionality reduction...');
      const umap = new UMAP(this.umapConfig);
      const reducedVectors = umap.fit(normalizedVectors);
      
      // Store the fitted UMAP model for new user assignment
      this.fittedUMAP = umap;
      
      console.log(`[Modern Clusters] UMAP reduced ${normalizedVectors.length} vectors from ${normalizedVectors[0].length}D to ${reducedVectors[0].length}D`);
      
      // Step 5: Apply K-Means clustering
      console.log('[Modern Clusters] Applying K-Means clustering...');
      const kmeansResult = mlKmeans.kmeans(reducedVectors, numClusters, this.kmeansConfig);
      
      // Store centroids for new user assignment
      this.clusterCentroids = kmeansResult.centroids;
      
      console.log(`[Modern Clusters] K-Means completed with ${kmeansResult.centroids.length} clusters`);
      
      // Step 6: Create cluster records in database
      const clusterIds = await this.saveClustersToDB(kmeansResult.centroids, kmeansResult.clusters, reducedVectors);
      
      // Step 7: Update user assignments
      await this.updateUserAssignmentsAfterClustering(userAssignments, kmeansResult.clusters, clusterIds);
      
      console.log(`[Modern Clusters] Successfully generated ${clusterIds.length} clusters using UMAP + K-Means`);
      
      // Generate cluster prompts for each newly created cluster
      clusterIds.forEach((clusterId) => {
        this.updateClusterPrompt(clusterId).catch((err) => {
          console.error(`Failed to create prompt for cluster ${clusterId}`, err);
        });
      });
      
      return clusterIds[0]; // Return first cluster ID
      
    } catch (error) {
      console.error('Error generating clusters with UMAP + K-Means:', error);
      
      // Create default cluster as fallback
      return this.createDefaultCluster();
    }
  }

  /**
   * Assign a user to a cluster based on their preferences
   * @param {string} userId - The user's ID
   * @param {Object} preferences - The user's preferences
   * @returns {Promise<string>} - The cluster ID
   */
  async assignUserToCluster(userId, preferences) {
    try {
      // Check cache first
      const cachedCluster = this.userClusters.get(userId);
      
      // If we have a recent cached assignment, return it
      if (cachedCluster && cachedCluster.timestamp > Date.now() - 86400000) { // 24 hours
        console.log(`[Modern Clusters] Using cached cluster ${cachedCluster.clusterId} for user ${userId}`);
        return cachedCluster.clusterId;
      }
      
      // Normalize preference values for clustering
      const normalizedPreferences = this.normalizePreferences(preferences);
      
      // Check if we have a fitted UMAP model and centroids
      if (!this.fittedUMAP || !this.clusterCentroids) {
        console.log('[Modern Clusters] No fitted model found, generating clusters...');
        await this.generateClusters();
      }
      
      // Convert preferences to feature vector
      const featureVector = this.preferencesToVector(normalizedPreferences);
      
      // Normalize using stored statistics
      const normalizedVector = this.normalizeVector(featureVector);
      
      // Transform using fitted UMAP
      const reducedVector = this.fittedUMAP.transform([normalizedVector]);
      
      // Find nearest cluster
      const clusterIndex = this.findNearestCluster(reducedVector[0], this.clusterCentroids);
      
      // Get cluster ID from database
      const { data: clusters, error } = await this.supabase
        .from('user_clusters')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(this.numClusters);
      
      if (error || !clusters || clusters.length <= clusterIndex) {
        console.error('Error getting cluster ID:', error);
        return this.createDefaultCluster();
      }
      
      const clusterId = clusters[clusterIndex].id;
      
      // Calculate similarity score (inverse of distance)
      const distance = Math.sqrt(
        this.clusterCentroids[clusterIndex].reduce((sum, val, j) => 
          sum + Math.pow(val - reducedVector[0][j], 2), 0)
      );
      const similarity = 1 / (1 + distance); // Convert distance to similarity
      
      // Update user's cluster assignment
      await this.updateUserClusterAssignment(userId, clusterId, similarity, normalizedPreferences);
      
      return clusterId;
      
    } catch (error) {
      console.error('Error assigning user to cluster:', error);
      
      // As a fallback, return a generic cluster ID
      return 'default_cluster';
    }
  }

  /**
   * Save clusters to database
   * @param {Array<Array>} centroids - Cluster centroids in reduced space
   * @param {Array} assignments - Cluster assignments for each user
   * @param {Array<Array>} reducedVectors - All reduced vectors for visualization
   * @returns {Promise<Array>} - Array of cluster IDs
   */
  async saveClustersToDB(centroids, assignments, reducedVectors) {
    try {
      // Clear existing clusters
      await this.supabase.from('user_clusters').delete().neq('id', '');
      
      // Count members per cluster
      const memberCounts = new Array(centroids.length).fill(0);
      assignments.forEach(cluster => memberCounts[cluster]++);
      
      // Calculate cluster statistics for visualization
      const clusterStats = centroids.map((centroid, index) => {
        const clusterPoints = reducedVectors.filter((_, i) => assignments[i] === index);
        
        // Calculate cluster spread (average distance from centroid)
        const avgDistance = clusterPoints.length > 0 ? 
          clusterPoints.reduce((sum, point) => {
            const dist = Math.sqrt(point.reduce((s, v, j) => s + Math.pow(v - centroid[j], 2), 0));
            return sum + dist;
          }, 0) / clusterPoints.length : 0;
        
        return {
          centroid,
          member_count: memberCounts[index],
          avg_distance: avgDistance,
          visualization_data: {
            centroid_2d: centroid,
            member_points: clusterPoints
          }
        };
      });
      
      // Insert new clusters
      const clusterPromises = clusterStats.map((stats, index) => {
        return this.supabase
          .from('user_clusters')
          .insert([
            {
              centroid: stats.visualization_data, // Store visualization data as centroid
              member_count: stats.member_count,
              metadata: {
                creation_method: 'umap_kmeans',
                algorithm: 'UMAP + K-Means',
                umap_config: this.umapConfig,
                kmeans_config: this.kmeansConfig,
                cluster_index: index,
                avg_distance: stats.avg_distance,
                timestamp: new Date().toISOString()
              }
            }
          ])
          .select();
      });
      
      const results = await Promise.all(clusterPromises);
      
      // Extract cluster IDs
      const clusterIds = results.map(result => {
        if (result.error) {
          console.error('Error saving cluster:', result.error);
          return null;
        }
        return result.data[0].id;
      }).filter(id => id !== null);
      
      console.log(`[Modern Clusters] Saved ${clusterIds.length} clusters to database`);
      
      return clusterIds;
      
    } catch (error) {
      console.error('Error saving clusters to DB:', error);
      return [];
    }
  }

  /**
   * Update user assignments after clustering
   * @param {Array} userAssignments - User assignment records
   * @param {Array} clusterAssignments - Cluster assignments
   * @param {Array} clusterIds - Cluster IDs
   * @returns {Promise<boolean>} - Success status
   */
  async updateUserAssignmentsAfterClustering(userAssignments, clusterAssignments, clusterIds) {
    try {
      const updatePromises = [];
      
      for (let i = 0; i < userAssignments.length && i < clusterAssignments.length; i++) {
        const userId = userAssignments[i].user_id;
        const clusterIndex = clusterAssignments[i];
        
        if (clusterIndex < clusterIds.length) {
          const clusterId = clusterIds[clusterIndex];
          
          // Update cache
          this.userClusters.set(userId, {
            clusterId: clusterId,
            similarity: 1.0, // Assume perfect match from clustering
            timestamp: Date.now()
          });
          
          // Queue database update
          updatePromises.push(
            this.supabase
              .from('user_cluster_assignments')
              .update({
                cluster_id: clusterId,
                similarity: 1.0,
                last_updated: new Date().toISOString()
              })
              .eq('user_id', userId)
          );
        }
      }
      
      // Execute updates in batches of 50
      const batchSize = 50;
      for (let i = 0; i < updatePromises.length; i += batchSize) {
        const batch = updatePromises.slice(i, i + batchSize);
        await Promise.all(batch);
      }
      
      return true;
    } catch (error) {
      console.error('Error updating user assignments after clustering:', error);
      return false;
    }
  }

  /**
   * Update a user's cluster assignment
   * @param {string} userId - The user's ID
   * @param {string} clusterId - The cluster ID
   * @param {number} similarity - Similarity score
   * @param {Object} preferences - The user's normalized preferences
   * @returns {Promise<boolean>} - Success status
   */
  async updateUserClusterAssignment(userId, clusterId, similarity, preferences) {
    try {
      // Special handling for default_cluster which isn't a real UUID
      if (clusterId === 'default_cluster') {
        // Try to get a real cluster instead
        const { data: clusters } = await this.supabase
          .from('user_clusters')
          .select('id')
          .limit(1);
          
        if (clusters && clusters.length > 0) {
          clusterId = clusters[0].id;
        } else {
          // Create a real cluster if none exists
          const { data: newCluster } = await this.supabase
            .from('user_clusters')
            .insert([{
              centroid: { visualization_data: { centroid_2d: [0, 0], member_points: [] } },
              member_count: 1,
              metadata: { creation_method: 'fallback_creation', algorithm: 'UMAP + K-Means' }
            }])
            .select();
            
          if (newCluster && newCluster.length > 0) {
            clusterId = newCluster[0].id;
          } else {
            console.error('Failed to create or find a valid cluster');
            return false;
          }
        }
      }
    
      // Check if assignment already exists
      const { data: existing, error: checkError } = await this.supabase
        .from('user_cluster_assignments')
        .select('*')
        .eq('user_id', userId)
        .limit(1);
      
      if (checkError) {
        console.error('Error checking assignment:', checkError);
        return false;
      }
      
      if (existing && existing.length > 0) {
        // Update existing assignment
        const { error: updateError } = await this.supabase
          .from('user_cluster_assignments')
          .update({
            cluster_id: clusterId,
            similarity: similarity,
            preferences: preferences,
            last_updated: new Date().toISOString()
          })
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('Error updating assignment:', updateError);
          return false;
        }
      } else {
        // Create new assignment
        const { error: insertError } = await this.supabase
          .from('user_cluster_assignments')
          .insert([
            {
              user_id: userId,
              cluster_id: clusterId,
              similarity: similarity,
              preferences: preferences
            }
          ]);
        
        if (insertError) {
          console.error('Error inserting assignment:', insertError);
          return false;
        }
      }
      
      // Update cache
      this.userClusters.set(userId, {
        clusterId: clusterId,
        similarity: similarity,
        timestamp: Date.now()
      });
      
      // Update aggregated cluster prompt asynchronously (non-blocking)
      this.updateClusterPrompt(clusterId).catch((err) => {
        console.error('Failed to refresh cluster prompt', err);
      });
      
      return true;
    } catch (error) {
      console.error('Error updating user cluster assignment:', error);
      return false;
    }
  }

  /**
   * Create a default cluster (fallback method)
   * @returns {Promise<string>} - The default cluster ID
   */
  async createDefaultCluster() {
    try {
      // Check if default cluster already exists
      const { data: existing, error: checkError } = await this.supabase
        .from('user_clusters')
        .select('id')
        .eq('metadata->>creation_method', 'default')
        .limit(1);
      
      if (checkError) {
        console.error('Error checking for default cluster:', checkError);
        
        // Try getting any cluster as a fallback
        const { data: anyClusters } = await this.supabase
          .from('user_clusters')
          .select('id')
          .limit(1);
          
        if (anyClusters && anyClusters.length > 0) {
          return anyClusters[0].id;
        }
        
        return 'default_cluster';
      }
      
      if (existing && existing.length > 0) {
        return existing[0].id;
      }
      
      // Create default cluster with balanced preferences
      const defaultVisualizationData = {
        centroid_2d: [0, 0],
        member_points: []
      };
      
      const { data, error } = await this.supabase
        .from('user_clusters')
        .insert([
          {
            centroid: defaultVisualizationData,
            member_count: 1,
            metadata: {
              creation_method: 'default',
              algorithm: 'UMAP + K-Means',
              description: 'Default fallback cluster'
            }
          }
        ])
        .select();
      
      if (error) {
        console.error('Error inserting default cluster:', error);
        return 'default_cluster';
      }
      
      if (data && data.length > 0) {
        console.log(`[Modern Clusters] Created default cluster ${data[0].id}`);
        return data[0].id;
      } else {
        return 'default_cluster';
      }
    } catch (error) {
      console.error('Error creating default cluster:', error);
      
      // Generate a static ID as absolute fallback
      return 'default_cluster';
    }
  }

  /**
   * Get recommended templates for a user based on their cluster
   * @param {string} userId - The user's ID
   * @param {string} topic - The topic category
   * @returns {Promise<Array>} - Array of recommended templates
   */
  async getRecommendedTemplates(userId, topic) {
    try {
      // Get user's cluster
      const { data: userAssignment, error: userError } = await this.supabase
        .from('user_cluster_assignments')
        .select('cluster_id')
        .eq('user_id', userId)
        .single();
      
      if (userError) throw userError;
      
      if (!userAssignment) {
        console.log(`[Modern Clusters] No cluster assignment found for user ${userId}`);
        return [];
      }
      
      const clusterId = userAssignment.cluster_id;
      
      // Get other users in the same cluster
      const { data: clusterMembers, error: memberError } = await this.supabase
        .from('user_cluster_assignments')
        .select('user_id')
        .eq('cluster_id', clusterId)
        .neq('user_id', userId)
        .limit(50);
      
      if (memberError) throw memberError;
      
      if (!clusterMembers || clusterMembers.length === 0) {
        console.log(`[Modern Clusters] No other members found in cluster ${clusterId}`);
        return [];
      }
      
      // Get template usage with high ratings from cluster members
      const memberIds = clusterMembers.map(member => member.user_id);
      
      const { data: templateUsage, error: usageError } = await this.supabase
        .from('prompt_template_usage')
        .select('template_id, feedback_score')
        .in('user_id', memberIds)
        .gte('feedback_score', 4) // Only consider high ratings
        .order('feedback_score', { ascending: false });
      
      if (usageError) throw usageError;
      
      if (!templateUsage || templateUsage.length === 0) {
        console.log(`[Modern Clusters] No highly-rated templates found for cluster ${clusterId}`);
        return [];
      }
      
      // Count template frequencies and average ratings
      const templateStats = {};
      
      templateUsage.forEach(usage => {
        if (!templateStats[usage.template_id]) {
          templateStats[usage.template_id] = {
            count: 0,
            totalRating: 0
          };
        }
        
        templateStats[usage.template_id].count++;
        templateStats[usage.template_id].totalRating += usage.feedback_score;
      });
      
      // Calculate average ratings and sort by popularity and rating
      const rankedTemplates = Object.keys(templateStats).map(templateId => {
        const stats = templateStats[templateId];
        return {
          templateId,
          count: stats.count,
          averageRating: stats.totalRating / stats.count
        };
      });
      
      // Sort by count (desc) and then average rating (desc)
      rankedTemplates.sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return b.averageRating - a.averageRating;
      });
      
      // Get top 5 template IDs
      const topTemplateIds = rankedTemplates.slice(0, 5).map(t => t.templateId);
      
      // Get full template data
      const { data: templates, error: templateError } = await this.supabase
        .from('prompt_templates')
        .select('*')
        .in('id', topTemplateIds)
        .eq('topic', topic); // Filter by topic
      
      if (templateError) throw templateError;
      
      if (!templates || templates.length === 0) {
        // No matching templates for this topic
        return [];
      }
      
      // Sort templates according to original ranking
      return templates.sort((a, b) => {
        const aIndex = topTemplateIds.indexOf(a.id);
        const bIndex = topTemplateIds.indexOf(b.id);
        return aIndex - bIndex;
      });
    } catch (error) {
      console.error('Error getting recommended templates:', error);
      return [];
    }
  }

  /**
   * Aggregate an array of preference objects into averaged values.
   * @param {Array<Object>} prefsArray - Array of normalized preference objects
   * @returns {Object} - Aggregated (averaged) preference object
   */
  aggregatePreferences(prefsArray) {
    const aggregate = {};
    if (!prefsArray || prefsArray.length === 0) return aggregate;

    for (const prefs of prefsArray) {
      for (const [key, value] of Object.entries(prefs)) {
        if (typeof value === 'number') {
          aggregate[key] = (aggregate[key] || 0) + value;
        } else if (typeof value === 'object' && value !== null) {
          aggregate[key] = aggregate[key] || {};
          for (const [subKey, subVal] of Object.entries(value)) {
            if (typeof subVal === 'number') {
              aggregate[key][subKey] = (aggregate[key][subKey] || 0) + subVal;
            }
          }
        }
      }
    }

    // Convert sums to averages
    const count = prefsArray.length;
    for (const [key, value] of Object.entries(aggregate)) {
      if (typeof value === 'number') {
        aggregate[key] = value / count;
      } else if (typeof value === 'object' && value !== null) {
        for (const [subKey, subVal] of Object.entries(value)) {
          aggregate[key][subKey] = subVal / count;
        }
      }
    }

    return aggregate;
  }

  /**
   * Build a natural language prompt string describing aggregated cluster preferences.
   * @param {Object} agg - Aggregated preference object
   * @returns {string} - Prompt string to prepend to user queries for this cluster
   */
  buildClusterPrompt(agg) {
    try {
      if (!agg || Object.keys(agg).length === 0) return '';

      const percent = (val) => `${Math.round(val * 100)}/100`;

      // Determine dominant learning style(s)
      let dominantStyles = [];
      if (agg.learning_style_weights) {
        const maxVal = Math.max(...Object.values(agg.learning_style_weights));
        dominantStyles = Object.keys(agg.learning_style_weights)
          .filter((k) => agg.learning_style_weights[k] === maxVal);
      }

      // Determine top 3 interest areas
      let topInterests = [];
      if (agg.interest_weights) {
        topInterests = Object.entries(agg.interest_weights)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k);
      }

      return `The following aggregate preferences have been identified for this cohort of users (UMAP + K-Means clustering):\n` +
        `- Technical depth preference: ${percent(agg.technical_depth || 0.5)}\n` +
        `- Visual learning preference: ${percent(agg.visual_learning || 0.5)}\n` +
        `- Practical examples preference: ${percent(agg.practical_examples || 0.5)}\n` +
        `${dominantStyles.length > 0 ? `- Dominant learning style(s): ${dominantStyles.join(', ')}\n` : ''}` +
        `${topInterests.length > 0 ? `- Top interest domains: ${topInterests.join(', ')}\n` : ''}` +
        `When answering questions for a user in this cluster you MUST adapt to these collective preferences, ` +
        `maintain the specified technical depth, use the dominant learning style(s), and incorporate examples or analogies ` +
        `rooted in the top interest domains whenever relevant.`;
    } catch (error) {
      console.error('Error building cluster prompt:', error);
      return '';
    }
  }

  /**
   * Recalculate and persist the cluster-level prompt for a given cluster.
   * @param {string} clusterId - Cluster UUID
   * @returns {Promise<boolean>} - Success status
   */
  async updateClusterPrompt(clusterId) {
    try {
      if (!clusterId) return false;

      // Fetch up to first 1000 member preferences (enough for a reliable average)
      const { data: assignments, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('preferences')
        .eq('cluster_id', clusterId)
        .limit(1000);

      if (error) throw error;
      if (!assignments || assignments.length === 0) return false;

      const aggregated = this.aggregatePreferences(assignments.map((a) => a.preferences));
      const prompt = this.buildClusterPrompt(aggregated);

      // Retrieve current metadata so we don't overwrite unrelated fields
      const { data: clusterRow, error: clusterError } = await this.supabase
        .from('user_clusters')
        .select('metadata')
        .eq('id', clusterId)
        .single();
      if (clusterError) throw clusterError;

      const newMetadata = {
        ...(clusterRow?.metadata || {}),
        aggregated_preferences: aggregated,
        cluster_prompt: prompt
      };

      const { error: updateError } = await this.supabase
        .from('user_clusters')
        .update({ metadata: newMetadata })
        .eq('id', clusterId);
      if (updateError) throw updateError;

      // Update cache
      this.clusterPrompts.set(clusterId, {
        prompt,
        timestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error('Error updating cluster prompt:', error);
      return false;
    }
  }

  /**
   * Convenience method to fetch the cluster prompt for a user (with caching)
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} - Cluster prompt string or null if none
   */
  async getClusterPromptForUser(userId) {
    try {
      if (!userId) return null;

      // Get assignment first
      const { data: assignment, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('cluster_id')
        .eq('user_id', userId)
        .single();

      if (error || !assignment) return null;

      const clusterId = assignment.cluster_id;
      // Check cache (valid for 1 hour)
      const cached = this.clusterPrompts.get(clusterId);
      if (cached && cached.timestamp > Date.now() - 3600000) {
        return cached.prompt;
      }

      // Fetch from DB
      const { data: clusterRow, error: clusterError } = await this.supabase
        .from('user_clusters')
        .select('metadata')
        .eq('id', clusterId)
        .single();
      if (clusterError || !clusterRow) return null;

      const prompt = clusterRow.metadata?.cluster_prompt || null;
      if (prompt) {
        this.clusterPrompts.set(clusterId, {
          prompt,
          timestamp: Date.now()
        });
      }
      return prompt;
    } catch (error) {
      console.error('Error getting cluster prompt for user:', error);
      return null;
    }
  }

  /**
   * Get cluster visualization data for admin dashboards
   * @returns {Promise<Object>} - Visualization data
   */
  async getClusterVisualizationData() {
    try {
      const { data: clusters, error } = await this.supabase
        .from('user_clusters')
        .select('*')
        .eq('metadata->>algorithm', 'UMAP + K-Means');

      if (error) throw error;

      const visualizationData = {
        clusters: clusters.map(cluster => ({
          id: cluster.id,
          centroid: cluster.centroid?.centroid_2d || [0, 0],
          memberCount: cluster.member_count,
          avgDistance: cluster.metadata?.avg_distance || 0,
          algorithm: cluster.metadata?.algorithm || 'UMAP + K-Means',
          createdAt: cluster.created_at
        })),
        totalUsers: clusters.reduce((sum, cluster) => sum + cluster.member_count, 0),
        algorithmInfo: {
          name: 'UMAP + K-Means',
          umapConfig: this.umapConfig,
          kmeansConfig: this.kmeansConfig
        }
      };

      return visualizationData;
    } catch (error) {
      console.error('Error getting cluster visualization data:', error);
      return null;
    }
  }

  /**
   * Recalculate clusters based on updated user activity and feedback data
   * @param {Object} options - Configuration options
   * @param {Array} options.users - Optional array of specific users to include
   * @param {number} options.numClusters - Number of clusters to generate (default: 5)
   * @param {boolean} options.includeRecentActivity - Include recent session activity (default: true)
   * @param {boolean} options.includeFeedback - Include feedback data in clustering (default: true)
   * @returns {Promise<Object>} - Clustering results with stats
   */
  async recalculateClusters(options = {}) {
    const {
      users = null,
      numClusters = 5,
      includeRecentActivity = true,
      includeFeedback = true
    } = options;

    console.log('[Recalculate Clusters] Starting cluster recalculation...');
    console.log(`[Recalculate Clusters] Target clusters: ${numClusters}, Include activity: ${includeRecentActivity}, Include feedback: ${includeFeedback}`);

    try {
      // Step 1: Get updated user data from sessions and feedback
      const updatedUserData = await this.gatherUpdatedUserActivity({
        users,
        includeRecentActivity,
        includeFeedback
      });

      if (updatedUserData.length < numClusters * 2) {
        console.log(`[Recalculate Clusters] Insufficient users (${updatedUserData.length}) for ${numClusters} clusters`);
        return {
          success: false,
          error: 'Insufficient user data for clustering',
          userCount: updatedUserData.length,
          requiredCount: numClusters * 2
        };
      }

      // Step 2: Extract enhanced preference vectors
      const preferenceVectors = updatedUserData.map(userData => 
        this.generateEnhancedPreferenceVector(userData)
      ).filter(vector => vector && vector.length > 0); // Filter out invalid vectors

      if (preferenceVectors.length === 0) {
        console.log('[Recalculate Clusters] No valid preference vectors found');
        return {
          success: false,
          error: 'No valid preference vectors found',
          userCount: updatedUserData.length
        };
      }

      // Step 3: Normalize vectors
      const { vectors: normalizedVectors, stats } = this.normalizeVectors(preferenceVectors);
      this.featureStats = stats;

      // Step 4: Apply UMAP for dimensionality reduction
      console.log('[Recalculate Clusters] Applying UMAP dimensionality reduction...');
      const umap = new UMAP(this.umapConfig);
      const reducedVectors = umap.fit(normalizedVectors);
      
      // Store fitted model for future user assignments
      this.fittedUMAP = umap;

      // Step 5: Apply K-Means clustering
      console.log('[Recalculate Clusters] Applying K-Means clustering...');
      const kmeans = mlKmeans.kmeans(reducedVectors, numClusters, this.kmeansConfig);
      
      // Step 6: Save new clusters to database
      const clusterIds = await this.saveClustersToDB(
        kmeans.centroids,
        kmeans.clusters,
        reducedVectors
      );

      // Step 7: Update user assignments
      await this.updateUserAssignmentsAfterReclustering(
        updatedUserData,
        kmeans.clusters,
        clusterIds
      );

      // Step 8: Update cluster prompts
      console.log('[Recalculate Clusters] Updating cluster prompts...');
      for (const clusterId of clusterIds) {
        this.updateClusterPrompt(clusterId).catch(err => 
          console.error(`Error updating prompt for cluster ${clusterId}:`, err)
        );
      }

      const results = {
        success: true,
        timestamp: new Date().toISOString(),
        clustersGenerated: clusterIds.length,
        usersProcessed: updatedUserData.length,
        clusterIds,
        clusteringStats: {
          averageClusterSize: Math.floor(updatedUserData.length / clusterIds.length),
          featureCount: preferenceVectors[0].length,
          umapComponents: this.umapConfig.nComponents,
          kmeansIterations: kmeans.iterations || 'converged'
        }
      };

      console.log('[Recalculate Clusters] Cluster recalculation completed successfully');
      console.log(`[Recalculate Clusters] Generated ${clusterIds.length} clusters for ${updatedUserData.length} users`);

      return results;

    } catch (error) {
      console.error('[Recalculate Clusters] Error during cluster recalculation:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Gather updated user activity data from sessions and feedback
   * @param {Object} options - Gathering options
   * @returns {Promise<Array>} - Array of user data with preferences and activity
   */
  async gatherUpdatedUserActivity(options = {}) {
    const { users, includeRecentActivity, includeFeedback } = options;
    
    console.log('[Gather User Activity] Collecting user activity data...');

    try {
      // Get base user assignments (existing preferences)
      let userQuery = this.supabase
        .from('user_cluster_assignments')
        .select('user_id, preferences, cluster_id, similarity, last_updated')
        .order('last_updated', { ascending: false });

      if (users && users.length > 0) {
        userQuery = userQuery.in('user_id', users);
      }

      const { data: userAssignments, error: assignmentError } = await userQuery.limit(1000);
      
      if (assignmentError) throw assignmentError;

      if (!userAssignments || userAssignments.length === 0) {
        console.log('[Gather User Activity] No user assignments found');
        return [];
      }

      console.log(`[Gather User Activity] Found ${userAssignments.length} user assignments`);

      // Enhance with recent session activity
      const enhancedUserData = await Promise.all(
        userAssignments.map(async (assignment) => {
          const userData = { ...assignment };

          if (includeRecentActivity) {
            userData.recentActivity = await this.getRecentUserActivity(assignment.user_id);
          }

          if (includeFeedback) {
            userData.feedbackData = await this.getUserFeedbackData(assignment.user_id);
          }

          return userData;
        })
      );

      console.log(`[Gather User Activity] Enhanced ${enhancedUserData.length} user records with activity data`);
      return enhancedUserData;

    } catch (error) {
      console.error('[Gather User Activity] Error gathering user activity:', error);
      throw error;
    }
  }

  /**
   * Get recent user activity from sessions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Recent activity data
   */
  async getRecentUserActivity(userId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get recent sessions with topics
      const { data: sessions, error } = await this.supabase
        .from('sessions')
        .select('id, secret_topic, created_at, user_id')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn(`[Recent Activity] Error fetching sessions for user ${userId}:`, error);
        return { sessions: [], topicFrequency: {}, activityLevel: 0 };
      }

      // Calculate topic frequency
      const topicFrequency = {};
      (sessions || []).forEach(session => {
        if (session.secret_topic) {
          topicFrequency[session.secret_topic] = (topicFrequency[session.secret_topic] || 0) + 1;
        }
      });

      return {
        sessions: sessions || [],
        sessionCount: (sessions || []).length,
        topicFrequency,
        activityLevel: Math.min(1, (sessions || []).length / 10), // Normalized activity level
        mostFrequentTopic: Object.keys(topicFrequency).reduce((a, b) => 
          topicFrequency[a] > topicFrequency[b] ? a : b, null)
      };

    } catch (error) {
      console.warn(`[Recent Activity] Error processing activity for user ${userId}:`, error);
      return { sessions: [], topicFrequency: {}, activityLevel: 0 };
    }
  }

  /**
   * Get user feedback data for clustering enhancement
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - User feedback patterns
   */
  async getUserFeedbackData(userId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Try to get feedback data (table might not exist in all deployments)
      const { data: feedback, error } = await this.supabase
        .from('feedback')
        .select('rating, feedback_type, query_text, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        // Table might not exist, return default values
        console.warn(`[Feedback Data] Feedback table not accessible for user ${userId}:`, error.message);
        return { averageRating: 3.5, feedbackCount: 0, preferenceAdjustments: {} };
      }

      if (!feedback || feedback.length === 0) {
        return { averageRating: 3.5, feedbackCount: 0, preferenceAdjustments: {} };
      }

      // Calculate feedback patterns
      const ratings = feedback.map(f => f.rating).filter(r => r && r > 0);
      const averageRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
        : 3.5;

      // Extract preference adjustments from feedback patterns
      const preferenceAdjustments = this.extractPreferenceAdjustments(feedback);

      return {
        averageRating,
        feedbackCount: feedback.length,
        preferenceAdjustments,
        recentRatingTrend: this.calculateRatingTrend(feedback)
      };

    } catch (error) {
      console.warn(`[Feedback Data] Error processing feedback for user ${userId}:`, error);
      return { averageRating: 3.5, feedbackCount: 0, preferenceAdjustments: {} };
    }
  }

  /**
   * Extract preference adjustments from feedback patterns
   * @param {Array} feedbackData - User feedback data
   * @returns {Object} - Preference adjustments
   */
  extractPreferenceAdjustments(feedbackData) {
    const adjustments = {
      technical_depth: 0,
      visual_learning: 0,
      practical_examples: 0
    };

    feedbackData.forEach(feedback => {
      // Analyze feedback text for preference indicators
      const text = (feedback.query_text || '').toLowerCase();
      
      // Technical depth adjustments
      if (text.includes('too technical') || text.includes('too complex')) {
        adjustments.technical_depth -= 0.1;
      } else if (text.includes('more detail') || text.includes('deeper')) {
        adjustments.technical_depth += 0.1;
      }

      // Visual learning adjustments
      if (text.includes('visual') || text.includes('diagram') || text.includes('chart')) {
        adjustments.visual_learning += 0.1;
      }

      // Practical examples adjustments
      if (text.includes('example') || text.includes('practical') || text.includes('real world')) {
        adjustments.practical_examples += 0.1;
      }
    });

    // Normalize adjustments
    Object.keys(adjustments).forEach(key => {
      adjustments[key] = Math.max(-0.5, Math.min(0.5, adjustments[key]));
    });

    return adjustments;
  }

  /**
   * Calculate rating trend from recent feedback
   * @param {Array} feedbackData - User feedback data
   * @returns {string} - Trend direction
   */
  calculateRatingTrend(feedbackData) {
    if (feedbackData.length < 3) return 'stable';

    const recentRatings = feedbackData
      .slice(0, 5)
      .map(f => f.rating)
      .filter(r => r && r > 0);

    if (recentRatings.length < 2) return 'stable';

    const avgRecent = recentRatings.reduce((sum, r) => sum + r, 0) / recentRatings.length;
    const avgOlder = feedbackData
      .slice(5, 10)
      .map(f => f.rating)
      .filter(r => r && r > 0)
      .reduce((sum, r, _, arr) => sum + (r / arr.length), 0) || avgRecent;

    if (avgRecent > avgOlder + 0.3) return 'improving';
    if (avgRecent < avgOlder - 0.3) return 'declining';
    return 'stable';
  }

  /**
   * Generate enhanced preference vector incorporating activity and feedback
   * @param {Object} userData - User data with preferences, activity, and feedback
   * @returns {Array} - Enhanced feature vector
   */
  generateEnhancedPreferenceVector(userData) {
    // Validate input data
    if (!userData) {
      console.warn('[Enhanced Vector] No user data provided, using defaults');
      return this.preferencesToVector({});
    }
    
    // Start with base preferences
    const baseVector = this.preferencesToVector(userData.preferences || {});

    // Apply feedback-based adjustments if available
    if (userData.feedbackData && userData.feedbackData.preferenceAdjustments) {
      const adjustments = userData.feedbackData.preferenceAdjustments;
      
      // Apply adjustments to first three features (technical_depth, visual_learning, practical_examples)
      if (adjustments.technical_depth) baseVector[0] += adjustments.technical_depth;
      if (adjustments.visual_learning) baseVector[1] += adjustments.visual_learning;
      if (adjustments.practical_examples) baseVector[2] += adjustments.practical_examples;
    }

    // Add activity-based features
    const activityFeatures = [];
    
    if (userData.recentActivity) {
      const activity = userData.recentActivity;
      
      // Activity level (normalized)
      activityFeatures.push(activity.activityLevel || 0);
      
      // Topic diversity (number of different topics / total sessions)
      const topicDiversity = activity.sessionCount > 0 
        ? Object.keys(activity.topicFrequency).length / activity.sessionCount 
        : 0;
      activityFeatures.push(Math.min(1, topicDiversity));
      
      // Dominant topic strength (max topic frequency / total sessions)
      const dominantTopicStrength = activity.sessionCount > 0 && activity.mostFrequentTopic
        ? activity.topicFrequency[activity.mostFrequentTopic] / activity.sessionCount
        : 0;
      activityFeatures.push(dominantTopicStrength);
    } else {
      // Default activity features
      activityFeatures.push(0.5, 0.5, 0.5);
    }

    // Add feedback quality features
    if (userData.feedbackData) {
      const feedback = userData.feedbackData;
      
      // Normalized average rating (0-1 scale)
      activityFeatures.push((feedback.averageRating - 1) / 4);
      
      // Feedback engagement (log normalized)
      const feedbackEngagement = Math.min(1, Math.log(feedback.feedbackCount + 1) / Math.log(100));
      activityFeatures.push(feedbackEngagement);
    } else {
      // Default feedback features
      activityFeatures.push(0.625, 0); // Default rating of 3.5/5 normalized
    }

    // Ensure all values are bounded [0, 1]
    const enhancedVector = [...baseVector, ...activityFeatures].map(val => 
      Math.max(0, Math.min(1, val))
    );

    return enhancedVector;
  }

  /**
   * Update user assignments after reclustering
   * @param {Array} userData - Enhanced user data
   * @param {Array} clusterAssignments - New cluster assignments
   * @param {Array} clusterIds - New cluster IDs
   * @returns {Promise<boolean>} - Success status
   */
  async updateUserAssignmentsAfterReclustering(userData, clusterAssignments, clusterIds) {
    try {
      console.log('[Update Assignments] Updating user cluster assignments after reclustering...');
      
      const updatePromises = [];
      
      for (let i = 0; i < userData.length && i < clusterAssignments.length; i++) {
        const user = userData[i];
        const clusterIndex = clusterAssignments[i];
        
        if (clusterIndex < clusterIds.length) {
          const clusterId = clusterIds[clusterIndex];
          
          // Calculate similarity score (simplified - could be enhanced)
          const similarity = 0.9; // Assume high similarity from clustering
          
          // Update cache
          this.userClusters.set(user.user_id, {
            clusterId: clusterId,
            similarity: similarity,
            timestamp: Date.now()
          });
          
          // Queue database update
          updatePromises.push(
            this.supabase
              .from('user_cluster_assignments')
              .update({
                cluster_id: clusterId,
                similarity: similarity,
                last_updated: new Date().toISOString()
              })
              .eq('user_id', user.user_id)
          );
        }
      }
      
      // Execute updates in batches
      const batchSize = 50;
      for (let i = 0; i < updatePromises.length; i += batchSize) {
        const batch = updatePromises.slice(i, i + batchSize);
        await Promise.all(batch);
      }
      
      console.log(`[Update Assignments] Updated ${updatePromises.length} user assignments`);
      return true;
      
    } catch (error) {
      console.error('[Update Assignments] Error updating user assignments after reclustering:', error);
      return false;
    }
  }
}

export default new ModernClusterManager(); 