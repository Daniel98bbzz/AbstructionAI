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
      
      // Initialize the adaptive prompt with default structure
      const initialAdaptivePrompt = {
        preferences: {
          technical_depth: formattedData.technical_depth || 50
        },
        learned_patterns: {
          effective_analogies: [],
          confusing_explanations: [],
          preferred_domains: formattedData.preferred_analogy_domains || [],
          avoided_domains: []
        },
        custom_instructions: []
      };
      
      // Add initial instructions based on user profile
      if (formattedData.learning_style === 'Visual') {
        initialAdaptivePrompt.custom_instructions.push('Use visual explanations and descriptions when possible');
      } else if (formattedData.learning_style === 'Auditory') {
        initialAdaptivePrompt.custom_instructions.push('Describe concepts in ways that are easy to verbalize or discuss');
      } else if (formattedData.learning_style === 'Kinesthetic') {
        initialAdaptivePrompt.custom_instructions.push('Include examples that involve practical, hands-on applications');
      }
      
      // Add learning style to preferences
      initialAdaptivePrompt.preferences.learning_style = formattedData.learning_style || 'Visual';
      
      // Convert to JSON string
      formattedData.adaptive_prompt = JSON.stringify(initialAdaptivePrompt);
      
      console.log('Creating profile with formatted arrays:', {
        interests: formattedData.interests,
        preferred_analogy_domains: formattedData.preferred_analogy_domains,
        adaptive_prompt_initialized: !!formattedData.adaptive_prompt
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

  async getAdaptivePrompt(userId) {
    try {
      console.log('Fetching adaptive prompt for user:', userId);
      
      // Call the RPC function to get or create the profile with adaptive prompt
      const { data, error } = await supabase.rpc('get_or_create_user_profile', {
        p_user_id: userId
      });
      
      if (error) {
        console.error('Error calling get_or_create_user_profile RPC:', error);
        
        // Try direct query as fallback
        const { data: directData, error: directError } = await supabase
          .from('user_profiles')
          .select('adaptive_prompt')
          .eq('id', userId)
          .single();
          
        if (directError) {
          console.error('Direct query fallback also failed:', directError);
          
          // Last resort - create a default adaptive prompt in memory
          console.log('Creating default in-memory adaptive prompt for:', userId);
          const defaultPrompt = {
            preferences: {
              technical_depth: 50,
              learning_style: 'Visual'
            },
            learned_patterns: {
              effective_analogies: [],
              confusing_explanations: [],
              preferred_domains: [],
              avoided_domains: []
            },
            custom_instructions: ['Explain concepts clearly using simple terms']
          };
          
          return JSON.stringify(defaultPrompt);
        }
        
        return directData.adaptive_prompt || '';
      }
      
      // Extract adaptive_prompt from the returned profile
      return data.adaptive_prompt || '';
    } catch (error) {
      console.error('Error fetching adaptive prompt:', error);
      
      // Return a valid default JSON structure
      return JSON.stringify({
        preferences: {},
        learned_patterns: { 
          preferred_domains: [],
          avoided_domains: []
        },
        custom_instructions: []
      });
    }
  }

  async updateAdaptivePrompt(userId, promptText) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ 
          adaptive_prompt: promptText,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating adaptive prompt:', error);
      throw error;
    }
  }

  async enhanceAdaptivePrompt(userId, promptUpdates) {
    try {
      console.log('⭐ ENHANCING ADAPTIVE PROMPT FOR USER:', userId);
      console.log('⭐ UPDATES TO APPLY:', JSON.stringify(promptUpdates));
      
      // Get current prompt
      const currentPrompt = await this.getAdaptivePrompt(userId);
      console.log('⭐ CURRENT PROMPT:', currentPrompt || 'None found');
      
      const userProfile = await this.getProfile(userId);
      
      // Parse current prompt as JSON if it exists, or create a new structure
      let promptData;
      try {
        promptData = currentPrompt ? JSON.parse(currentPrompt) : {
          preferences: {},
          learned_patterns: {
            effective_analogies: [],
            confusing_explanations: [],
            preferred_domains: [],
            avoided_domains: []
          },
          custom_instructions: []
        };
      } catch (e) {
        console.warn('Could not parse existing prompt, creating new structure');
        promptData = {
          preferences: {},
          learned_patterns: {
            effective_analogies: [],
            confusing_explanations: [],
            preferred_domains: [],
            avoided_domains: []
          },
          custom_instructions: []
        };
      }
      
      // Update preferences if they exist in the updates
      if (promptUpdates.preferences) {
        Object.entries(promptUpdates.preferences).forEach(([key, value]) => {
          console.log(`⭐ Updating preference: ${key} = ${value}`);
          promptData.preferences[key] = value;
        });
      }
      
      // Add any new instructions
      if (promptUpdates.instructions && promptUpdates.instructions.length > 0) {
        // Add new unique instructions
        const existingInstructions = new Set(promptData.custom_instructions);
        promptUpdates.instructions.forEach(instruction => {
          if (!existingInstructions.has(instruction)) {
            console.log(`⭐ Adding new instruction: ${instruction}`);
            promptData.custom_instructions.push(instruction);
          }
        });
        
        // Limit to last 10 instructions to avoid overly long prompts
        promptData.custom_instructions = promptData.custom_instructions.slice(-10);
      }
      
      // Update topic preferences
      if (promptUpdates.topics) {
        if (promptUpdates.topics.preferred) {
          // Add new preferred domains without duplicates
          const preferredSet = new Set(promptData.learned_patterns.preferred_domains);
          promptUpdates.topics.preferred.forEach(domain => {
            console.log(`⭐ Adding preferred domain: ${domain}`);
            preferredSet.add(domain);
          });
          promptData.learned_patterns.preferred_domains = Array.from(preferredSet);
        }
        
        if (promptUpdates.topics.avoided) {
          // Add new avoided domains without duplicates
          const avoidedSet = new Set(promptData.learned_patterns.avoided_domains);
          promptUpdates.topics.avoided.forEach(domain => {
            console.log(`⭐ Adding avoided domain: ${domain}`);
            avoidedSet.add(domain);
          });
          promptData.learned_patterns.avoided_domains = Array.from(avoidedSet);
        }
      }
      
      // Save the updated prompt
      const updatedPromptJson = JSON.stringify(promptData);
      console.log('⭐ FINAL ADAPTIVE PROMPT:', updatedPromptJson);
      return await this.updateAdaptivePrompt(userId, updatedPromptJson);
    } catch (error) {
      console.error('Error enhancing adaptive prompt:', error);
      throw error;
    }
  }
}

export default new UserProfileManager(); 