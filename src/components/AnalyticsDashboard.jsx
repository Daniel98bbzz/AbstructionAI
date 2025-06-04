import React, { useState, useEffect } from 'react';
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

const AnalyticsDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState({
    popularity: null,
    timeline: null,
    engagement: null,
    trends: null,
    clusters: null
  });
  const [timeframe, setTimeframe] = useState('7d');

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const baseUrl = 'http://localhost:3001/api/analytics';
        
        const [popularityRes, timelineRes, engagementRes, trendsRes, clustersRes] = await Promise.all([
          fetch(`${baseUrl}/topics/popularity`),
          fetch(`${baseUrl}/topics/timeline?timeframe=${timeframe}`),
          fetch(`${baseUrl}/users/engagement`),
          fetch(`${baseUrl}/topics/trends`),
          fetch(`${baseUrl}/clusters/distribution`)
        ]);

        const [popularity, timeline, engagement, trends, clusters] = await Promise.all([
          popularityRes.json(),
          timelineRes.json(),
          engagementRes.json(),
          trendsRes.json(),
          clustersRes.json()
        ]);

        setAnalytics({ popularity, timeline, engagement, trends, clusters });
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeframe]);

  // Chart configurations
  const getTopicPopularityChart = () => {
    if (!analytics.popularity?.popular_topics) return null;
    
    const topTopics = analytics.popularity.popular_topics.slice(0, 10);
    
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
    
    const trendingTopics = analytics.trends.trends.slice(0, 8);
    
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
    
    const topTopics = Array.from(allTopics).slice(0, 5);
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📊 System Analytics Dashboard</h1>
        <p className="text-gray-600">Comprehensive insights into topic popularity, user engagement, and learning trends across all users</p>
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
          { id: 'overview', label: '📈 Overview', icon: '📈' },
          { id: 'topics', label: '📚 Topic Analytics', icon: '📚' },
          { id: 'users', label: '👥 User Engagement', icon: '👥' },
          { id: 'trends', label: '📊 Growth Trends', icon: '📊' }
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
                value={timeframe} 
                onChange={(e) => setTimeframe(e.target.value)}
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