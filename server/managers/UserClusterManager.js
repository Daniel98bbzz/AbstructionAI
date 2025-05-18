import { supabase } from '../lib/supabaseClient.js';

/**
 * Manages user clustering based on preferences and feedback
 * Enables collaborative filtering to enhance template selection
 */
class UserClusterManager {
  constructor() {
    // Connect to the database
    this.supabase = supabase;
    
    // In-memory cache of user clusters
    this.userClusters = new Map();
    
    // Default number of clusters to use
    this.numClusters = 5;
    
    // Default threshold for similarity
    this.similarityThreshold = 0.7;

    // Cache for cluster-level prompts so we don't hit the DB too often
    this.clusterPrompts = new Map();
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
        console.log(`[User Clusters] Using cached cluster ${cachedCluster.clusterId} for user ${userId}`);
        return cachedCluster.clusterId;
      }
      
      // Normalize preference values for clustering
      const normalizedPreferences = this.normalizePreferences(preferences);
      
      // Get the current clusters
      const { data: clusters, error } = await this.supabase
        .from('user_clusters')
        .select('*');
      
      if (error) {
        console.error('Error getting clusters:', error);
        // Try to create a default cluster
        const defaultClusterId = await this.createDefaultCluster();
        return defaultClusterId;
      }
      
      // If we have no clusters yet or need to refresh, generate them
      if (!clusters || clusters.length === 0) {
        console.log('[User Clusters] No clusters found, generating some clusters');
        const newClusterId = await this.generateClusters();
        
        // Assign user to a newly created cluster
        const { clusterId, similarity } = await this.findBestClusterMatch(normalizedPreferences);
        
        // Update user's cluster assignment
        await this.updateUserClusterAssignment(userId, clusterId, similarity, normalizedPreferences);
        
        // Return the cluster ID
        return clusterId;
      }
      
      // Find best cluster match
      const { clusterId, similarity } = await this.findBestClusterMatch(normalizedPreferences);
      
      // If similarity is too low, consider creating a new cluster
      if (similarity < this.similarityThreshold && clusters.length < 20) { // Limit to 20 clusters max
        console.log(`[User Clusters] Similarity ${similarity} below threshold, considering new cluster`);
        
        // Check if there are enough similar users to form a new cluster
        const similarUsers = await this.findSimilarUsers(normalizedPreferences);
        
        if (similarUsers.length >= 3) { // At least 3 users to form a new cluster
          const newClusterId = await this.createNewCluster(normalizedPreferences, similarUsers);
          
          // Update user assignments
          await this.updateUserClusterAssignment(userId, newClusterId, 1.0, normalizedPreferences);
          
          return newClusterId;
        }
      }
      
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
   * Normalize user preferences for consistent clustering
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
    
    // Interest categories (simplified to major categories)
    const interests = preferences.interests || [];
    normalized.interest_weights = {
      science: this.calculateInterestWeight(interests, ['Physics', 'Chemistry', 'Biology', 'Astronomy']),
      technology: this.calculateInterestWeight(interests, ['Programming', 'AI', 'Robotics', 'Computers']),
      engineering: this.calculateInterestWeight(interests, ['Mechanical', 'Electrical', 'Civil', 'Engineering']),
      math: this.calculateInterestWeight(interests, ['Mathematics', 'Statistics', 'Algebra', 'Calculus']),
      arts: this.calculateInterestWeight(interests, ['Art', 'Music', 'Literature', 'History']),
      // Add everyday interests categories
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
   * Calculate interest weight for a category
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
   * Find the best cluster match for a user's preferences
   * @param {Object} normalizedPreferences - The normalized user preferences
   * @returns {Promise<Object>} - The best matching cluster and similarity score
   */
  async findBestClusterMatch(normalizedPreferences) {
    try {
      // Get all clusters
      const { data: clusters, error } = await this.supabase
        .from('user_clusters')
        .select('*');
      
      if (error) throw error;
      
      // If no clusters, create first one
      if (!clusters || clusters.length === 0) {
        console.log('[User Clusters] No clusters found, creating first cluster');
        const firstClusterId = await this.createNewCluster(normalizedPreferences, []);
        return { clusterId: firstClusterId, similarity: 1.0 };
      }
      
      // Calculate similarity to each cluster
      let bestCluster = null;
      let highestSimilarity = -1;
      
      for (const cluster of clusters) {
        const similarity = this.calculateSimilarity(normalizedPreferences, cluster.centroid);
        
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestCluster = cluster;
        }
      }
      
      console.log(`[User Clusters] Best cluster match: ${bestCluster.id} with similarity ${highestSimilarity.toFixed(2)}`);
      return { clusterId: bestCluster.id, similarity: highestSimilarity };
    } catch (error) {
      console.error('Error finding best cluster match:', error);
      
      // Create default cluster as fallback
      const defaultClusterId = await this.createDefaultCluster();
      return { clusterId: defaultClusterId, similarity: 0.5 };
    }
  }
  
