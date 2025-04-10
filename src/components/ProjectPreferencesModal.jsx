import React, { useState, useEffect } from 'react';
import { INTERESTS, LEARNING_STYLES, ANALOGY_DOMAINS } from '../constants';

function ProjectPreferencesModal({ 
  isOpen, 
  onClose, 
  onSave, 
  defaultPreferences,
  projectName 
}) {
  const [preferences, setPreferences] = useState({
    interests: [],
    learning_style: 'Visual',
    technical_depth: 50,
    preferred_analogy_domains: []
  });
  const [activeTab, setActiveTab] = useState('interests');

  // Initialize preferences when the component mounts or when defaultPreferences changes
  useEffect(() => {
    if (defaultPreferences) {
      setPreferences({
        interests: defaultPreferences.interests || [],
        learning_style: defaultPreferences.learning_style || 'Visual',
        technical_depth: defaultPreferences.technical_depth || 50,
        preferred_analogy_domains: defaultPreferences.preferred_analogy_domains || []
      });
    }
  }, [defaultPreferences]);

  const handleSave = () => {
    onSave(preferences);
    onClose();
  };

  const handleContinueWithDefault = () => {
    onSave(defaultPreferences);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[800px] max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          Customize Preferences for "{projectName}"
        </h2>
        
        <div className="mb-6">
          <p className="text-gray-600">
            Would you like to customize the learning preferences for this project, or continue with your default settings?
          </p>
        </div>

        <div className="space-y-6">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('interests')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'interests'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Interests & Topics
              </button>
              <button
                onClick={() => setActiveTab('learning')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'learning'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Learning Preferences
              </button>
            </nav>
          </div>

          {/* Interests Tab */}
          {activeTab === 'interests' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interests
                </label>
                <div className="grid grid-cols-4 gap-4">
                  {INTERESTS.map((interest) => (
                    <label key={interest} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={preferences.interests.includes(interest)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPreferences(prev => ({
                              ...prev,
                              interests: [...prev.interests, interest]
                            }));
                          } else {
                            setPreferences(prev => ({
                              ...prev,
                              interests: prev.interests.filter(i => i !== interest)
                            }));
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-600">{interest}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Analogy Domains
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {ANALOGY_DOMAINS.map((domain) => (
                    <label key={domain} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={preferences.preferred_analogy_domains.includes(domain)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPreferences(prev => ({
                              ...prev,
                              preferred_analogy_domains: [...prev.preferred_analogy_domains, domain]
                            }));
                          } else {
                            setPreferences(prev => ({
                              ...prev,
                              preferred_analogy_domains: prev.preferred_analogy_domains.filter(d => d !== domain)
                            }));
                          }
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-600">{domain}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Learning Preferences Tab */}
          {activeTab === 'learning' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Learning Style
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {LEARNING_STYLES.map((style) => (
                    <label key={style} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="learning_style"
                        value={style}
                        checked={preferences.learning_style === style}
                        onChange={(e) => {
                          setPreferences(prev => ({
                            ...prev,
                            learning_style: e.target.value
                          }));
                        }}
                        className="border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-600">{style}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Technical Depth
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.technical_depth}
                  onChange={(e) => {
                    setPreferences(prev => ({
                      ...prev,
                      technical_depth: parseInt(e.target.value)
                    }));
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Simpler</span>
                  <span>More Technical</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end space-x-4">
          <button
            onClick={handleContinueWithDefault}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Continue with Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            Save Project Preferences
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProjectPreferencesModal; 