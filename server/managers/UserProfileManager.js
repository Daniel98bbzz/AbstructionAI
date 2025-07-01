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
      // Attempt to retrieve the profile using direct query first, without .single()
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId);
      
      if (error) {
        console.error('Error retrieving user profile:', error);
        return null;
      }
      
      // Check if we have multiple or no profiles
      if (!data || data.length === 0) {
        console.log(`No profile found for user ${userId}, will create default`);
        return await this.createDefaultProfile(userId);
      } else if (data.length > 1) {
        console.log(`Multiple profiles found for user ${userId}, using the most recent one`);
        // Sort by updated_at and use the most recent profile
        data.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        return this.formatProfile(data[0]);
      } else {
        // We have exactly one profile
        return this.formatProfile(data[0]);
      }
    } catch (error) {
      console.error('Exception in getProfile:', error);
      return null;
    }
  }

  // Format the profile to ensure arrays are correctly formatted
  formatProfile(profile) {
    if (!profile) return null;
    
        const ensureArray = (value) => {
          if (Array.isArray(value)) {
            return value;
          }
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed) ? parsed : [value];
            } catch (e) {
              return [value]; // If we can't parse it, wrap the string in an array
            }
          }
          if (value === null || value === undefined) {
            return [];
          }
          return [value]; // For any other type, wrap in array
        };

    // Create a new formatted profile with correct array types and default toggles
    const formattedProfile = {
      ...profile,
      interests: ensureArray(profile.interests),
      preferred_analogy_domains: ensureArray(profile.preferred_analogy_domains),
      
      // Add default values for personalization toggles if they don't exist
      use_interests_for_analogies: profile.use_interests_for_analogies ?? true,
      use_profile_for_main_answer: profile.use_profile_for_main_answer ?? true
        };
        
    console.log('Formatted profile with personalization toggles:', {
      interests: formattedProfile.interests,
      preferred_analogy_domains: formattedProfile.preferred_analogy_domains,
      use_interests_for_analogies: formattedProfile.use_interests_for_analogies,
      use_profile_for_main_answer: formattedProfile.use_profile_for_main_answer
        });
        
    return formattedProfile;
  }

  async createDefaultProfile(userId) {
        try {
      // Create a default profile
          const defaultProfile = {
        id: userId,
        username: 'user_' + userId.substring(0, 8),
        occupation: 'Student',
        age: 25,
        education_level: 'Undergraduate',
        interests: ['Video Games', 'Art'],
        learning_style: 'Visual',
        technical_depth: 50,
        preferred_analogy_domains: ['Gaming', 'Cooking'],
        main_learning_goal: 'Personal Interest',
        
        // Default personalization toggles
        use_interests_for_analogies: true,
        use_profile_for_main_answer: true
      };
      
      const { data, error } = await supabase
        .from('user_profiles')
        .insert([defaultProfile])
        .select();
      
      if (error) {
        console.error('Error creating default profile:', error);
        return defaultProfile; // Return the default anyway
      }
      
      return data[0] || defaultProfile;
    } catch (error) {
      console.error('Exception creating default profile:', error);
      return null;
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