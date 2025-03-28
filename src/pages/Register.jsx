import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

const OCCUPATIONS = [
  'Student',
  'Lecturer',
  'Professional',
  'Hobbyist',
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

function Register() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Basic Information
    username: '',
    email: '',
    password: '',
    
    // Step 2: Demographics
    occupation: '',
    age: 18,
    education_level: '',
    
    // Step 3: Interests
    interests: [],
    
    // Additional Information
    learning_style: '',
    technical_depth: 50,
    preferred_analogy_domains: [],
    main_learning_goal: ''
  });

  const [errors, setErrors] = useState({});

  const validateStep = (step) => {
    const newErrors = {};
    
    switch (step) {
      case 1:
        if (!formData.username) newErrors.username = 'Username is required';
        if (!formData.email) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
        if (!formData.password) newErrors.password = 'Password is required';
        else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
        break;
        
      case 2:
        if (!formData.occupation) newErrors.occupation = 'Occupation is required';
        if (!formData.age || formData.age < 13) newErrors.age = 'Age must be at least 13';
        if (!formData.education_level) newErrors.education_level = 'Education level is required';
        break;
        
      case 3:
        if (formData.interests.length === 0) newErrors.interests = 'Select at least one interest';
        break;
        
      case 4:
        if (!formData.learning_style) newErrors.learning_style = 'Learning style is required';
        if (!formData.main_learning_goal) newErrors.main_learning_goal = 'Main learning goal is required';
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      const arrayField = name === 'interests' ? 'interests' : 'preferred_analogy_domains';
      setFormData(prev => ({
        ...prev,
        [arrayField]: checked
          ? [...prev[arrayField], value]
          : prev[arrayField].filter(item => item !== value)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep(currentStep)) return;
    
    try {
      // Register user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });
      
      if (authError) throw authError;
      
      // Create user profile
      // Make sure arrays are properly formatted before saving to the database
      const userProfile = {
        id: authData.user.id,
        username: formData.username,
        occupation: formData.occupation.toLowerCase(),
        age: parseInt(formData.age),
        education_level: formData.education_level.toLowerCase(),
        // Ensure interests is an array of strings
        interests: formData.interests && Array.isArray(formData.interests) ? formData.interests : [],
        learning_style: formData.learning_style.toLowerCase(),
        technical_depth: parseInt(formData.technical_depth),
        // Ensure preferred_analogy_domains is an array of strings
        preferred_analogy_domains: formData.preferred_analogy_domains && Array.isArray(formData.preferred_analogy_domains) 
          ? formData.preferred_analogy_domains 
          : [],
        main_learning_goal: formData.main_learning_goal.toLowerCase()
      };
      
      console.log('Saving user profile with arrays:', {
        interests: userProfile.interests,
        preferred_analogy_domains: userProfile.preferred_analogy_domains
      });
      
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert([userProfile]);
      
      if (profileError) throw profileError;
      
      // Also store profile in memory cache for immediate use
      try {
        await fetch('/api/hooks/profile-updated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'user_profiles',
            record: userProfile
          })
        });
        console.log('Profile cache updated after registration');
      } catch (cacheError) {
        console.error('Failed to update profile cache:', cacheError);
        // Non-fatal error, continue
      }
      
      toast.success('Registration successful! Please check your email to verify your account.');
      navigate('/login');
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Render step 1: Basic Information
  const renderStep1 = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold text-gray-900">Basic Information</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="Choose a username"
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder-gray-400"
          />
          {errors.username && <p className="mt-1 text-sm text-red-600">{errors.username}</p>}
        </div>
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="Enter your email address"
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder-gray-400"
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Create a secure password"
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder-gray-400"
          />
          {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
        </div>
      </div>
      
      <div className="pt-6">
        <button
          type="button"
          onClick={handleNext}
          className="w-full rounded-md bg-primary-600 py-3 px-6 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Next
        </button>
      </div>
    </div>
  );

  // Render step 2: Demographics
  const renderStep2 = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold text-gray-900">Demographics</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <div>
          <label htmlFor="occupation" className="block text-sm font-medium text-gray-700 mb-1">
            Occupation
          </label>
          <select
            id="occupation"
            name="occupation"
            value={formData.occupation}
            onChange={handleInputChange}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select your occupation</option>
            {OCCUPATIONS.map(occupation => (
              <option key={occupation} value={occupation}>
                {occupation}
              </option>
            ))}
          </select>
          {errors.occupation && <p className="mt-1 text-sm text-red-600">{errors.occupation}</p>}
        </div>
        
        <div>
          <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">
            Age
          </label>
          <select
            id="age"
            name="age"
            value={formData.age}
            onChange={handleInputChange}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select your age range</option>
            <option value="13-18">13-18</option>
            <option value="19-24">19-24</option>
            <option value="25-34">25-34</option>
            <option value="35-44">35-44</option>
            <option value="45-54">45-54</option>
            <option value="55+">55+</option>
          </select>
          {errors.age && <p className="mt-1 text-sm text-red-600">{errors.age}</p>}
        </div>
        
        <div>
          <label htmlFor="education_level" className="block text-sm font-medium text-gray-700 mb-1">
            Education Level
          </label>
          <select
            id="education_level"
            name="education_level"
            value={formData.education_level}
            onChange={handleInputChange}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select your education level</option>
            {EDUCATION_LEVELS.map(level => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          {errors.education_level && <p className="mt-1 text-sm text-red-600">{errors.education_level}</p>}
        </div>
      </div>
      
      <div className="pt-6 flex justify-end space-x-4">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border border-gray-300 bg-white py-3 px-6 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-md bg-primary-600 py-3 px-6 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Next
        </button>
      </div>
    </div>
  );

  // Render step 3: Interests
  const renderStep3 = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold text-gray-900">Interests</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Which topics are you most interested in learning?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {INTERESTS.map(interest => (
              <div key={interest} className="relative flex items-start">
                <div className="flex h-5 items-center">
                  <input
                    id={`interest-${interest}`}
                    name="interests"
                    type="checkbox"
                    value={interest}
                    checked={formData.interests.includes(interest)}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </div>
                <label htmlFor={`interest-${interest}`} className="ml-2 text-sm text-gray-700">
                  {interest}
                </label>
              </div>
            ))}
          </div>
          {errors.interests && <p className="mt-2 text-sm text-red-600">{errors.interests}</p>}
        </div>
        
        <div className="pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            What level of technical depth do you prefer?
          </label>
          <div className="bg-gray-50 p-6 rounded-lg">
            <input
              type="range"
              name="technical_depth"
              min="1"
              max="10"
              value={formData.technical_depth || 5}
              onChange={handleInputChange}
              className="w-full accent-primary-600"
            />
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Beginner-friendly</span>
              <span>Technically detailed</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="pt-6 flex justify-end space-x-4">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border border-gray-300 bg-white py-3 px-6 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-md bg-primary-600 py-3 px-6 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Next
        </button>
      </div>
    </div>
  );

  // Render step 4: Learning Preferences
  const renderStep4 = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold text-gray-900">Learning Preferences</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            What is your preferred learning style?
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {LEARNING_STYLES.map(style => (
              <div key={style} className="relative flex items-start p-4 border border-gray-200 rounded-lg hover:border-primary-500 transition-colors duration-200">
                <div className="flex h-5 items-center">
                  <input
                    id={`learning-style-${style}`}
                    name="learning_style"
                    type="radio"
                    value={style}
                    checked={formData.learning_style === style}
                    onChange={handleInputChange}
                    className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </div>
                <label htmlFor={`learning-style-${style}`} className="ml-2 text-sm text-gray-700">
                  {style}
                </label>
              </div>
            ))}
          </div>
          {errors.learning_style && <p className="mt-2 text-sm text-red-600">{errors.learning_style}</p>}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            What is your main learning goal?
          </label>
          <select
            name="main_learning_goal"
            value={formData.main_learning_goal}
            onChange={handleInputChange}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select your main learning goal</option>
            {LEARNING_GOALS.map(goal => (
              <option key={goal} value={goal}>
                {goal}
              </option>
            ))}
          </select>
          {errors.main_learning_goal && <p className="mt-2 text-sm text-red-600">{errors.main_learning_goal}</p>}
        </div>
      </div>
      
      <div className="pt-6 flex justify-end space-x-4">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border border-gray-300 bg-white py-3 px-6 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-md bg-primary-600 py-3 px-6 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors duration-200"
        >
          Submit
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Log in
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6 bg-white shadow rounded-lg p-8" onSubmit={handleSubmit}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </form>
      </div>
    </div>
  );
}

export default Register;