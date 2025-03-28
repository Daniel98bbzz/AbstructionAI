// src/main.jsx - Updated with QuizProvider
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { QueryProvider } from './contexts/QueryContext';
import { QuizProvider } from './contexts/QuizContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <QueryProvider>
          <QuizProvider>
            <App />
          </QuizProvider>
        </QueryProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);