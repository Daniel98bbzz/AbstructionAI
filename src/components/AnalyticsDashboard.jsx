import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const AnalyticsDashboard = ({ userId = null, isUserSpecific = false }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    popularity: null,
    timeline: null,
    engagement: null,
    trends: null,
    clusters: null
  });

  // Real-time and filtering state
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filters, setFilters] = useState({
    timeframe: '7d',
    startDate: '',
    endDate: '',
    userSegment: 'all',
    topicFilter: '',
    minSessions: 1
  });

  const intervalRef = useRef(null);
  const POLLING_INTERVAL = 10000; // 10 seconds

  // Fetch analytics data with filters
  const fetchAnalytics = useCallback(async (filterOptions = filters) => {
    try {
      // Use relative URLs for better deployment compatibility
      const baseUrl = `/api/analytics${isUserSpecific ? '/self' : ''}`;
      
      // Build query parameters
      const params = new URLSearchParams();
      Object.entries(filterOptions).forEach(([key, value]) => {
        if (value && value !== 'all') {
          params.append(key, value);
        }
      });
      
      const queryString = params.toString();
      const urlSuffix = queryString ? `?${queryString}` : '';

      const [popularityRes, timelineRes, engagementRes, trendsRes, clustersRes] = await Promise.all([
        fetch(`${baseUrl}/topics/popularity${urlSuffix}`),
        fetch(`${baseUrl}/topics/timeline${urlSuffix}`),
        fetch(`${baseUrl}/users/engagement${urlSuffix}`),
        fetch(`${baseUrl}/topics/trends${urlSuffix}`),
        fetch(`${baseUrl}/clusters/distribution${urlSuffix}`)
      ]);

      // Check response status and handle errors
      const responses = [popularityRes, timelineRes, engagementRes, trendsRes, clustersRes];
      const responseLabels = ['popularity', 'timeline', 'engagement', 'trends', 'clusters'];
      
      for (let i = 0; i < responses.length; i++) {
        if (!responses[i].ok) {
          console.error(`Analytics ${responseLabels[i]} endpoint failed:`, responses[i].status, responses[i].statusText);
        }
      }

      const [popularity, timeline, engagement, trends, clusters] = await Promise.all([
        popularityRes.ok ? popularityRes.json() : { error: `Failed to fetch popularity data (${popularityRes.status})` },
        timelineRes.ok ? timelineRes.json() : { error: `Failed to fetch timeline data (${timelineRes.status})` },
        engagementRes.ok ? engagementRes.json() : { error: `Failed to fetch engagement data (${engagementRes.status})` },
        trendsRes.ok ? trendsRes.json() : { error: `Failed to fetch trends data (${trendsRes.status})` },
        clustersRes.ok ? clustersRes.json() : { error: `Failed to fetch clusters data (${clustersRes.status})` }
      ]);

      setAnalytics({ popularity, timeline, engagement, trends, clusters });
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Set error state for better user feedback
      setAnalytics({
        popularity: { error: 'Failed to load analytics data' },
        timeline: { error: 'Failed to load analytics data' },
        engagement: { error: 'Failed to load analytics data' },
        trends: { error: 'Failed to load analytics data' },
        clusters: { error: 'Failed to load analytics data' }
      });
    } finally {
      setLoading(false);
    }
  }, [filters, isUserSpecific]);

  // Handle filter changes
  const handleFilterChange = (filterKey, value) => {
    const newFilters = { ...filters, [filterKey]: value };
    setFilters(newFilters);
    setLoading(true);
    fetchAnalytics(newFilters);
  };

  // Reset filters
  const resetFilters = () => {
    const defaultFilters = {
      timeframe: '7d',
      startDate: '',
      endDate: '',
      userSegment: 'all',
      topicFilter: '',
      minSessions: 1
    };
    setFilters(defaultFilters);
    setLoading(true);
    fetchAnalytics(defaultFilters);
  };

  // Initial data fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Real-time polling setup
  useEffect(() => {
    if (isRealTimeEnabled) {
      intervalRef.current = setInterval(() => {
        fetchAnalytics();
      }, POLLING_INTERVAL);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRealTimeEnabled, fetchAnalytics]);

  // Chart configurations
  const getTopicPopularityChart = () => {
    if (!analytics.popularity?.popular_topics) return null;
    
    let topics = analytics.popularity.popular_topics;
    
    // Apply topic filter if set
    if (filters.topicFilter) {
      topics = topics.filter(topic => 
        topic.topic_name.toLowerCase().includes(filters.topicFilter.toLowerCase())
      );
    }
    
    // Apply minimum sessions filter
    topics = topics.filter(topic => topic.session_count >= filters.minSessions);
    
    const topTopics = topics.slice(0, 10);
    
    return {
      labels: topTopics.map(topic => topic.topic_name.replace(/_/g, ' ')),
      datasets: [{
        label: 'Sessions',
        data: topTopics.map(topic => topic.session_count),
        backgroundColor: [
          '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B',
          '#EC4899', '#6366F1', '#84CC16', '#F97316', '#06B6D4'
        ],
        borderWidth: 1
      }]
    };
  };

  const getEngagementChart = () => {
    if (!analytics.engagement?.engagement_distribution) return null;
    
    const data = analytics.engagement.engagement_distribution;
    
    return {
      labels: Object.keys(data),
      datasets: [{
        data: Object.values(data),
        backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'],
        hoverBackgroundColor: ['#059669', '#2563EB', '#D97706', '#DC2626']
      }]
    };
  };

  const getTrendsChart = () => {
    if (!analytics.trends?.trends) return null;
    
    let trends = analytics.trends.trends;
    
    // Apply topic filter if set
    if (filters.topicFilter) {
      trends = trends.filter(topic => 
        topic.topic_name.toLowerCase().includes(filters.topicFilter.toLowerCase())
      );
    }
    
    const trendingTopics = trends.slice(0, 8);
    
    return {
      labels: trendingTopics.map(topic => topic.topic_name.replace(/_/g, ' ')),
      datasets: [
        {
          label: 'Recent Sessions',
          data: trendingTopics.map(topic => topic.recent_sessions),
          backgroundColor: '#3B82F6',
          borderColor: '#2563EB',
          borderWidth: 1
        },
        {
          label: 'Previous Sessions',
          data: trendingTopics.map(topic => topic.previous_sessions),
          backgroundColor: '#9CA3AF',
          borderColor: '#6B7280',
          borderWidth: 1
        }
      ]
    };
  };

  const getTimelineChart = () => {
    if (!analytics.timeline?.timeline_data) return null;
    
    const timelineData = analytics.timeline.timeline_data;
    const dates = Object.keys(timelineData).sort();
    
    // Get top topics for the timeline
    const allTopics = new Set();
    Object.values(timelineData).forEach(dayData => {
      Object.keys(dayData).forEach(topic => allTopics.add(topic));
    });
    
    let topTopics = Array.from(allTopics);
    
    // Apply topic filter if set
    if (filters.topicFilter) {
      topTopics = topTopics.filter(topic => 
        topic.toLowerCase().includes(filters.topicFilter.toLowerCase())
      );
    }
    
    topTopics = topTopics.slice(0, 5);
    const colors = ['#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B'];
    
    return {
      labels: dates,
      datasets: topTopics.map((topic, index) => ({
        label: topic.replace(/_/g, ' '),
        data: dates.map(date => timelineData[date]?.[topic] || 0),
        borderColor: colors[index],
        backgroundColor: colors[index] + '20',
        tension: 0.1,
        fill: true
      }))
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📊 {isUserSpecific ? 'Personal' : 'System'} Analytics Dashboard
            </h1>
            <p className="text-gray-600">
              {isUserSpecific 
                ? 'Your personal learning analytics and progress insights' 
                : 'Comprehensive insights into topic popularity, user engagement, and learning trends across all users'
              }
            </p>
          </div>
          
          {/* Real-time toggle */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="realtime"
                checked={isRealTimeEnabled}
                onChange={(e) => setIsRealTimeEnabled(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="realtime" className="text-sm font-medium text-gray-700">
                Real-time Updates
              </label>
            </div>
            {lastUpdated && (
              <p className="text-xs text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Timeframe Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
              <select 
                value={filters.timeframe}
                onChange={(e) => handleFilterChange('timeframe', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="1d">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Date Range */}
            {filters.timeframe === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {/* User Segment Filter (only for admin view) */}
            {!isUserSpecific && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Segment</label>
                <select 
                  value={filters.userSegment}
                  onChange={(e) => handleFilterChange('userSegment', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="all">All Users</option>
                  <option value="new">New Users (&lt; 7 days)</option>
                  <option value="active">Active Users</option>
                  <option value="returning">Returning Users</option>
                </select>
              </div>
            )}

            {/* Topic Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic Filter</label>
              <input
                type="text"
                placeholder="Search topics..."
                value={filters.topicFilter}
                onChange={(e) => handleFilterChange('topicFilter', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            {/* Minimum Sessions Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Sessions</label>
              <input
                type="number"
                min="1"
                value={filters.minSessions}
                onChange={(e) => handleFilterChange('minSessions', parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            {/* Reset Filters Button */}
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full bg-gray-600 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-700 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              📚
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Topics</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics.popularity?.unique_topics || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              👥
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics.engagement?.total_users || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              💬
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics.popularity?.total_sessions || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-orange-100 text-orange-600">
              🎯
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Learning Clusters</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics.clusters?.total_clusters || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        {[
          { id: 'overview', label: '📈 Overview' },
          { id: 'topics', label: '📚 Topic Analytics' },
          { id: 'users', label: '👥 User Engagement' },
          { id: 'trends', label: '📊 Growth Trends' }
        ].map(tab => (
          <button
            key={tab.id}
            className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Topic Popularity */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">🔥 Most Popular Topics</h3>
            {getTopicPopularityChart() && (
              <Bar data={getTopicPopularityChart()} options={chartOptions} />
            )}
          </div>

          {/* User Engagement Distribution */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">👥 User Engagement Levels</h3>
            {getEngagementChart() && (
              <Doughnut data={getEngagementChart()} options={pieOptions} />
            )}
          </div>
        </div>
      )}

      {activeTab === 'topics' && (
        <div className="space-y-6">
          {/* Timeline Controls */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">📈 Topic Activity Timeline</h3>
              <select 
                value={filters.timeframe} 
                onChange={(e) => handleFilterChange('timeframe', e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
            {getTimelineChart() && (
              <Line data={getTimelineChart()} options={chartOptions} />
            )}
          </div>

          {/* Topic List */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">📚 All Topics Statistics</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Topic</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analytics.popularity?.popular_topics?.map((topic, index) => (
                    <tr key={topic.topic_name}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {topic.topic_name.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {topic.session_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {topic.percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Engagement */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">👥 User Engagement Distribution</h3>
            {getEngagementChart() && (
              <Pie data={getEngagementChart()} options={pieOptions} />
            )}
          </div>

          {/* Engagement Stats */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Engagement Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Users:</span>
                <span className="font-semibold">{analytics.engagement?.total_users}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Sessions:</span>
                <span className="font-semibold">{analytics.engagement?.total_sessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Sessions/User:</span>
                <span className="font-semibold">{analytics.engagement?.avg_sessions_per_user}</span>
              </div>
              
              <div className="mt-6 space-y-2">
                <h4 className="font-medium text-gray-900">User Levels:</h4>
                {analytics.engagement?.engagement_distribution && Object.entries(analytics.engagement.engagement_distribution).map(([level, count]) => (
                  <div key={level} className="flex justify-between text-sm">
                    <span className="text-gray-600">{level}:</span>
                    <span className="font-medium">{count} users</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="space-y-6">
          {/* Growth Trends Chart */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">📈 Topic Growth Trends</h3>
            <p className="text-sm text-gray-600 mb-4">{analytics.trends?.period}</p>
            {getTrendsChart() && (
              <Bar data={getTrendsChart()} options={chartOptions} />
            )}
          </div>

          {/* Trends Table */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">📊 Detailed Growth Analysis</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Topic</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Previous</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Growth</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analytics.trends?.trends?.map((topic) => (
                    <tr key={topic.topic_name}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {topic.topic_name.replace(/_/g, ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {topic.recent_sessions}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {topic.previous_sessions}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {topic.growth_percentage === 'New' ? 'New' : `${topic.growth_percentage}%`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          topic.trend === 'up' ? 'bg-green-100 text-green-800' :
                          topic.trend === 'down' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {topic.trend === 'up' ? '📈 Growing' : 
                           topic.trend === 'down' ? '📉 Declining' : 
                           '➖ Stable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard; 