  /**
   * Calculate similarity between user preferences and cluster centroid
   * @param {Object} userPreferences - Normalized user preferences
   * @param {Object} clusterCentroid - Cluster centroid
   * @returns {number} - Similarity score between 0 and 1
   */
  calculateSimilarity(userPreferences, clusterCentroid) {
    // Calculate Euclidean distance for numerical preferences
    let numericDistance = 0;
    const numericFeatures = ['technical_depth', 'visual_learning', 'practical_examples'];
    
    for (const feature of numericFeatures) {
      const diff = (userPreferences[feature] || 0.5) - (clusterCentroid[feature] || 0.5);
      numericDistance += diff * diff;
    }
    
    numericDistance = Math.sqrt(numericDistance);
    
    // Calculate learning style similarity (cosine similarity)
    let learningStyleSimilarity = 0;
    if (userPreferences.learning_style_weights && clusterCentroid.learning_style_weights) {
      const userStyles = userPreferences.learning_style_weights;
      const clusterStyles = clusterCentroid.learning_style_weights;
      
      let dotProduct = 0;
      let userMagnitude = 0;
      let clusterMagnitude = 0;
      
      for (const style in userStyles) {
        dotProduct += (userStyles[style] || 0) * (clusterStyles[style] || 0);
        userMagnitude += (userStyles[style] || 0) * (userStyles[style] || 0);
        clusterMagnitude += (clusterStyles[style] || 0) * (clusterStyles[style] || 0);
      }
      
      userMagnitude = Math.sqrt(userMagnitude);
      clusterMagnitude = Math.sqrt(clusterMagnitude);
      
      if (userMagnitude > 0 && clusterMagnitude > 0) {
        learningStyleSimilarity = dotProduct / (userMagnitude * clusterMagnitude);
      }
    }
    
    // Calculate interest similarity (cosine similarity)
    let interestSimilarity = 0;
    if (userPreferences.interest_weights && clusterCentroid.interest_weights) {
      const userInterests = userPreferences.interest_weights;
      const clusterInterests = clusterCentroid.interest_weights;
      
      let dotProduct = 0;
      let userMagnitude = 0;
      let clusterMagnitude = 0;
      
      for (const interest in userInterests) {
        dotProduct += (userInterests[interest] || 0) * (clusterInterests[interest] || 0);
        userMagnitude += (userInterests[interest] || 0) * (userInterests[interest] || 0);
        clusterMagnitude += (clusterInterests[interest] || 0) * (clusterInterests[interest] || 0);
      }
      
      userMagnitude = Math.sqrt(userMagnitude);
      clusterMagnitude = Math.sqrt(clusterMagnitude);
      
      if (userMagnitude > 0 && clusterMagnitude > 0) {
        interestSimilarity = dotProduct / (userMagnitude * clusterMagnitude);
      }
    }
    
    // Calculate combined similarity score
    // Convert distance to similarity (inverse relationship)
    const maxDistance = Math.sqrt(numericFeatures.length); // Maximum possible distance
    const numericSimilarity = 1 - (numericDistance / maxDistance);
    
    // Weight the different similarity components
    const weights = {
      numeric: 0.5,
      learningStyle: 0.3,
      interests: 0.2
    };
    
    const totalSimilarity = 
      (numericSimilarity * weights.numeric) +
      (learningStyleSimilarity * weights.learningStyle) +
      (interestSimilarity * weights.interests);
    
    return totalSimilarity;
  }
  
