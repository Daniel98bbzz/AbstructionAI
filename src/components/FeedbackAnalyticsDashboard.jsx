import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement
);

const FeedbackAnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('week');

  useEffect(() => {
    fetchAnalytics();
  }, [timeframe]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary data including trends, quality, and themes
      const response = await fetch('/api/feedback/summary');
      const data = await response.json();

      if (data.success) {
        setAnalyticsData(data.data);
      } else {
        setError(data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      setError('Error fetching analytics: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateThemes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/feedback/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numClusters: 5,
          minQuality: 30
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh analytics to show new themes
        await fetchAnalytics();
      } else {
        setError(data.error || 'Failed to generate themes');
      }
    } catch (err) {
      setError('Error generating themes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Error loading analytics
            </h3>
            <div className="mt-2 text-sm text-red-700">
              {error}
            </div>
            <div className="mt-4">
              <button
                onClick={fetchAnalytics}
                className="bg-red-100 px-4 py-2 rounded-md text-red-800 hover:bg-red-200"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No analytics data available</p>
      </div>
    );
  }

  // Prepare chart data
  const trendsData = {
    labels: analyticsData.weeklyTrends?.trends?.map(t => t.period) || [],
    datasets: [
      {
        label: 'Positive',
        data: analyticsData.weeklyTrends?.trends?.map(t => t.positive) || [],
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
      },
      {
        label: 'Negative',
        data: analyticsData.weeklyTrends?.trends?.map(t => t.negative) || [],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
      },
      {
        label: 'Neutral',
        data: analyticsData.weeklyTrends?.trends?.map(t => t.neutral) || [],
        backgroundColor: 'rgba(156, 163, 175, 0.8)',
      },
    ],
  };

  const qualityData = {
    labels: ['Low Quality (0-30)', 'Medium Quality (31-70)', 'High Quality (71-100)'],
    datasets: [
      {
        data: [
          analyticsData.qualityDistribution?.distribution?.byQualityRange?.low || 0,
          analyticsData.qualityDistribution?.distribution?.byQualityRange?.medium || 0,
          analyticsData.qualityDistribution?.distribution?.byQualityRange?.high || 0,
        ],
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(34, 197, 94, 0.8)',
        ],
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };

  return (
    <div className="p-6 bg-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Feedback Analytics Dashboard
        </h1>
        <p className="text-gray-600">
          Monitor feedback trends, quality, and themes across your application
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-blue-800">Total Feedback</h3>
          <p className="text-2xl font-bold text-blue-900">
            {analyticsData.qualityDistribution?.distribution?.total || 0}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-green-800">Avg Quality Score</h3>
          <p className="text-2xl font-bold text-green-900">
            {Math.round(analyticsData.qualityDistribution?.distribution?.overall?.avgQuality || 0)}
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-purple-800">Active Themes</h3>
          <p className="text-2xl font-bold text-purple-900">
            {analyticsData.topThemes?.length || 0}
          </p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-orange-800">High Quality %</h3>
          <p className="text-2xl font-bold text-orange-900">
            {analyticsData.qualityDistribution?.distribution?.total > 0
              ? Math.round((analyticsData.qualityDistribution.distribution.byQualityRange.high / analyticsData.qualityDistribution.distribution.total) * 100)
              : 0}%
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Feedback Trends */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Weekly Feedback Trends</h2>
          <Bar data={trendsData} options={chartOptions} />
        </div>

        {/* Quality Distribution */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Quality Distribution</h2>
          <div className="h-64 flex items-center justify-center">
            <Doughnut data={qualityData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Sentiment by Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Sentiment Analysis</h2>
          <div className="space-y-3">
            {Object.entries(analyticsData.qualityDistribution?.distribution?.bySentiment || {}).map(([sentiment, data]) => (
              <div key={sentiment} className="flex justify-between items-center">
                <span className="capitalize font-medium">{sentiment}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Count: {data.total}</span>
                  <span className="text-sm text-gray-600">
                    Avg Quality: {Math.round(data.avgQuality || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Analytics Actions</h2>
          <div className="space-y-3">
            <button
              onClick={generateThemes}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Regenerate Feedback Themes'}
            </button>
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh Analytics
            </button>
            <div className="text-sm text-gray-500 mt-2">
              Last updated: {new Date(analyticsData.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Themes */}
      {analyticsData.topThemes && analyticsData.topThemes.length > 0 && (
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Feedback Themes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analyticsData.topThemes.map((theme, index) => (
              <div key={index} className="border rounded-lg p-4">
                <h3 className="font-medium mb-2">Theme {index + 1}</h3>
                <p className="text-sm text-gray-600 mb-2">
                  Size: {theme.size} feedback items
                </p>
                {theme.themes && theme.themes.topWords && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-gray-700">Top words:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {theme.themes.topWords.slice(0, 5).map((word, i) => (
                        <span key={i} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {word.word} ({word.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {theme.themes && theme.themes.sampleMessages && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-1">Sample:</p>
                    <p className="text-xs text-gray-600 italic">
                      "{theme.themes.sampleMessages[0]?.substring(0, 100)}..."
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackAnalyticsDashboard; 