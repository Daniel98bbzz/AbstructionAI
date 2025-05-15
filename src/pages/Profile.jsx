import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

function Profile() {
  const { user, loading, error: authError } = useAuth();
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    occupation: '',
    age: 18,
    education_level: '',
    interests: [],
    learning_style: '',
    technical_depth: 50,
    preferred_analogy_domains: [],
    main_learning_goal: '',
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const OCCUPATIONS = [
    'Student',
    'Lecturer',
    'Professional',
    'Guest',
    'Other'
  ];

  const EDUCATION_LEVELS = [
    'High School',
    'Undergraduate',
    'Graduate',
    'Postgraduate',
    'Other'
  ];

  const INTERESTS = [
    'Sports',
    'Video Games',
    'Movies',
    'Books',
    'Meditation',
    'Yoga',
    'Technology',
    'Cooking',
    'Music',
    'Travel',
    'Fitness',
    'Art',
    'Photography',
    'Writing',
    'Dancing',
    'Science',
    'History',
    'Languages',
    'Philosophy',
    'Astronomy'
  ];

  const LEARNING_STYLES = [
    'Visual',
    'Auditory',
    'Kinesthetic'
  ];

  const ANALOGY_DOMAINS = [
    'Gaming',
    'Sports',
    'Movies',
    'Technology',
    'Cooking',
    'Everyday Life',
    'Science',
    'Historical Events',
    'Nature',
    'Music',
    'Architecture',
    'Business'
  ];

  const LEARNING_GOALS = [
    'Professional Development',
    'Academic Study',
    'Personal Interest',
    'Hobby',
    'Exam Preparation',
    'Career Transition'
  ];

  useEffect(() => {
    if (user) {
      fetchUserProfile();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setFormData({
          username: data.username || '',
          occupation: data.occupation || '',
          age: data.age || 18,
          education_level: data.education_level || '',
          interests: data.interests || [],
          learning_style: data.learning_style || '',
          technical_depth: data.technical_depth || 50,
          preferred_analogy_domains: data.preferred_analogy_domains || [],
          main_learning_goal: data.main_learning_goal || '',
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSliderChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) }));
  };

  const handleCheckboxChange = (e) => {
    const { name, value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
        ? [...prev[name], value]
        : prev[name].filter(item => item !== value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSuccessMessage('');
      setError(null);
      
      // Make sure interests and preferred_analogy_domains are arrays
      const validatedFormData = {
        ...formData,
        interests: Array.isArray(formData.interests) ? formData.interests : [],
        preferred_analogy_domains: Array.isArray(formData.preferred_analogy_domains) ? formData.preferred_analogy_domains : []
      };
      
      console.log('Saving profile with preferences:', {
        interests: validatedFormData.interests,
        preferred_analogy_domains: validatedFormData.preferred_analogy_domains
      });
      
      // Update in Supabase
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          username: validatedFormData.username,
          occupation: validatedFormData.occupation,
          age: validatedFormData.age,
          education_level: validatedFormData.education_level,
          interests: validatedFormData.interests,
          learning_style: validatedFormData.learning_style,
          technical_depth: validatedFormData.technical_depth,
          preferred_analogy_domains: validatedFormData.preferred_analogy_domains,
          main_learning_goal: validatedFormData.main_learning_goal,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select();
      
      if (error) throw error;
      
      // Enhanced profile update process
      // First call the webhook to update the memory cache
      const response = await fetch('/api/hooks/profile-updated', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          table: 'user_profiles',
          record: {
            id: user.id,
            username: validatedFormData.username,
            occupation: validatedFormData.occupation,
            age: validatedFormData.age,
            education_level: validatedFormData.education_level,
            interests: validatedFormData.interests,
            learning_style: validatedFormData.learning_style,
            technical_depth: validatedFormData.technical_depth,
            preferred_analogy_domains: validatedFormData.preferred_analogy_domains,
            main_learning_goal: validatedFormData.main_learning_goal
          }
        })
      });
      
      // Also make a direct call to force update the memory cache
      const forceResponse = await fetch('/api/force-user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id
        })
      });
      
      // And check the memory cache to confirm it was updated
      const memoryResponse = await fetch(`/api/view-memory-profile?userId=${user.id}`);
      const memoryProfile = await memoryResponse.json();
      
      console.log('Memory profile after update:', memoryProfile);
      console.log('Profile preferences in memory:', { 
        interests: memoryProfile.profile?.interests,
        preferred_analogy_domains: memoryProfile.profile?.preferred_analogy_domains
      });
      
      // If the memory cache doesn't match what we saved, try to fix it
      if (memoryProfile.success && 
          (!arraysEqual(memoryProfile.profile?.interests, validatedFormData.interests) || 
           !arraysEqual(memoryProfile.profile?.preferred_analogy_domains, validatedFormData.preferred_analogy_domains))) {
        console.warn('Memory cache does not match saved preferences, forcing update');
        
        // Force an override to ensure memory cache has correct values
        const overrideResponse = await fetch('/api/emergency-profile-override', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: user.id,
            preferredDomains: validatedFormData.preferred_analogy_domains,
            interests: validatedFormData.interests,
            otherFields: {
              username: validatedFormData.username,
              occupation: validatedFormData.occupation,
              age: validatedFormData.age,
              education_level: validatedFormData.education_level,
              learning_style: validatedFormData.learning_style,
              technical_depth: validatedFormData.technical_depth,
              main_learning_goal: validatedFormData.main_learning_goal
            }
          })
        });
        
        const overrideResult = await overrideResponse.json();
        console.log('Emergency override result:', overrideResult);
      }
      
      setSuccessMessage('Profile updated successfully!');
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      setError(error.message);
      toast.error('Failed to update profile.');
    }
  };

  // Helper function to compare arrays
  const arraysEqual = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length !== b.length) return false;
    
    // Create sorted copies to compare
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    
    for (let i = 0; i < sortedA.length; i++) {
      if (sortedA[i] !== sortedB[i]) return false;
    }
    return true;
  };

  if (loading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Your Profile
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Update your personal information and learning preferences
          </p>
        </div>
        
        {successMessage && (
          <div className="mx-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {successMessage}
          </div>
        )}
        
        {(error || authError) && (
          <div className="mx-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error || authError}
          </div>
        )}
        
        <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
              <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                    Username
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="username"
                      id="username"
                      value={formData.username}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="occupation" className="block text-sm font-medium text-gray-700">
                    Level of Interest
                  </label>
                  <div className="mt-1">
                    <select
                      id="occupation"
                      name="occupation"
                      value={formData.occupation}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    >
                      <option value="">Select level of interest</option>
                      {OCCUPATIONS.map(occupation => (
                        <option key={occupation} value={occupation.toLowerCase()}>
                          {occupation}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700">
                    Age
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      name="age"
                      id="age"
                      min="13"
                      value={formData.age}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="education_level" className="block text-sm font-medium text-gray-700">
                    Education Level
                  </label>
                  <div className="mt-1">
                    <select
                      id="education_level"
                      name="education_level"
                      value={formData.education_level}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    >
                      <option value="">Select education level</option>
                      {EDUCATION_LEVELS.map(level => (
                        <option key={level} value={level.toLowerCase()}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="learning_style" className="block text-sm font-medium text-gray-700">
                    Preferred Learning Style
                  </label>
                  <div className="mt-1">
                    <select
                      id="learning_style"
                      name="learning_style"
                      value={formData.learning_style}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    >
                      <option value="">Select learning style</option>
                      {LEARNING_STYLES.map(style => (
                        <option key={style} value={style.toLowerCase()}>
                          {style}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="main_learning_goal" className="block text-sm font-medium text-gray-700">
                    Main Learning Goal
                  </label>
                  <div className="mt-1">
                    <select
                      id="main_learning_goal"
                      name="main_learning_goal"
                      value={formData.main_learning_goal}
                      onChange={handleChange}
                      className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    >
                      <option value="">Select learning goal</option>
                      {LEARNING_GOALS.map(goal => (
                        <option key={goal} value={goal.toLowerCase()}>
                          {goal}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">Interests</h3>
              <p className="mt-1 text-sm text-gray-500">
                Select all topics that interest you
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {INTERESTS.map(interest => (
                  <div key={interest} className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id={`interest-${interest}`}
                        name="interests"
                        type="checkbox"
                        value={interest}
                        checked={formData.interests.includes(interest)}
                        onChange={handleCheckboxChange}
                        className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-2 text-sm">
                      <label htmlFor={`interest-${interest}`} className="font-medium text-gray-700">
                        {interest}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">Preferred Analogy Domains</h3>
              <p className="mt-1 text-sm text-gray-500">
                Topics you'd like to see used in analogies to explain concepts
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {ANALOGY_DOMAINS.map(domain => (
                  <div key={domain} className="flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id={`domain-${domain}`}
                        name="preferred_analogy_domains"
                        type="checkbox"
                        value={domain}
                        checked={formData.preferred_analogy_domains.includes(domain)}
                        onChange={handleCheckboxChange}
                        className="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-2 text-sm">
                      <label htmlFor={`domain-${domain}`} className="font-medium text-gray-700">
                        {domain}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900">Learning Preferences</h3>
              <div className="mt-4">
                <label htmlFor="technical_depth" className="block text-sm font-medium text-gray-700">
                  Technical Depth Preference
                </label>
                <p className="text-xs text-gray-500">
                  How technical and detailed do you want explanations to be?
                </p>
                <div className="mt-2 flex items-center space-x-3">
                  <span className="text-xs text-gray-500">Beginner</span>
                  <input
                    type="range"
                    id="technical_depth"
                    name="technical_depth"
                    min="0"
                    max="100"
                    value={formData.technical_depth}
                    onChange={handleSliderChange}
                    className="flex-grow"
                  />
                  <span className="text-xs text-gray-500">Expert</span>
                </div>
              </div>
            </div>

            <div className="pt-5">
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;