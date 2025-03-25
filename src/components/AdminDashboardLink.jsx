import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function AdminDashboardLink() {
  const { user } = useAuth();
  
  // Check if user has admin role
  const isAdmin = user && (
    user.user_metadata?.role === 'admin' || 
    user.email === 'admin@example.com' // Add your admin email here or other verification logic
  );
  
  if (!isAdmin) {
    return null;
  }
  
  return (
    <Link 
      to="/admin/feedback" 
      className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-secondary-600 hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500"
    >
      Admin Dashboard
    </Link>
  );
}

export default AdminDashboardLink;