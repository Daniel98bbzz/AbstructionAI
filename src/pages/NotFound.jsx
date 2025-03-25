import React from 'react';
import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col justify-center items-center">
      <h1 className="text-6xl font-bold text-primary-600">404</h1>
      <h2 className="mt-4 text-2xl font-bold text-gray-900">Page Not Found</h2>
      <p className="mt-2 text-gray-600">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="mt-6 btn btn-primary">
        Go Home
      </Link>
    </div>
  );
}

export default NotFound;