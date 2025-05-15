import React from 'react';
import { Link } from 'react-router-dom';

function VerifyEmail() {
  return (
    <div className="text-center">
      <svg
        className="mx-auto h-12 w-12 text-primary-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      <h2 className="mt-4 text-2xl font-bold text-gray-900">Check your email</h2>
      <p className="mt-2 text-gray-600">
        We've sent a verification link to your email address.
        Please check your inbox and click the link to verify your account.
      </p>
      <div className="mt-6">
        <Link to="/login" className="text-primary-600 hover:text-primary-500 font-medium">
          Return to login
        </Link>
      </div>
    </div>
  );
}

export default VerifyEmail;