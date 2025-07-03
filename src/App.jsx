// src/App.jsx - Updated with Quiz Route
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import QueryPage from './pages/QueryPage';
import QuizPage from './pages/QuizPage'; // Import the new quiz page
import History from './pages/History';
import NotFound from './pages/NotFound';
import VerifyEmail from './pages/VerifyEmail';
import FeedbackList from './pages/admin/FeedbackList';
import TopicsAdmin from './pages/admin/TopicsAdmin';
import FeedbacksPage from './pages/FeedbacksPage';
import FeedbackDetailPage from './pages/FeedbackDetailPage';
import ProgressDashboard from './components/ProgressDashboard';
import UserAnalytics from './pages/UserAnalytics';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import CrowdWisdomVisualizer from './components/CrowdWisdomVisualizer';

// Protected route component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
    </div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Admin route component
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
    </div>;
  }
  
  // Check if user has admin role
  const isAdmin = user && (
    user.user_metadata?.role === 'admin' || 
    user.email === 'admin@example.com' // Add your admin email here or other verification logic
  );
  
  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
        </Route>
        
        {/* Auth routes */}
        <Route path="/" element={<AuthLayout />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="verify-email" element={<VerifyEmail />} />
        </Route>
        
        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="query" element={<QueryPage />} />
          <Route path="quiz" element={<QuizPage />} /> {/* New quiz route */}
          <Route path="history" element={<History />} />
          <Route path="progress" element={<ProgressDashboard />} />
          <Route path="analytics" element={<UserAnalytics />} />
          <Route path="crowd-wisdom" element={<CrowdWisdomVisualizer />} />
        </Route>
        
        {/* Admin routes */}
        <Route path="/admin" element={
          <AdminRoute>
            <MainLayout />
          </AdminRoute>
        }>
          <Route path="feedbacks" element={<FeedbacksPage />} />
          <Route path="feedbacks/:id" element={<FeedbackDetailPage />} />
          <Route path="feedback" element={<FeedbackList />}>
            <Route path=":feedbackId" element={<FeedbackList />} />
          </Route>
          <Route path="topics" element={<TopicsAdmin />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
        </Route>
        
        {/* 404 route */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default App;