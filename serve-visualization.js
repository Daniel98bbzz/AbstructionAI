import express from 'express';
import { supabase } from './server/lib/supabaseClient.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3005;

// Middleware
app.use(express.static(__dirname));
app.use(express.json()); // Parse JSON request bodies

// API endpoint to get clusters
app.get('/api/clusters', async (req, res) => {
  try {
    console.log('Fetching clusters from database...');
    
    // Add query parameters for filtering
    const { min_members, sort_by } = req.query;
    
    let query = supabase
      .from('user_clusters')
      .select('*');
    
    // Filter by minimum member count if specified
    if (min_members && !isNaN(min_members)) {
      query = query.gte('member_count', parseInt(min_members));
    }
    
    // Sort by specified field or default to member_count
    const sortField = sort_by || 'member_count';
    query = query.order(sortField, { ascending: false });
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log(`Successfully fetched ${data.length} clusters`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch clusters', details: error.message });
  }
});

// API endpoint to get users with their cluster assignments
app.get('/api/clustered-users', async (req, res) => {
  try {
    console.log('Fetching clustered users from database...');
    
    // Add query parameters for filtering
    const { cluster_id, limit } = req.query;
    
    // Default to 100 users, but allow overriding
    const userLimit = limit && !isNaN(limit) ? parseInt(limit) : 100;
    
    let query = supabase
      .from('user_profiles')
      .select(`
        id, 
        username, 
        learning_style, 
        technical_depth, 
        cluster_id,
        interests,
        preferred_analogy_domains,
        age,
        education_level,
        occupation,
        main_learning_goal
      `)
      .not('cluster_id', 'is', null);
    
    // Filter by cluster if specified
    if (cluster_id) {
      query = query.eq('cluster_id', cluster_id);
    }
    
    // Apply limit
    query = query.limit(userLimit);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    console.log(`Successfully fetched ${data.length} clustered users`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching clustered users:', error);
    res.status(500).json({ error: 'Failed to fetch clustered users', details: error.message });
  }
});

// API endpoint to update user preferences and reassign cluster
app.post('/api/update-user-preferences', async (req, res) => {
  try {
    console.log('Updating user preferences...');
    const { user_id, technical_depth, learning_style, interests, preferred_analogy_domains } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Validate inputs
    if (technical_depth !== undefined && (isNaN(technical_depth) || technical_depth < 1 || technical_depth > 100)) {
      return res.status(400).json({ error: 'Technical depth must be a number between 1 and 100' });
    }
    
    if (learning_style && !['visual', 'auditory', 'reading', 'kinesthetic'].includes(learning_style)) {
      return res.status(400).json({ error: 'Invalid learning style' });
    }
    
    if (interests && !Array.isArray(interests)) {
      return res.status(400).json({ error: 'Interests must be an array' });
    }
    
    if (preferred_analogy_domains && !Array.isArray(preferred_analogy_domains)) {
      return res.status(400).json({ error: 'Preferred analogy domains must be an array' });
    }
    
    // First update the user profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        technical_depth,
        learning_style,
        interests,
        preferred_analogy_domains,
        updated_at: new Date().toISOString()
      })
      .eq('id', user_id);
    
    if (updateError) {
      throw updateError;
    }
    
    console.log(`Updated preferences for user ${user_id}`);
    
    // Then call the stored procedure to recalculate the user's cluster
    const { data, error } = await supabase.rpc('update_user_cluster_preferences', {
      user_id_param: user_id,
      technical_depth_param: technical_depth,
      learning_style_param: learning_style,
      interests_param: interests,
      analogy_domains_param: preferred_analogy_domains
    });
    
    if (error) throw error;
    
    console.log(`Reassigned user ${user_id} to cluster`);
    
    // Get the new cluster assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('user_cluster_assignments')
      .select('cluster_id, similarity')
      .eq('user_id', user_id)
      .single();
    
    if (assignmentError) throw assignmentError;
    
    res.json({
      success: true,
      message: `User has been ${data ? 'reassigned to a new cluster' : 'updated but cluster remains the same'}`,
      cluster_id: assignment?.cluster_id,
      similarity: assignment?.similarity
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update user preferences', details: error.message });
  }
});

// API endpoint to get user conversation feedback
app.get('/api/user-feedback/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Fetching conversation feedback for user ${userId}...`);
    
    // First check if there are any ratings in the database for diagnostic purposes
    const { data: ratingCheck, error: ratingCheckError } = await supabase
      .from('interactions')
      .select('id, rating')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .limit(5);
    
    console.log('Ratings in database check:', ratingCheck || 'None found');
    if (ratingCheckError) {
      console.log('Error checking ratings:', ratingCheckError);
    }

    // Check if the rating exists in the feedback table
    const { data: feedbackRatingCheck, error: feedbackRatingError } = await supabase
      .from('feedback')
      .select('id, rating')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .limit(5);
    
    console.log('Feedback ratings in database check:', feedbackRatingCheck || 'None found');
    if (feedbackRatingError) {
      console.log('Error checking feedback ratings:', feedbackRatingError);
    }
    
    // Fetch user conversation feedback from interactions table (preferred source)
    const { data: interactionData, error: interactionError } = await supabase
      .from('interactions')
      .select('id, query, response, rating, comments, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (interactionError) {
      console.error('Error fetching from interactions:', interactionError);
    } else if (interactionData && interactionData.length > 0) {
      console.log(`Found ${interactionData.length} interactions`);
      console.log('First interaction:', JSON.stringify(interactionData[0], null, 2));
    }
    
    // Get feedbacks as fallback
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('feedback')
      .select('id, query_text, response_text, rating, comments, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (feedbackError && !interactionData) {
      console.error('Error fetching from feedbacks:', feedbackError);
      throw feedbackError;
    } else if (feedbackData && feedbackData.length > 0) {
      console.log(`Found ${feedbackData.length} feedback records`);
      console.log('First feedback:', JSON.stringify(feedbackData[0], null, 2));
    }
    
    // Format the data for the frontend
    let formattedFeedback = [];
    
    // Helper function to try parsing a response if it's a JSON string
    const processResponse = (response) => {
      if (!response) return 'No response recorded';
      
      // If it's already an object, stringify it
      if (typeof response === 'object') {
        return JSON.stringify(response);
      }
      
      return response;
    };
    
    // Helper function to normalize ratings
    const normalizeRating = (rating) => {
      console.log('Normalizing rating:', rating, 'type:', typeof rating);
      
      // If rating is null, undefined, or NaN, return 0
      if (rating === null || rating === undefined) {
        console.log('Rating is null or undefined, returning 0');
        return 0;
      }
      
      // Convert to number if it's a string
      let numRating;
      if (typeof rating === 'string') {
        numRating = Number(rating);
        console.log('Converted string rating to number:', numRating);
      } else if (typeof rating === 'number') {
        numRating = rating;
        console.log('Rating is already a number:', numRating);
      } else {
        console.log('Unknown rating type, converting to 0');
        return 0;
      }
      
      // Check for NaN after conversion
      if (isNaN(numRating)) {
        console.log('Rating is NaN after conversion, returning 0');
        return 0;
      }
      
      // Ensure it's between 0 and 5
      return Math.min(5, Math.max(0, numRating));
    };
    
    // Helper function to try extracting rating from response if available
    const extractRatingFromResponse = (response) => {
      if (!response) return null;
      
      // If it's a string that looks like JSON, try to parse it
      if (typeof response === 'string' && 
          (response.startsWith('{') || response.startsWith('['))) {
        try {
          const parsed = JSON.parse(response);
          console.log('Successfully parsed response JSON');
          
          // Look for rating in common fields
          if (parsed.rating !== undefined) {
            console.log('Found rating in direct field:', parsed.rating);
            return parsed.rating;
          } else if (parsed.feedback && parsed.feedback.rating !== undefined) {
            console.log('Found rating in feedback.rating:', parsed.feedback.rating);
            return parsed.feedback.rating;
          }
          
          // Check if there's an object with a rating property at any level
          const findRating = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            
            if (obj.rating !== undefined) {
              console.log('Found nested rating:', obj.rating);
              return obj.rating;
            }
            
            for (const key in obj) {
              if (typeof obj[key] === 'object') {
                const nestedRating = findRating(obj[key]);
                if (nestedRating !== null) return nestedRating;
              }
            }
            
            return null;
          };
          
          return findRating(parsed);
        } catch (e) {
          console.log('Error parsing response as JSON:', e.message);
          // Parsing failed, return null
          return null;
        }
      }
      
      // If it's already an object, check if it has rating
      if (typeof response === 'object' && response !== null) {
        console.log('Response is already an object, checking for rating');
        if (response.rating !== undefined) {
          console.log('Found rating in response object:', response.rating);
          return response.rating;
        } else if (response.feedback && response.feedback.rating !== undefined) {
          console.log('Found rating in response.feedback:', response.feedback.rating);
          return response.feedback.rating;
        }
        
        // Deep search for rating in object
        const findRating = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          
          if (obj.rating !== undefined) {
            console.log('Found nested rating in object:', obj.rating);
            return obj.rating;
          }
          
          for (const key in obj) {
            if (typeof obj[key] === 'object') {
              const nestedRating = findRating(obj[key]);
              if (nestedRating !== null) return nestedRating;
            }
          }
          
          return null;
        };
        
        return findRating(response);
      }
      
      return null;
    };
    
    if (interactionData && interactionData.length > 0) {
      // Format interaction data
      formattedFeedback = interactionData.map(item => {
        // First check if rating exists directly
        let finalRating = item.rating;
        console.log(`Item ${item.id} direct rating:`, finalRating);
        
        // If no direct rating, try to extract from response
        if (finalRating === null || finalRating === undefined) {
          console.log(`Item ${item.id} has no direct rating, trying to extract from response`);
          finalRating = extractRatingFromResponse(item.response);
          console.log(`Item ${item.id} extracted rating:`, finalRating);
        }
        
        // Normalize the rating to a proper number
        const normalizedRating = normalizeRating(finalRating);
        console.log(`Item ${item.id} normalized rating:`, normalizedRating);
        
        return {
          id: item.id,
          user_input: item.query || 'No input recorded',
          system_response: processResponse(item.response),
          rating: normalizedRating,
          comment: item.comments || '',
          timestamp: item.created_at
        };
      });
    } else if (feedbackData && feedbackData.length > 0) {
      // Format feedback data
      formattedFeedback = feedbackData.map(item => {
        // First check if rating exists directly
        let finalRating = item.rating;
        console.log(`Feedback ${item.id} direct rating:`, finalRating);
        
        // If no direct rating, try to extract from response
        if (finalRating === null || finalRating === undefined) {
          console.log(`Feedback ${item.id} has no direct rating, trying to extract from response`);
          finalRating = extractRatingFromResponse(item.response_text);
          console.log(`Feedback ${item.id} extracted rating:`, finalRating);
        }
        
        // Normalize the rating to a proper number
        const normalizedRating = normalizeRating(finalRating);
        console.log(`Feedback ${item.id} normalized rating:`, normalizedRating);
        
        return {
          id: item.id,
          user_input: item.query_text || 'No input recorded',
          system_response: processResponse(item.response_text),
          rating: normalizedRating,
          comment: item.comments || '',
          timestamp: item.created_at
        };
      });
    }
    
    console.log(`Formatted ${formattedFeedback.length} feedback entries for user ${userId}`);
    if (formattedFeedback.length > 0) {
      console.log('First formatted feedback rating:', formattedFeedback[0].rating);
    }
    
    if (formattedFeedback.length === 0) {
      return res.json({ 
        feedback: [],
        message: 'No feedback records found for this user.'
      });
    }
    
    res.json({ feedback: formattedFeedback });
  } catch (error) {
    console.error('Error fetching user feedback:', error);
    res.status(500).json({ error: 'Failed to fetch user feedback', details: error.message });
  }
});

