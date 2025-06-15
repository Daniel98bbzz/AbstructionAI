import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Clustering Service for AbstructionAI
 * Manages the execution of the Python HDBSCAN clustering pipeline
 */
class ClusteringService {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.lastResult = null;
        this.pythonScriptPath = path.join(process.cwd(), 'cluster_questions_realtime.py');
    }

    /**
     * Check if the Python clustering script exists
     */
    async checkScriptExists() {
        try {
            await fs.access(this.pythonScriptPath);
            return true;
        } catch (error) {
            console.error(`❌ Python clustering script not found at: ${this.pythonScriptPath}`);
            return false;
        }
    }

    /**
     * Run the clustering pipeline
     * @param {Object} options - Clustering options
     * @param {boolean} options.fullRecluster - Whether to recluster all questions (default: false)
     * @param {boolean} options.background - Whether to run in background (default: true)
     * @returns {Promise<Object>} - Result object with success status and details
     */
    async runClustering(options = {}) {
        const { fullRecluster = false, background = true } = options;

        if (this.isRunning) {
            return {
                success: false,
                error: 'Clustering is already running',
                isRunning: true
            };
        }

        // Check if script exists
        const scriptExists = await this.checkScriptExists();
        if (!scriptExists) {
            return {
                success: false,
                error: 'Python clustering script not found',
                scriptPath: this.pythonScriptPath
            };
        }

        this.isRunning = true;
        this.lastRun = new Date();

        const args = ['py', this.pythonScriptPath];
        if (fullRecluster) {
            args.push('--full-recluster');
        }

        console.log(`🚀 Starting clustering pipeline: ${args.join(' ')}`);

        return new Promise((resolve) => {
            const child = spawn(args[0], args.slice(1), {
                stdio: background ? 'pipe' : 'inherit',
                cwd: process.cwd()
            });

            let stdout = '';
            let stderr = '';

            if (background) {
                child.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    console.log(`[Clustering] ${output.trim()}`);
                });

                child.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    console.error(`[Clustering Error] ${output.trim()}`);
                });
            }

            child.on('close', (code) => {
                this.isRunning = false;
                const success = code === 0;
                
                this.lastResult = {
                    success,
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    timestamp: new Date(),
                    fullRecluster
                };

                if (success) {
                    console.log('✅ Clustering pipeline completed successfully');
                    this.loadClusterExport().then(exportData => {
                        resolve({
                            success: true,
                            code,
                            message: 'Clustering completed successfully',
                            clusters: exportData?.length || 0,
                            exportData,
                            stdout: stdout.trim()
                        });
                    }).catch(() => {
                        resolve({
                            success: true,
                            code,
                            message: 'Clustering completed successfully (export data unavailable)',
                            stdout: stdout.trim()
                        });
                    });
                } else {
                    console.error(`❌ Clustering pipeline failed with code ${code}`);
                    resolve({
                        success: false,
                        code,
                        error: `Clustering failed with exit code ${code}`,
                        stderr: stderr.trim(),
                        stdout: stdout.trim()
                    });
                }
            });

            child.on('error', (error) => {
                this.isRunning = false;
                console.error('❌ Failed to start clustering process:', error);
                
                this.lastResult = {
                    success: false,
                    error: error.message,
                    timestamp: new Date(),
                    fullRecluster
                };

                resolve({
                    success: false,
                    error: `Failed to start clustering process: ${error.message}`
                });
            });
        });
    }

    /**
     * Load the exported cluster data from JSON file
     */
    async loadClusterExport() {
        try {
            const exportPath = path.join(process.cwd(), 'semantic_clusters_export.json');
            const data = await fs.readFile(exportPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.warn('⚠️ Could not load cluster export data:', error.message);
            return null;
        }
    }

    /**
     * Get the current status of the clustering service
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            lastResult: this.lastResult,
            scriptPath: this.pythonScriptPath
        };
    }

    /**
     * Schedule clustering to run periodically (e.g., daily)
     * @param {number} intervalHours - Hours between runs (default: 24)
     */
    schedulePeriodicClustering(intervalHours = 24) {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        
        console.log(`📅 Scheduling clustering to run every ${intervalHours} hours`);
        
        setInterval(async () => {
            console.log('⏰ Running scheduled clustering...');
            const result = await this.runClustering({ background: true });
            
            if (result.success) {
                console.log(`✅ Scheduled clustering completed. Found ${result.clusters || 0} clusters.`);
            } else {
                console.error('❌ Scheduled clustering failed:', result.error);
            }
        }, intervalMs);
    }

    /**
     * Run clustering only if there are enough new unassigned interactions
     * @param {number} minNewInteractions - Minimum number of new interactions to trigger clustering
     */
    async runClusteringIfNeeded(minNewInteractions = 10) {
        // This would require a Supabase query to count unassigned interactions
        // For now, we'll just run the clustering and let the Python script handle the logic
        console.log(`🔍 Checking if clustering is needed (min ${minNewInteractions} new interactions)...`);
        
        const result = await this.runClustering({ background: true });
        
        if (result.success && result.stdout.includes('No embeddings found')) {
            console.log('ℹ️ No new interactions to cluster');
            return { success: true, message: 'No new interactions to cluster' };
        }
        
        return result;
    }
}

// Export singleton instance
const clusteringService = new ClusteringService();

export { ClusteringService, clusteringService }; 