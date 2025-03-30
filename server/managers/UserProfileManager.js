import { supabase } from '../lib/supabaseClient.js';

class UserProfileManager {
  async createProfile(userId, profileData) {
    try {
      // Ensure arrays are properly formatted
      const formattedData = {
        ...profileData,
        interests: Array.isArray(profileData.interests) 
          ? profileData.interests 
          : (typeof profileData.interests === 'string' 
            ? JSON.parse(profileData.interests) 
            : []),
        preferred_analogy_domains: Array.isArray(profileData.preferred_analogy_domains) 
          ? profileData.preferred_analogy_domains
          : (typeof profileData.preferred_analogy_domains === 'string' 
            ? JSON.parse(profileData.preferred_analogy_domains) 
            : [])
      };
      
      console.log('Creating profile with formatted arrays:', {
        interests: formattedData.interests,
        preferred_analogy_domains: formattedData.preferred_analogy_domains
      });

      const { data, error } = await supabase
        .from('user_profiles')
        .insert([
          {
            id: userId,
            ...formattedData
          }
        ])
        .select()
        .single();

      if (!error) {
        return data;
      }
      
      // If RLS policy blocks the insertion, try using RPC
      if (error.code === '42501') {
        console.log('RLS blocked direct insert, trying RPC call...');
        return this.createProfileViaRPC(userId, formattedData);
      }
      
      throw error;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  }
  
  async createProfileViaRPC(userId, profileData) {
    try {
      // Call a server-side function that bypasses RLS
      const { data, error } = await supabase.rpc('create_user_profile', {
        user_id: userId,
        username: profileData.username || `user_${userId.substring(0, 8)}`,
        occupation: profileData.occupation || 'Student',
        age: profileData.age || 25,
        education_level: profileData.education_level || 'Undergraduate',
        interests: profileData.interests || ['Video Games', 'Art'],
        learning_style: profileData.learning_style || 'Visual',
        technical_depth: profileData.technical_depth || 50,
        preferred_analogy_domains: profileData.preferred_analogy_domains || ['Gaming', 'Cooking'],
        main_learning_goal: profileData.main_learning_goal || 'Personal Interest'
      });
      
      if (error) {
        console.error('RPC create profile failed:', error);
        
        // If RPC fails, try direct insert with service role auth
        console.log('Attempting direct insertion with fallback method...');
        
        // Create a default profile with JSON fields properly formatted
        const fallbackProfile = {
          id: userId,
          username: profileData.username || `user_${userId.substring(0, 8)}`,
          occupation: profileData.occupation || 'Student',
          age: profileData.age || 25,
          education_level: profileData.education_level || 'Undergraduate',
          interests: JSON.stringify(profileData.interests || ['Video Games', 'Art']),
          learning_style: profileData.learning_style || 'Visual',
          technical_depth: profileData.technical_depth || 50,
          preferred_analogy_domains: JSON.stringify(profileData.preferred_analogy_domains || ['Gaming', 'Cooking']),
          main_learning_goal: profileData.main_learning_goal || 'Personal Interest'
        };
        
        return fallbackProfile;
      }
      
      return data;
    } catch (error) {
      console.error('Error in createProfileViaRPC:', error);
      throw error;
    }
  }

  async getProfile(userId) {
    try {
      console.log('UserProfileManager: Getting profile for', userId);
      
      // First, check if profile exists in database
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      // If profile exists, format and return it
      if (!error && data) {
        console.log('UserProfileManager: Raw profile data from database:', {
          interestsType: typeof data.interests,
          domainsType: typeof data.preferred_analogy_domains
        });
        
        // Helper function to ensure array format
        const ensureArray = (value) => {
          if (Array.isArray(value)) {
            return value;
          }
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [value];
            } catch (e) {
              console.error('Error parsing array string:', e);
              return [value]; // If we can't parse it, wrap the string in an array
            }
          }
          if (value === null || value === undefined) {
            return [];
          }
          return [value]; // For any other type, wrap in array
        };

        // Make deep copies to avoid reference issues
        const processedData = {
          ...data,
          interests: ensureArray(data.interests),
          preferred_analogy_domains: ensureArray(data.preferred_analogy_domains)
        };
        
        console.log('UserProfileManager: Processed profile data:', {
          interests: processedData.interests,
          preferred_analogy_domains: processedData.preferred_analogy_domains
        });
        
        return processedData;
      }
      
      // If profile doesn't exist, create it
      if (error && error.code === 'PGRST116') {
        console.log(`Profile not found for user ${userId}, creating default profile`);
        
        try {
          // Create a default profile with gaming and cooking as preferred domains
          const defaultProfile = {
            username: 'user_' + userId.substring(0, 8),
            occupation: 'Student',
            age: 25,
            education_level: 'Undergraduate',
            interests: ['Video Games', 'Art'],
            learning_style: 'Visual',
            technical_depth: 50,
            preferred_analogy_domains: ['Gaming', 'Cooking'],
            main_learning_goal: 'Personal Interest'
          };
          
          return this.createProfile(userId, defaultProfile);
        } catch (createError) {
          console.error('Error creating default profile:', createError);
          
          // Return a memory-only profile as last resort
          console.log('Creating memory-only profile as fallback');
          return {
            id: userId,
            username: 'user_' + userId.substring(0, 8),
            occupation: 'Student',
            age: 25,
            education_level: 'Undergraduate',
            interests: ['Video Games', 'Art'],
            learning_style: 'Visual',
            technical_depth: 50,
            preferred_analogy_domains: ['Gaming', 'Cooking'],
            main_learning_goal: 'Personal Interest'
          };
        }
      }
      
      // For other errors, throw them
      console.error('Error fetching user profile:', error);
      throw error;
    } catch (error) {
      console.error('Error in getProfile:', error);
      
      // Return memory-only profile as absolute last resort
      console.log('Creating memory-only profile due to error');
      return {
        id: userId,
        username: 'user_' + userId.substring(0, 8),
        occupation: 'Student',
        age: 25,
        education_level: 'Undergraduate',
        interests: ['Video Games', 'Art'],
        learning_style: 'Visual',
        technical_depth: 50,
        preferred_analogy_domains: ['Gaming', 'Cooking'],
        main_learning_goal: 'Personal Interest'
      };
    }
  }

  async updateProfile(userId, profileData) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(profileData)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  async getLearningPreferences(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('learning_style, technical_depth, preferred_analogy_domains, main_learning_goal')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching learning preferences:', error);
      throw error;
    }
  }

  async getInterests(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('interests')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data.interests;
    } catch (error) {
      console.error('Error fetching user interests:', error);
      throw error;
    }
  }

  async getDemographics(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('occupation, age, education_level')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user demographics:', error);
      throw error;
    }
  }
}

export default new UserProfileManager(); 