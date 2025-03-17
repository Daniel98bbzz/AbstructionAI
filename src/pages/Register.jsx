import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    field: '',
    educationLevel: '',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const { register, loading } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (formData.password !== formData.confirmPassword) {
      return setErrorMessage('Passwords do not match');
    }
    
    if (formData.password.length < 6) {
      return setErrorMessage('Password must be at least 6 characters');
    }
    
    try {
      setErrorMessage('');
      
      // Prepare user metadata
      const userData = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        field_of_study: formData.field,
        education_level: formData.educationLevel,
        learning_preferences: {}
      };
      
      await register(formData.email, formData.password, userData);
      navigate('/verify-email');
    } catch (error) {
      setErrorMessage(error.message || 'Failed to create account');
    }
  };

  return (
    <div>
      <h2 className="text-center text-3xl font-extrabold text-gray-900 mb-6">
        Create your account
      </h2>
      
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {errorMessage}
        </div>
      )}
      
      <form className="space-y-6" onSubmit={handleSubmit}>
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

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email address
          </label>
          <div className="mt-1">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>

        <div>
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

        <div>
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="mt-1">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={formData.password}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirm Password
          </label>
          <div className="mt-1">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="text-center">
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