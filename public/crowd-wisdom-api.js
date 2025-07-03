/**
 * Crowd Wisdom API Integration
 * Connects the dashboard to real Supabase data
 */

class CrowdWisdomAPI {
    constructor(baseUrl = 'http://localhost:3002') {
        this.baseUrl = baseUrl;
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
    }

    async fetchWithCache(endpoint, options = {}) {
        const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/crowd-wisdom${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            this.cache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async getClusters(timeRange = '24h') {
        return this.fetchWithCache('/clusters', {
            method: 'GET',
            body: JSON.stringify({ timeRange })
        });
    }

    async getSystemStats(timeRange = '24h') {
        return this.fetchWithCache('/stats', {
            method: 'GET',
            body: JSON.stringify({ timeRange })
        });
    }

    async getLearningEvents(timeRange = '24h', clusterId = null) {
        const params = new URLSearchParams({ timeRange });
        if (clusterId) params.append('clusterId', clusterId);
        
        return this.fetchWithCache(`/learning-events?${params.toString()}`);
    }

    async getClusterHistory(clusterId) {
        return this.fetchWithCache(`/clusters/${clusterId}/history`);
    }

    async getQueryAssignments(timeRange = '24h', clusterId = null) {
        const params = new URLSearchParams({ timeRange });
        if (clusterId) params.append('clusterId', clusterId);
        
        return this.fetchWithCache(`/query-assignments?${params.toString()}`);
    }

    // Real-time WebSocket connection for live updates
    connectWebSocket(onMessage) {
        const ws = new WebSocket(`ws://localhost:3000/ws/crowd-wisdom`);
        
        ws.onopen = () => {
            console.log('🔗 Connected to crowd wisdom WebSocket');
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
        
        ws.onclose = () => {
            console.log('🔌 Disconnected from crowd wisdom WebSocket');
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.connectWebSocket(onMessage), 5000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        return ws;
    }

    clearCache() {
        this.cache.clear();
    }
}

// Export for use in the dashboard
window.CrowdWisdomAPI = CrowdWisdomAPI; 