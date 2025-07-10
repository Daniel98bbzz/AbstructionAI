# Deployment Guide

## Quick Deploy Instructions

Your project is now ready for deployment with minimal code changes! Here's how to deploy:

### 1. Production Environment Setup

Before deploying, create a `.env.production` file in your project root with the following variables:

```env
# Production Environment Configuration
NODE_ENV=production
PORT=3001

# JWT Secret - Use a strong, unique secret for production
JWT_SECRET=your-super-strong-jwt-secret-here

# OpenAI API - Your OpenAI API Key
OPENAI_API_KEY=your-openai-api-key-here

# Supabase Configuration (same as development)
VITE_SUPABASE_URL=https://rffmhloewrvoolkozedw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZm1obG9ld3J2b29sa296ZWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MzkwMjEsImV4cCI6MjA1NjMxNTAyMX0.iiJ56P5S2cFT9xz4VX0fwQM7dPgkMBRe9RBgps4keZw

SUPABASE_URL=https://rffmhloewrvoolkozedw.supabase.co/
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmZm1obG9ld3J2b29sa296ZWR3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDczOTAyMSwiZXhwIjoyMDU2MzE1MDIxfQ.FL_iwulYc38RrpXeJqD3V1Uaqw-uDRAtVbTVlo9abkM
```

### 2. Build and Deploy Commands

```bash
# Build the production version
npm run build:production

# Start the production server
npm start

# Or build and start in one command
npm run deploy
```

### 3. Platform-Specific Deployment

#### Option A: Deploy to Render (Recommended)
1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set the build command: `npm run build:production`
4. Set the start command: `npm start`
5. Add environment variables in Render's dashboard

#### Option B: Deploy to Railway
1. Connect your GitHub repository to Railway
2. Set the build command: `npm run build:production`
3. Set the start command: `npm start`
4. Add environment variables in Railway's dashboard

#### Option C: Deploy to Heroku
1. Install Heroku CLI
2. Create a Heroku app: `heroku create your-app-name`
3. Set environment variables: `heroku config:set NODE_ENV=production`
4. Deploy: `git push heroku main`

#### Option D: Deploy to DigitalOcean App Platform
1. Connect your GitHub repository
2. Set the build command: `npm run build:production`
3. Set the run command: `npm start`
4. Add environment variables in the dashboard

### 4. Environment Variables for Production

Make sure to set these environment variables in your deployment platform:

- `NODE_ENV=production`
- `PORT=3001` (or whatever port your platform uses)
- `JWT_SECRET=your-strong-secret`
- `OPENAI_API_KEY=your-openai-key`
- `VITE_SUPABASE_URL=your-supabase-url`
- `VITE_SUPABASE_ANON_KEY=your-supabase-anon-key`
- `SUPABASE_URL=your-supabase-url`
- `SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key`

### 5. What Changed

The following minimal changes were made to enable production deployment:

1. **Added production scripts** in `package.json`:
   - `build:production`: Builds the React app for production
   - `start`: Starts the server in production mode
   - `deploy`: Builds and starts in one command

2. **Modified `server/index.js`**:
   - Added static file serving for the built React app
   - Added fallback route for React Router to work in production

3. **No other code changes required** - your existing development setup remains unchanged!

### 6. Testing Locally

To test the production build locally:

```bash
# Build the production version
npm run build:production

# Start in production mode
NODE_ENV=production npm start
```

Your app will be available at `http://localhost:3001` (no separate frontend server needed).

### 7. Important Notes

- **Database**: Your Supabase database will work the same in production
- **OpenAI API**: Make sure your OpenAI API key has sufficient credits
- **Security**: Use a strong JWT secret for production
- **Domain**: Update CORS settings if needed for your production domain

### 8. Troubleshooting

If you encounter issues:

1. **Build fails**: Check that all dependencies are installed with `npm install`
2. **Static files not served**: Ensure `NODE_ENV=production` is set
3. **API calls fail**: Check that environment variables are properly set
4. **React Router issues**: The fallback route should handle this automatically

Your AbstructionAI project is now production-ready! 🚀 