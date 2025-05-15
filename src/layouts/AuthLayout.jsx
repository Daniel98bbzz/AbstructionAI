import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

function AuthLayout() {
  const location = useLocation();
  const isRegisterPage = location.pathname === '/register';
  
  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col ${isRegisterPage ? 'py-4' : 'justify-center py-12'}`}>
      <div className={`${isRegisterPage ? 'w-full px-4' : 'sm:mx-auto sm:w-full sm:max-w-md'}`}>
        <Link to="/" className="flex justify-center">
          <h1 className="text-3xl font-bold text-primary-600">AbstructionAI</h1>
        </Link>
      </div>

      <div className={`mt-6 w-full ${
        isRegisterPage 
          ? 'px-2 sm:px-4' 
          : 'sm:mx-auto sm:max-w-md px-4'
      }`}>
        <div className={`bg-white shadow ${
          isRegisterPage 
            ? 'w-full rounded-none sm:rounded-lg py-6 px-3 sm:px-6' 
            : 'py-8 px-4 sm:rounded-lg sm:px-10'
        }`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;