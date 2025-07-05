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
    
    // Personalization toggles
    use_interests_for_analogies: true,
    use_profile_for_main_answer: true,
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
          
          // Personalization toggles
          use_interests_for_analogies: data.use_interests_for_analogies ?? true,
          use_profile_for_main_answer: data.use_profile_for_main_answer ?? true,
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
          use_interests_for_analogies: validatedFormData.use_interests_for_analogies,
          use_profile_for_main_answer: validatedFormData.use_profile_for_main_answer,
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-600"></div>
              <div className="absolute inset-0 rounded-full border-2 border-primary-200"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 bg-white/20 rounded-full text-white text-sm font-medium mb-6 backdrop-blur-sm">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Your Learning Profile
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Personalize Your Experience
            </h1>
            <p className="text-xl text-primary-100 max-w-3xl mx-auto">
              Customize your learning preferences to get the most out of AbstructionAI
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
          {/* Success/Error Messages */}
          {successMessage && (
            <div className="mx-6 mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 text-green-800 rounded-xl flex items-center">
              <svg className="w-5 h-5 mr-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {successMessage}
            </div>
          )}
          
          {(error || authError) && (
            <div className="mx-6 mt-6 p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-800 rounded-xl flex items-center">
              <svg className="w-5 h-5 mr-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error || authError}
            </div>
          )}
          
          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Basic Information Section */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Basic Information</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        name="username"
                        id="username"
                        value={formData.username}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
                        placeholder="Enter your username"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="occupation" className="block text-sm font-semibold text-gray-700 mb-2">
                      Level of Interest
                    </label>
                    <div className="relative">
                      <select
                        id="occupation"
                        name="occupation"
                        value={formData.occupation}
                        onChange={handleChange}
                        className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
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
                    <label htmlFor="age" className="block text-sm font-semibold text-gray-700 mb-2">
                      Age
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <input
                        type="number"
                        name="age"
                        id="age"
                        min="13"
                        value={formData.age}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="education_level" className="block text-sm font-semibold text-gray-700 mb-2">
                      Education Level
                    </label>
                    <select
                      id="education_level"
                      name="education_level"
                      value={formData.education_level}
                      onChange={handleChange}
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
                    >
                      <option value="">Select education level</option>
                      {EDUCATION_LEVELS.map(level => (
                        <option key={level} value={level.toLowerCase()}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="learning_style" className="block text-sm font-semibold text-gray-700 mb-2">
                      Preferred Learning Style
                    </label>
                    <select
                      id="learning_style"
                      name="learning_style"
                      value={formData.learning_style}
                      onChange={handleChange}
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
                    >
                      <option value="">Select learning style</option>
                      {LEARNING_STYLES.map(style => (
                        <option key={style} value={style.toLowerCase()}>
                          {style}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="main_learning_goal" className="block text-sm font-semibold text-gray-700 mb-2">
                      Main Learning Goal
                    </label>
                    <select
                      id="main_learning_goal"
                      name="main_learning_goal"
                      value={formData.main_learning_goal}
                      onChange={handleChange}
                      className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white shadow-sm transition-all duration-200"
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

              {/* Interests Section */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Interests</h3>
                    <p className="text-sm text-gray-600 mt-1">Select all topics that interest you</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {INTERESTS.map(interest => (
                    <label key={interest} className="relative flex items-center p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-all duration-200 cursor-pointer group">
                      <input
                        id={`interest-${interest}`}
                        name="interests"
                        type="checkbox"
                        value={interest}
                        checked={formData.interests.includes(interest)}
                        onChange={handleCheckboxChange}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700 group-hover:text-gray-900">
                        {interest}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Analogy Domains Section */}
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-6 border border-purple-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Preferred Analogy Domains</h3>
                    <p className="text-sm text-gray-600 mt-1">Topics you'd like to see used in analogies to explain concepts</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {ANALOGY_DOMAINS.map(domain => (
                    <label key={domain} className="relative flex items-center p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-all duration-200 cursor-pointer group">
                      <input
                        id={`domain-${domain}`}
                        name="preferred_analogy_domains"
                        type="checkbox"
                        value={domain}
                        checked={formData.preferred_analogy_domains.includes(domain)}
                        onChange={handleCheckboxChange}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-700 group-hover:text-gray-900">
                        {domain}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Learning Preferences Section */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Learning Preferences</h3>
                    <p className="text-sm text-gray-600 mt-1">Customize how technical explanations should be</p>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-6">
                  <label htmlFor="technical_depth" className="block text-sm font-semibold text-gray-700 mb-3">
                    Technical Depth Preference
                  </label>
                  <p className="text-sm text-gray-600 mb-4">
                    How technical and detailed do you want explanations to be?
                  </p>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500 font-medium">Beginner</span>
                    <div className="flex-grow relative">
                      <input
                        type="range"
                        id="technical_depth"
                        name="technical_depth"
                        min="0"
                        max="100"
                        value={formData.technical_depth}
                        onChange={handleSliderChange}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="absolute -top-8 left-0 right-0 flex justify-center">
                        <span className="bg-primary-600 text-white text-xs px-2 py-1 rounded font-medium">
                          {formData.technical_depth}%
                        </span>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500 font-medium">Expert</span>
                  </div>
                </div>
              </div>

              {/* Personalization Settings */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                <div className="flex items-center mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Personalization Settings</h3>
                    <p className="text-sm text-gray-600 mt-1">Control how your profile is used for personalization</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="use_interests_for_analogies"
                          name="use_interests_for_analogies"
                          type="checkbox"
                          checked={formData.use_interests_for_analogies}
                          onChange={handleCheckboxChange}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>
                      <div className="ml-3">
                        <label htmlFor="use_interests_for_analogies" className="text-sm font-semibold text-gray-900">
                          Use my interests for personalized analogies
                        </label>
                        <p className="text-sm text-gray-600 mt-1">
                          When enabled, analogies in the Abstract tab will be tailored to your selected interests. When disabled, only your preferred analogy domains will be used.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="use_profile_for_main_answer"
                          name="use_profile_for_main_answer"
                          type="checkbox"
                          checked={formData.use_profile_for_main_answer}
                          onChange={handleCheckboxChange}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </div>
                      <div className="ml-3">
                        <label htmlFor="use_profile_for_main_answer" className="text-sm font-semibold text-gray-900">
                          Use my profile for personalized main answers
                        </label>
                        <p className="text-sm text-gray-600 mt-1">
                          When enabled, main answers will be adapted based on your education level, age, learning goals, and technical depth preference.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-6">
                <button
                  type="submit"
                  className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;