  /**
   * Find users with similar preferences
   * @param {Object} normalizedPreferences - The normalized user preferences
   * @returns {Promise<Array>} - Array of similar user IDs
   */
  async findSimilarUsers(normalizedPreferences) {
    try {
      // Get all user preferences
      const { data: userPreferences, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('user_id, preferences')
        .order('last_updated', { ascending: false })
        .limit(100); // Consider most recent 100 users
      
      if (error) throw error;
      
      if (!userPreferences || userPreferences.length === 0) {
        return [];
      }
      
      // Calculate similarity for each user
      const similarUsers = [];
      
      for (const user of userPreferences) {
        const similarity = this.calculateSimilarity(normalizedPreferences, user.preferences);
        
        if (similarity >= this.similarityThreshold) {
          similarUsers.push({
            userId: user.user_id,
            similarity
          });
        }
      }
      
      // Sort by similarity (descending)
      similarUsers.sort((a, b) => b.similarity - a.similarity);
      
      return similarUsers.map(user => user.userId);
    } catch (error) {
      console.error('Error finding similar users:', error);
      return [];
    }
  }
  
  /**
   * Create a new cluster based on user preferences
   * @param {Object} initialPreferences - The initial centroid
   * @param {Array} similarUserIds - IDs of similar users to include
   * @returns {Promise<string>} - The new cluster ID
   */
  async createNewCluster(initialPreferences, similarUserIds) {
    try {
      // Insert new cluster record
      const { data, error } = await this.supabase
        .from('user_clusters')
        .insert([
          {
            centroid: initialPreferences,
            member_count: similarUserIds.length + 1,
            metadata: {
              creation_method: 'similarity_based',
              initial_members: similarUserIds
            }
          }
        ])
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`[User Clusters] Created new cluster ${data.id} with ${similarUserIds.length + 1} members`);
      
      return data.id;
    } catch (error) {
      console.error('Error creating new cluster:', error);
      
      // Create default cluster as fallback
      return this.createDefaultCluster();
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
      const defaultCentroid = {
        technical_depth: 0.5,
        visual_learning: 0.5,
        practical_examples: 0.5,
        learning_style_weights: {
          visual: 0.5,
          auditory: 0.5,
          reading: 0.5,
          kinesthetic: 0.5
        },
        interest_weights: {
          science: 0.5,
          technology: 0.5,
          engineering: 0.5,
          math: 0.5,
          arts: 0.5
        }
      };
      
      const { data, error } = await this.supabase
        .from('user_clusters')
        .insert([
          {
            centroid: defaultCentroid,
            member_count: 1,
            metadata: {
              creation_method: 'default',
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
        console.log(`[User Clusters] Created default cluster ${data[0].id}`);
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
              centroid: preferences,
              member_count: 1,
              metadata: { creation_method: 'fallback_creation' }
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
   * Generate clusters from all user preferences
   * Uses k-means clustering algorithm
   * @param {number} numClusters - Number of clusters to generate (default: 5)
   * @returns {Promise<string>} - ID of the first cluster
   */
  async generateClusters(numClusters = 5) {
    try {
      this.numClusters = numClusters;
      
      console.log(`[User Clusters] Generating ${numClusters} clusters from user preferences`);
      
      // Get all user preferences
      const { data: userAssignments, error } = await this.supabase
        .from('user_cluster_assignments')
        .select('user_id, preferences')
        .order('last_updated', { ascending: false })
        .limit(1000); // Consider up to 1000 most recent users
      
      if (error) throw error;
      
      if (!userAssignments || userAssignments.length < numClusters * 2) {
        console.log(`[User Clusters] Not enough users (${userAssignments?.length || 0}) for ${numClusters} clusters`);
        
        // Create default cluster instead
        return this.createDefaultCluster();
      }
      
      // Extract preferences for clustering
      const preferencesArray = userAssignments.map(user => user.preferences);
      
      // Initialize clusters with random centroids
      const initialCentroids = this.selectRandomCentroids(preferencesArray, numClusters);
      
      // Run k-means clustering
      const { centroids, assignments } = this.kMeansClustering(preferencesArray, initialCentroids);
      
      // Create cluster records in database
      const clusterIds = await this.saveClustersToDB(centroids, assignments);
      
      // Update user assignments
      await this.updateUserAssignmentsAfterClustering(userAssignments, assignments, clusterIds);
      
      console.log(`[User Clusters] Successfully generated ${clusterIds.length} clusters`);
      
      // Generate cluster prompts for each newly created cluster (fire & forget)
      clusterIds.forEach((cid) => {
        this.updateClusterPrompt(cid).catch((err) => {
          console.error(`Failed to create prompt for cluster ${cid}`, err);
        });
      });
      
      return clusterIds[0]; // Return first cluster ID
    } catch (error) {
      console.error('Error generating clusters:', error);
      
      // Create default cluster as fallback
      return this.createDefaultCluster();
    }
  }
  
  /**
   * Select random centroids from data points
   * @param {Array} dataPoints - Array of data points
   * @param {number} k - Number of centroids to select
   * @returns {Array} - Array of selected centroids
   */
  selectRandomCentroids(dataPoints, k) {
    const centroids = [];
    const dataPointsCopy = [...dataPoints];
    
    // Select k unique data points as initial centroids
    for (let i = 0; i < k && dataPointsCopy.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * dataPointsCopy.length);
      centroids.push(JSON.parse(JSON.stringify(dataPointsCopy[randomIndex])));
      dataPointsCopy.splice(randomIndex, 1);
    }
    
    return centroids;
  }
  
  /**
   * Run k-means clustering algorithm
   * @param {Array} dataPoints - Array of data points
   * @param {Array} initialCentroids - Initial centroid positions
   * @param {number} maxIterations - Maximum iterations (default: 10)
   * @returns {Object} - Centroids and assignments
   */
  kMeansClustering(dataPoints, initialCentroids, maxIterations = 10) {
    let centroids = initialCentroids;
    let assignments = new Array(dataPoints.length).fill(0);
    let iterations = 0;
    let changed = true;
    
    while (changed && iterations < maxIterations) {
      changed = false;
      
      // Assign each data point to nearest centroid
      for (let i = 0; i < dataPoints.length; i++) {
        const dataPoint = dataPoints[i];
        let minDistance = Infinity;
        let assignedCluster = 0;
        
        for (let j = 0; j < centroids.length; j++) {
          const similarity = this.calculateSimilarity(dataPoint, centroids[j]);
          const distance = 1 - similarity; // Convert similarity to distance
          
          if (distance < minDistance) {
            minDistance = distance;
            assignedCluster = j;
          }
        }
        
        if (assignments[i] !== assignedCluster) {
          assignments[i] = assignedCluster;
          changed = true;
        }
      }
      
      // Update centroids
      const newCentroids = new Array(centroids.length)
        .fill(null)
        .map(() => this.createEmptyCentroid());
      
      const counts = new Array(centroids.length).fill(0);
      
      for (let i = 0; i < dataPoints.length; i++) {
        const dataPoint = dataPoints[i];
        const cluster = assignments[i];
        
        counts[cluster]++;
        this.updateCentroidSum(newCentroids[cluster], dataPoint);
      }
      
      // Calculate average for each centroid
      for (let i = 0; i < newCentroids.length; i++) {
        if (counts[i] > 0) {
          this.averageCentroid(newCentroids[i], counts[i]);
        } else {
          // If no points assigned, keep old centroid
          newCentroids[i] = centroids[i];
        }
      }
      
      centroids = newCentroids;
      iterations++;
    }
    
    console.log(`[User Clusters] K-means completed in ${iterations} iterations`);
    
    return { centroids, assignments };
  }
  
  /**
   * Create an empty centroid for aggregation
   * @returns {Object} - Empty centroid
   */
  createEmptyCentroid() {
    return {
      technical_depth: 0,
      visual_learning: 0,
      practical_examples: 0,
      learning_style_weights: {
        visual: 0,
        auditory: 0,
        reading: 0,
        kinesthetic: 0
      },
      interest_weights: {
        science: 0,
        technology: 0,
        engineering: 0,
        math: 0,
        arts: 0
      }
    };
  }
  
  /**
   * Update a centroid sum with a data point
   * @param {Object} centroidSum - The centroid sum to update
   * @param {Object} dataPoint - The data point to add
   */
  updateCentroidSum(centroidSum, dataPoint) {
    // Update numeric features
    centroidSum.technical_depth += (dataPoint.technical_depth || 0.5);
    centroidSum.visual_learning += (dataPoint.visual_learning || 0.5);
    centroidSum.practical_examples += (dataPoint.practical_examples || 0.5);
    
    // Update learning style weights
    if (dataPoint.learning_style_weights) {
      for (const style in centroidSum.learning_style_weights) {
        centroidSum.learning_style_weights[style] += 
          (dataPoint.learning_style_weights[style] || 0);
      }
    }
    
    // Update interest weights
    if (dataPoint.interest_weights) {
      for (const interest in centroidSum.interest_weights) {
        centroidSum.interest_weights[interest] += 
          (dataPoint.interest_weights[interest] || 0);
      }
    }
  }
  
  /**
   * Average a centroid sum based on count
   * @param {Object} centroidSum - The centroid sum to average
   * @param {number} count - Number of data points
   */
  averageCentroid(centroidSum, count) {
    if (count === 0) return;
    
    // Average numeric features
    centroidSum.technical_depth /= count;
    centroidSum.visual_learning /= count;
    centroidSum.practical_examples /= count;
    
    // Average learning style weights
    for (const style in centroidSum.learning_style_weights) {
      centroidSum.learning_style_weights[style] /= count;
    }
    
    // Average interest weights
    for (const interest in centroidSum.interest_weights) {
      centroidSum.interest_weights[interest] /= count;
    }
  }
  
  /**
   * Save clusters to database
   * @param {Array} centroids - Cluster centroids
   * @param {Array} assignments - Data point assignments
   * @returns {Promise<Array>} - Array of cluster IDs
   */
  async saveClustersToDB(centroids, assignments) {
    try {
      // Clear existing clusters
      await this.supabase.from('user_clusters').delete().neq('id', '');
      
      // Count members per cluster
      const memberCounts = new Array(centroids.length).fill(0);
      assignments.forEach(cluster => memberCounts[cluster]++);
      
      // Insert new clusters
      const clusterPromises = centroids.map((centroid, index) => {
        return this.supabase
          .from('user_clusters')
          .insert([
            {
              centroid: centroid,
              member_count: memberCounts[index],
              metadata: {
                creation_method: 'k_means',
                algorithm_iterations: 10
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
        console.log(`[User Clusters] No cluster assignment found for user ${userId}`);
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
        console.log(`[User Clusters] No other members found in cluster ${clusterId}`);
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
        console.log(`[User Clusters] No highly-rated templates found for cluster ${clusterId}`);
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

      return `The following aggregate preferences have been identified for this cohort of users:\n` +
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
}

export default new UserClusterManager(); 