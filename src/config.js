// API URL configuration for both development and production
export const API_URL = import.meta.env.MODE === 'development' 
  ? 'http://localhost:3001'
  : window.location.origin; // Use the same domain in production 