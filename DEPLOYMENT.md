# Vercel Deployment Guide for AbstructionAI

This guide walks you through deploying both the frontend and backend of your AbstructionAI project to Vercel.

## Prerequisites

1. **Vercel Account**: Create a free account at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Your code should be in a GitHub repository
3. **Environment Variables**: Have your API keys ready

## Step 1: Environment Variables Setup

Before deploying, you'll need to set up environment variables. Copy the `env.example` file to create your own environment configuration:

### Required Environment Variables:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Frontend API URL (will be set after deployment)
VITE_API_URL=https://your-vercel-domain.vercel.app

# Vercel Configuration
VERCEL=1
NODE_ENV=production
```

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Navigate to your project directory**:
   ```bash
   cd AbstructionAI
   ```

3. **Login to Vercel**:
   ```bash
   vercel login
   ```

4. **Deploy**:
   ```bash
   vercel
   ```

5. **Set environment variables**:
   ```bash
   vercel env add OPENAI_API_KEY
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_ANON_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   ```

### Option B: Deploy via Vercel Dashboard

1. **Connect GitHub Repository**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Build Settings**:
   - Framework Preset: `Other`
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Add Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add all the required environment variables from the list above

4. **Deploy**:
   - Click "Deploy"
   - Wait for the deployment to complete

## Step 3: Update Frontend API URL

After deployment, you'll get a Vercel URL like `https://your-app-name.vercel.app`. You need to:

1. **Update the VITE_API_URL environment variable**:
   - In Vercel Dashboard: Project Settings → Environment Variables
   - Update `VITE_API_URL` to your Vercel domain URL

2. **Redeploy** to apply the changes

## Step 4: Verify Deployment

1. **Check Frontend**: Visit your Vercel URL to ensure the React app loads
2. **Check Backend**: Visit `https://your-vercel-url.vercel.app/api/health` to verify the API is working
3. **Test Full Flow**: Try using the application end-to-end

## Project Structure for Vercel

```
AbstructionAI/
├── api/
│   └── index.js          # Serverless function entry point
├── dist/                 # Built frontend (generated)
├── server/
│   └── index.js          # Express server (exported for serverless)
├── src/                  # React frontend source
├── vercel.json           # Vercel configuration
├── package.json
└── vite.config.js        # Vite configuration
```

## How It Works

1. **Frontend**: Built as static files using Vite and served from Vercel's CDN
2. **Backend**: Runs as serverless functions using Vercel's Node.js runtime
3. **API Routes**: All `/api/*` requests are routed to the serverless function
4. **Database**: Supabase (cloud-hosted, no deployment needed)

## Troubleshooting

### Common Issues:

1. **Build Fails**:
   - Check that all dependencies are in `package.json`
   - Ensure environment variables are set correctly
   - Check the build logs in Vercel dashboard

2. **API Routes Don't Work**:
   - Verify `vercel.json` configuration
   - Check that environment variables are set
   - Ensure the serverless function is properly exported

3. **Frontend Can't Connect to Backend**:
   - Check `VITE_API_URL` environment variable
   - Verify the API URL is correct
   - Check browser console for CORS errors

### Debugging Tips:

1. **Check Vercel Function Logs**:
   - Go to Vercel Dashboard → Functions tab
   - View real-time logs for your serverless functions

2. **Test API Endpoints**:
   - Use tools like Postman or curl to test API endpoints directly
   - Check `https://your-domain.vercel.app/api/health`

3. **Local Development**:
   - Use `npm run dev:full` for local development
   - Test the build locally with `npm run build && npm run preview`

## Performance Optimization

1. **Serverless Function Cold Starts**:
   - Functions may take longer on first request
   - Consider using Vercel Pro for faster cold starts

2. **Static Asset Optimization**:
   - Vercel automatically optimizes static assets
   - Consider using Vercel's Image Optimization for images

3. **Caching**:
   - API responses are cached based on your implementation
   - Static assets are cached automatically

## Scaling Considerations

1. **Serverless Function Limits**:
   - 10-second execution limit on Hobby plan
   - 30-second limit configured in `vercel.json`

2. **Database Connections**:
   - Supabase handles connection pooling
   - Consider implementing connection optimization for high traffic

3. **Monitoring**:
   - Use Vercel Analytics for performance monitoring
   - Set up error tracking (Sentry, etc.)

## Next Steps

1. **Custom Domain**: Set up a custom domain in Vercel settings
2. **Environment Separation**: Create separate deployments for staging/production
3. **CI/CD**: Set up automatic deployments on GitHub pushes
4. **Monitoring**: Add application monitoring and error tracking

---

Your AbstructionAI project is now ready for Vercel deployment! 🚀 