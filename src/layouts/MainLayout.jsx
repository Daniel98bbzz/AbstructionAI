// src/layouts/MainLayout.jsx - Updated with Quiz link
import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Check if current route is the query page (which needs full width)
  const isQueryPage = location.pathname === '/query';
  
  // Check if user has admin role
  const isAdmin = user && (
    user.user_metadata?.role === 'admin' || 
    user.email === 'admin@example.com' // Add your admin email here
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link to="/" className="text-2xl font-bold text-primary-600">
                  AbstructionAI
                </Link>
              </div>
              <nav className="ml-6 flex space-x-8">
                <Link to="/" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                  Home
                </Link>
                {user && (
                  <>
                    <Link to="/dashboard" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      Dashboard
                    </Link>
                    <Link to="/query" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      New Query
                    </Link>
                    <Link to="/quiz" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      Quizzes
                    </Link>
                    <Link to="/progress" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      Progress
                    </Link>
                    <Link to="/history" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      History
                    </Link>
                    <Link to="/crowd-wisdom" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                      🧠 Crowd Wisdom
                    </Link>
                    {isAdmin && (
                      <>
                        <div className="border-l border-gray-300 mx-2"></div>
                        <Link to="/admin/analytics" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                          Analytics
                        </Link>
                        <Link to="/admin/feedbacks" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                          Feedbacks
                        </Link>
                      </>
                    )}
                  </>
                )}
              </nav>
            </div>
            <div className="flex items-center">
              {user ? (
                <div className="flex items-center space-x-4">
                  <Link to="/profile" className="text-sm font-medium text-gray-700 hover:text-gray-800">
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-800">
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow">
        {isQueryPage ? (
          // For QueryPage, use full width without container constraints
          <Outlet />
        ) : (
          // For other pages, use the normal container layout
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} AbstructionAI. All rights reserved.
            </div>
            <div className="flex space-x-6">
              <a href="#" className="text-gray-400 hover:text-gray-500">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-500">
                Terms of Service
              </a>
              <a href="#" className="text-gray-400 hover:text-gray-500">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;