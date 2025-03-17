import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

function Profile() {
  const { user, updateProfile, loading, error } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    field: '',
    educationLevel: '',
    visualLearning: 50,
    practicalExamples: 50,
    technicalDepth: 50,
  });
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user) {
      // Populate form with user data
      setFormData({
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        field: user.user_metadata?.field_of_study || '',
        educationLevel: user.user_metadata?.education_level || '',
        visualLearning: user.user_metadata?.learning_preferences?.visual_learning || 50,
        practicalExamples: user.user_metadata?.learning_preferences?.practical_examples || 50,
        technicalDepth: user.user_metadata?.learning_preferences?.technical_depth || 50,
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSliderChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSuccessMessage('');
      
      // Prepare user metadata
      const userData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        field_of_study: formData.field,
        education_level: formData.educationLevel,
        learning_preferences: {
          visual_learning: formData.visualLearning,
          practical_examples: formData.practicalExamples,
          technical_depth: formData.technicalDepth,
        }
      };
      
      await updateProfile(userData);
      setSuccessMessage('Profile updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
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
        
        {error && (
          <div className="mx-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="firstName"
                    id="firstName"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="lastName"
                    id="lastName"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="field" className="block text-sm font-medium text-gray-700">
                Field of Study
              </label>
              <div className="mt-1">
                <select
                  id="field"
                  name="field"
                  required
                  value={formData.field}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="">Select a field</option>
                  <option value="computer_science">Computer Science</option>
                  <option value="engineering">Engineering</option>
                  <option value="physics">Physics</option>
                  <option value="mathematics">Mathematics</option>
                  <option value="chemistry">Chemistry</option>
                  <option value="biology">Biology</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="educationLevel" className="block text-sm font-medium text-gray-700">
                Education Level
              </label>
              <div className="mt-1">
                <select
                  id="educationLevel"
                  name="educationLevel"
                  required
                  value={formData.educationLevel}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="">Select level</option>
                  <option value="high_school">High School</option>
                  <option value="undergraduate">Undergraduate</option>
                  <option value="graduate">Graduate</option>
                  <option value="phd">PhD</option>
                  <option value="professional">Professional</option>
                </select>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-medium text-gray-900">Learning Preferences</h3>
              <p className="mt-1 text-sm text-gray-500">
                Customize how explanations are presented to you
              </p>
              
              <div className="mt-6">
                <label htmlFor="visualLearning" className="block text-sm font-medium text-gray-700">
                  Visual Learning
                </label>
                <p className="text-xs text-gray-500">
                  How much do you prefer visual explanations vs. text-based explanations?
                </p>
                <div className="mt-2 flex items-center">
                  <span className="text-xs text-gray-500 w-24">Text-based</span>
                  <input
                    type="range"
                    id="visualLearning"
                    name="visualLearning"
                    min="0"
                    max="100"
                    value={formData.visualLearning}
                    onChange={handleSliderChange}
                    className="flex-grow mx-4"
                  />
                  <span className="text-xs text-gray-500 w-24 text-right">Visual</span>
                </div>
              </div>
              
              <div className="mt-6">
                <label htmlFor="practicalExamples" className="block text-sm font-medium text-gray-700">
                  Practical Examples
                </label>
                <p className="text-xs text-gray-500">
                  How much do you prefer practical examples vs. theoretical explanations?
                </p>
                <div className="mt-2 flex items-center">
                  <span className="text-xs text-gray-500 w-24">Theoretical</span>
                  <input
                    type="range"
                    id="practicalExamples"
                    name="practicalExamples"
                    min="0"
                    max="100"
                    value={formData.practicalExamples}
                    onChange={handleSliderChange}
                    className="flex-grow mx-4"
                  />
                  <span className="text-xs text-gray-500 w-24 text-right">Practical</span>
                </div>
              </div>
              
              <div className="mt-6">
                <label htmlFor="technicalDepth" className="block text-sm font-medium text-gray-700">
                  Technical Depth
                </label>
                <p className="text-xs text-gray-500">
                  How technical and detailed do you want explanations to be?
                </p>
                <div className="mt-2 flex items-center">
                  <span className="text-xs text-gray-500 w-24">Simplified</span>
                  <input
                    type="range"
                    id="technicalDepth"
                    name="technicalDepth"
                    min="0"
                    max="100"
                    value={formData.technicalDepth}
                    onChange={handleSliderChange}
                    className="flex-grow mx-4"
                  />
                  <span className="text-xs text-gray-500 w-24 text-right">Technical</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;