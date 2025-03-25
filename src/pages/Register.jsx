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
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert([
          {
            id: authData.user.id,
            username: formData.username,
            occupation: formData.occupation.toLowerCase(),
            age: parseInt(formData.age),
            education_level: formData.education_level.toLowerCase(),
            interests: formData.interests,
            learning_style: formData.learning_style.toLowerCase(),
            technical_depth: parseInt(formData.technical_depth),
            preferred_analogy_domains: formData.preferred_analogy_domains,
            main_learning_goal: formData.main_learning_goal.toLowerCase()
          }
        ]);
      
      if (profileError) throw profileError;
      
      toast.success('Registration successful! Please check your email to verify your account.');
      navigate('/login');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Basic Information</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
              {errors.username && <p className="mt-1 text-sm text-red-600">{errors.username}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
            </div>
            
            <button
              type="button"
              onClick={handleNext}
              className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Next
            </button>
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Demographics</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Occupation</label>
              <select
                name="occupation"
                value={formData.occupation}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Select occupation</option>
                {OCCUPATIONS.map(occupation => (
                  <option key={occupation} value={occupation}>
                    {occupation}
                  </option>
                ))}
              </select>
              {errors.occupation && <p className="mt-1 text-sm text-red-600">{errors.occupation}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Age</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleInputChange}
                min="13"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
              {errors.age && <p className="mt-1 text-sm text-red-600">{errors.age}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Education Level</label>
              <select
                name="education_level"
                value={formData.education_level}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Select education level</option>
                {EDUCATION_LEVELS.map(level => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
              {errors.education_level && <p className="mt-1 text-sm text-red-600">{errors.education_level}</p>}
            </div>
            
            <div className="flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Next
              </button>
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Interests</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {INTERESTS.map(interest => (
                <label key={interest} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    name="interests"
                    value={interest}
                    checked={formData.interests.includes(interest)}
                    onChange={handleInputChange}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">{interest}</span>
                </label>
              ))}
            </div>
            
            {errors.interests && <p className="mt-1 text-sm text-red-600">{errors.interests}</p>}
            
            <div className="flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Next
              </button>
            </div>
          </div>
        );
        
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mb-6">Learning Preferences</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Preferred Learning Style</label>
              <select
                name="learning_style"
                value={formData.learning_style}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Select learning style</option>
                {LEARNING_STYLES.map(style => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
              {errors.learning_style && <p className="mt-1 text-sm text-red-600">{errors.learning_style}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Technical Depth Preference</label>
              <input
                type="range"
                name="technical_depth"
                value={formData.technical_depth}
                onChange={handleInputChange}
                min="0"
                max="100"
                className="mt-1 block w-full"
              />
              <div className="flex justify-between text-sm text-gray-600">
                <span>Beginner</span>
                <span>Expert</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Analogy Domains</label>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {ANALOGY_DOMAINS.map(domain => (
                  <label key={domain} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="preferred_analogy_domains"
                      value={domain}
                      checked={formData.preferred_analogy_domains.includes(domain)}
                      onChange={handleInputChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{domain}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Main Learning Goal</label>
              <select
                name="main_learning_goal"
                value={formData.main_learning_goal}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Select learning goal</option>
                {LEARNING_GOALS.map(goal => (
                  <option key={goal} value={goal}>
                    {goal}
                  </option>
                ))}
              </select>
              {errors.main_learning_goal && <p className="mt-1 text-sm text-red-600">{errors.main_learning_goal}</p>}
            </div>
            
            <div className="flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Back
              </button>
              <button
                type="submit"
                className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Complete Registration
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Step {currentStep} of 4
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderStep()}
          </form>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;