// API endpoint to get recent chat topics from users in the same cluster
app.get('/api/cluster-topics/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Fetching cluster topics for user ${userId}...`);
    
    // First, get the user's cluster assignment - only fetch cluster_id
    const { data: userCluster, error: clusterError } = await supabase
      .from('user_profiles')
      .select('cluster_id')
      .eq('id', userId)
      .single();
    
    if (clusterError) {
      console.error('Error fetching user profile:', clusterError);
      throw clusterError;
    }
    
    console.log('User profile data:', userCluster);
    
    if (!userCluster) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'Could not find this user in the database'
      });
    }
    
    if (!userCluster.cluster_id) {
      return res.status(404).json({ 
        error: 'User has no cluster assignment',
        message: 'This user is not assigned to any cluster yet'
      });
    }
    
    console.log(`User ${userId} belongs to cluster ${userCluster.cluster_id}`);
    
    // Simply match users in the same cluster - don't try to use columns that don't exist
    const { data: clusterUsers, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, username')
      .eq('cluster_id', userCluster.cluster_id)
      .neq('id', userId) // Exclude the current user
      .limit(50);
    
    if (usersError) {
      console.error('Error fetching cluster users:', usersError);
      throw usersError;
    }
    
    if (!clusterUsers || clusterUsers.length === 0) {
      return res.json({ 
        topics: [],
        message: 'No other users found in your cluster'
      });
    }
    
    console.log(`Found ${clusterUsers.length} users in the same cluster`);
    
    // Get user IDs
    const userIds = clusterUsers.map(user => user.id);
    
    // Try to fetch topics from interactions table
    try {
      // First try with topic_name
      const { data: topicsWithNames, error: topicsWithNamesError } = await supabase
        .from('interactions')
        .select('id, user_id, query, created_at, topic_name')
        .in('user_id', userIds)
        .not('query', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      
      // If we get data and it has topic_name field, use it
      if (!topicsWithNamesError && topicsWithNames && topicsWithNames.length > 0 && 
          topicsWithNames[0].hasOwnProperty('topic_name')) {
        
        // Format the topics
        const formattedTopics = topicsWithNames.map(item => {
          const user = clusterUsers.find(u => u.id === item.user_id);
          return {
            id: item.id,
            user_id: item.user_id,
            username: user ? user.username : 'Anonymous User',
            query: item.query,
            topic: item.topic_name || 'Untitled Topic',
            timestamp: item.created_at
          };
        });
        
        return res.json({ topics: formattedTopics });
      }
      
      // If no topic_name or error, try without it
      const { data: topics, error: topicsError } = await supabase
        .from('interactions')
        .select('id, user_id, query, created_at')
        .in('user_id', userIds)
        .not('query', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!topicsError && topics && topics.length > 0) {
        // Format the topics without topic names
        const formattedTopics = topics.map(item => {
          const user = clusterUsers.find(u => u.id === item.user_id);
          return {
            id: item.id,
            user_id: item.user_id,
            username: user ? user.username : 'Anonymous User',
            query: item.query,
            topic: 'Untitled Topic', // No topic name available
            timestamp: item.created_at
          };
        });
        
        return res.json({ topics: formattedTopics });
      }
    } catch (interactionError) {
      console.log('Error querying interactions table:', interactionError);
      // Continue to try the feedback table
    }
    
    // Try the feedback table as a fallback
    try {
      // First try with topic field
      const { data: feedbackWithTopic, error: feedbackWithTopicError } = await supabase
        .from('feedback')
        .select('id, user_id, query_text, created_at, topic')
        .in('user_id', userIds)
        .not('query_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      
      // If we get data and it has topic field, use it
      if (!feedbackWithTopicError && feedbackWithTopic && feedbackWithTopic.length > 0 &&
          feedbackWithTopic[0].hasOwnProperty('topic')) {
        
        // Format the topics
        const formattedTopics = feedbackWithTopic.map(item => {
          const user = clusterUsers.find(u => u.id === item.user_id);
          return {
            id: item.id,
            user_id: item.user_id,
            username: user ? user.username : 'Anonymous User',
            query: item.query_text,
            topic: item.topic || 'Untitled Topic',
            timestamp: item.created_at
          };
        });
        
        return res.json({ topics: formattedTopics });
      }
      
      // If no topic field or error, try without it
      const { data: feedback, error: feedbackError } = await supabase
        .from('feedback')
        .select('id, user_id, query_text, created_at')
        .in('user_id', userIds)
        .not('query_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!feedbackError && feedback && feedback.length > 0) {
        // Format the feedback without topic names
        const formattedTopics = feedback.map(item => {
          const user = clusterUsers.find(u => u.id === item.user_id);
          return {
            id: item.id,
            user_id: item.user_id,
            username: user ? user.username : 'Anonymous User',
            query: item.query_text,
            topic: 'Untitled Topic', // No topic available
            timestamp: item.created_at
          };
        });
        
        return res.json({ topics: formattedTopics });
      }
    } catch (feedbackError) {
      console.log('Error querying feedback table:', feedbackError);
    }
    
    // If we reach here, no data was found
    return res.json({ 
      topics: [],
      message: 'No recent chat topics found from users in your cluster'
    });
    
  } catch (error) {
    console.error('Error fetching cluster topics:', error);
    res.status(500).json({ error: 'Failed to fetch cluster topics', details: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Visualization server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/cluster-visualization.html in your browser to view the visualization`);
}); 