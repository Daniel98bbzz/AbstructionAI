import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for active session on load
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (err) {
        console.error('Error checking auth session:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Register a new user
  const register = async (email, password, userData) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
        },
      });

      if (error) throw error;
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Login user
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      setUser(data.user);
      
      // First check if profile already exists in memory (don't override if it does)
      try {
        console.log('Checking if profile already exists in memory first...');
        const checkMemoryResponse = await fetch(`/api/view-memory-profile?userId=${data.user.id}`);
        const checkMemoryResult = await checkMemoryResponse.json();
        
        if (checkMemoryResult.success && checkMemoryResult.profile) {
          console.log('Profile already exists in memory, keeping current values:', {
            interests: checkMemoryResult.profile.interests,
            preferred_analogy_domains: checkMemoryResult.profile.preferred_analogy_domains
          });
          
          // Don't update if profile already exists in memory
          return data;
        }
        
        // If profile doesn't exist in memory, proceed with sync
        console.log('Profile not found in memory, syncing from database...');
      } catch (memoryCheckError) {
        console.error('Error checking memory profile, will try to sync from database:', memoryCheckError);
      }
      
      // Force sync user profile with server memory cache
      try {
        console.log('Syncing user profile with server cache...');
        // Fetch the user profile first to make sure it exists
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
          
        if (profileError && profileError.code === 'PGRST116') {
          // Profile doesn't exist yet - this should be handled by Profile page
          console.log('User profile does not exist yet, will be created on profile page');
        } else if (profileData) {
          // Make sure arrays are properly formatted
          let interests = profileData.interests;
          let analogyDomains = profileData.preferred_analogy_domains;
          
          // Ensure arrays are properly formatted
          if (interests && typeof interests === 'string') {
            try {
              interests = JSON.parse(interests);
            } catch (e) {
              interests = [];
            }
          }
          
          if (analogyDomains && typeof analogyDomains === 'string') {
            try {
              analogyDomains = JSON.parse(analogyDomains);
            } catch (e) {
              analogyDomains = [];
            }
          }
          
          // Make sure they're arrays
          if (!Array.isArray(interests)) {
            interests = interests ? [interests] : [];
          }
          
          if (!Array.isArray(analogyDomains)) {
            analogyDomains = analogyDomains ? [analogyDomains] : [];
          }
          
          // Create a properly formatted profile
          const formattedProfile = {
            ...profileData,
            interests,
            preferred_analogy_domains: analogyDomains
          };
          
          console.log('Loaded profile preferences from database:', {
            interests,
            preferred_analogy_domains: analogyDomains
          });
          
          // Profile exists, trigger server cache update
          const response = await fetch('/api/hooks/profile-updated', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              table: 'user_profiles',
              record: formattedProfile
            })
          });
          
          const result = await response.json();
          console.log('Profile sync result:', result);
          
          // Also trigger a force memory cache update on the server
          const memoryResponse = await fetch('/api/force-user-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: data.user.id
            })
          });
          
          const memoryResult = await memoryResponse.json();
          console.log('Forced memory cache update result:', memoryResult);
          
          // Double-check that the memory cache was updated correctly
          const checkResponse = await fetch(`/api/view-memory-profile?userId=${data.user.id}`);
          const checkResult = await checkResponse.json();
          console.log('Memory profile verification:', {
            success: checkResult.success,
            interests: checkResult.profile?.interests,
            preferred_analogy_domains: checkResult.profile?.preferred_analogy_domains
          });
        }
      } catch (syncError) {
        console.error('Error syncing profile, will continue anyway:', syncError);
        // Don't throw, just log - we still want login to succeed
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Logout user
  const logout = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { error } = await supabase.auth.signOut();
      
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update user profile
  const updateProfile = async (userData) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.updateUser({
        data: userData,
      });

      if (error) throw error;
      
      setUser({ ...user, user_metadata: { ...user.user_metadata, ...userData } });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    error,
    register,
    login,
    logout,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}