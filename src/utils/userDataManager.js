import { supabase } from '../lib/supabaseClient';

/**
 * Save user data to the database
 * @param {string} userId - The user's ID
 * @param {string} dataType - The type of data ('projects', 'preferences', etc.)
 * @param {any} data - The data to save
 */
export const saveUserData = async (userId, dataType, data) => {
  try {
    const { error } = await supabase
      .from('user_data')
      .upsert({
        user_id: userId,
        data_type: dataType,
        data: data,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error(`Error saving ${dataType}:`, error);
      throw error;
    }

    console.log(`Successfully saved ${dataType} to database for user ${userId}`);
  } catch (error) {
    console.error(`Failed to save ${dataType}:`, error);
    throw error;
  }
};

/**
 * Load user data from the database
 * @param {string} userId - The user's ID
 * @param {string} dataType - The type of data to load ('projects', 'preferences', etc.)
 * @returns {any} The loaded data or null if not found
 */
export const loadUserData = async (userId, dataType) => {
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('data')
      .eq('user_id', userId)
      .eq('data_type', dataType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No data found, return null
        console.log(`No ${dataType} data found for user ${userId}`);
        return null;
      }
      console.error(`Error loading ${dataType}:`, error);
      throw error;
    }

    console.log(`Successfully loaded ${dataType} from database for user ${userId}`);
    return data.data;
  } catch (error) {
    console.error(`Failed to load ${dataType}:`, error);
    return null;
  }
};

/**
 * Delete user data from the database
 * @param {string} userId - The user's ID
 * @param {string} dataType - The type of data to delete
 */
export const deleteUserData = async (userId, dataType) => {
  try {
    const { error } = await supabase
      .from('user_data')
      .delete()
      .eq('user_id', userId)
      .eq('data_type', dataType);

    if (error) {
      console.error(`Error deleting ${dataType}:`, error);
      throw error;
    }

    console.log(`Successfully deleted ${dataType} from database for user ${userId}`);
  } catch (error) {
    console.error(`Failed to delete ${dataType}:`, error);
    throw error;
  }
};

/**
 * Save projects specifically (convenience function)
 * @param {string} userId - The user's ID
 * @param {Array} projects - The projects array to save
 */
export const saveProjects = async (userId, projects) => {
  return saveUserData(userId, 'projects', projects);
};

/**
 * Load projects specifically (convenience function)
 * @param {string} userId - The user's ID
 * @returns {Array} The projects array or empty array if not found
 */
export const loadProjects = async (userId) => {
  const projects = await loadUserData(userId, 'projects');
  return projects || [];
}; 