import { supabase } from '../lib/supabaseClient.js';

class UserProfileManager {
  async createProfile(userId, profileData) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert([
          {
            id: userId,
            ...profileData
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  }

  async getProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
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