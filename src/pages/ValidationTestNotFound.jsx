import React from 'react';
import { Link } from 'react-router-dom';

const ValidationTestNotFound = ({ testId }) => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Test Not Found</h1>
        <p className="text-gray-600 mb-6">
          The validation test "{testId}" could not be found. It may have been renamed or removed.
        </p>
        <div className="space-y-3">
          <Link 
            to="/validation" 
            className="block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            ← Back to Validation Dashboard
          </Link>
          <Link 
            to="/dashboard" 
            className="block bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Go to Main Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ValidationTestNotFound; 