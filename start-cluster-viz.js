// Simple script to start the server with the cluster visualization available
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import open from 'open';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use port 3003 to avoid conflicts
const PORT = 3003;

// Function to kill any existing processes on the specified port
async function killExistingProcess() {
  try {
    console.log(`Looking for existing process on port ${PORT}...`);
    
    // Find process on the port (works on macOS/Linux)
    const { stdout } = await execAsync(`lsof -i :${PORT} -t`);
    
    if (!stdout.trim()) {
      console.log(`No existing process found on port ${PORT}.`);
      return;
    }
    
    const pids = stdout.trim().split('\n');
    console.log(`Found ${pids.length} processes on port ${PORT}: ${pids.join(', ')}`);
    
    // Kill each process
    for (const pid of pids) {
      console.log(`Killing process ${pid}...`);
      await execAsync(`kill -9 ${pid}`);
    }
    
    console.log('All existing processes killed.');
  } catch (error) {
    // If lsof doesn't find anything, it will exit with error code 1
    if (error.code === 1) {
      console.log(`No existing process found on port ${PORT}.`);
    } else {
      console.error('Error killing existing process:', error);
    }
  }
}

async function startServer() {
  // First kill any existing process
  await killExistingProcess();
  
  console.log(`Starting the AbstructionAI server with interest-based clustering on port ${PORT}...`);

  // Start the server with custom port
  const server = spawn('node', ['server/index.js', `--port=${PORT}`], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: PORT.toString()
    }
  });

  // Wait a moment for the server to start
  setTimeout(async () => {
    try {
      // Open the cluster visualization in the default browser
      console.log('Opening the cluster visualization in your browser...');
      await open(`http://localhost:${PORT}/cluster-visualization.html`);
      
      console.log('\nCluster visualization is ready!');
      console.log('The visualization now shows interest-based clustering including sports, cooking, etc.');
      console.log('Press Ctrl+C to stop the server when finished.');
    } catch (error) {
      console.error('Error opening browser:', error);
    }
  }, 3000);

  // Handle server exit
  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Server process exited with code ${code}`);
    }
    process.exit(code);
  });

  // Handle script termination
  process.on('SIGINT', () => {
    console.log('\nStopping server...');
    server.kill('SIGINT');
  });
}

// Start everything
startServer(); 