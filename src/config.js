const isDevelopment = import.meta.env.DEV;

export const API_URL = isDevelopment 
  ? 'http://localhost:3001' 
  : import.meta.env.VITE_API_URL || window.location.origin; 