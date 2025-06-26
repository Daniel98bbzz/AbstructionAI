import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const TopicsAdmin = () => {
  const [stats, setStats] = useState(null);
  const [similarTopics, setSimilarTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMergePair, setSelectedMergePair] = useState(null);
  const [selectedSplitTopic, setSelectedSplitTopic] = useState(null);
  const [mergeAnalysis, setMergeAnalysis] = useState(null);
  const [splitAnalysis, setSplitAnalysis] = useState(null);

  useEffect(() => {
    fetchTopicStats();
    fetchSimilarTopics();
  }, []);

  const fetchTopicStats = async () => {
    try {
      const response = await fetch('/api/admin/topic-curation-stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      } else {
        toast.error('Failed to fetch topic statistics');
      }
    } catch (error) {
      console.error('Error fetching topic stats:', error);
      toast.error('Error loading topic statistics');
    }
  };

  const fetchSimilarTopics = async () => {
    try {
      const response = await fetch('/api/admin/similar-topics?similarityThreshold=0.7&minUsageCount=2');
      const data = await response.json();
      
      if (data.success) {
        setSimilarTopics(data.similarTopics);
      }
    } catch (error) {
      console.error('Error fetching similar topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeMerge = async (topic1, topic2) => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/merge-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic1, topic2 }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMergeAnalysis(data.analysis);
        setSelectedMergePair({ topic1, topic2 });
      } else {
        toast.error('Failed to analyze merge');
      }
    } catch (error) {
      console.error('Error analyzing merge:', error);
      toast.error('Error analyzing topic merge');
    } finally {
      setLoading(false);
    }
  };

  const executeMerge = async (topic1, topic2) => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/merge-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic1, topic2, executeImmediately: true }),
      });
      
      const data = await response.json();
      
      if (data.success && data.executed) {
        toast.success(`Successfully merged "${data.result.secondaryTopic}" into "${data.result.primaryTopic}"`);
        // Refresh data
        await fetchTopicStats();
        await fetchSimilarTopics();
        setSelectedMergePair(null);
        setMergeAnalysis(null);
      } else {
        toast.error('Failed to execute merge');
      }
    } catch (error) {
      console.error('Error executing merge:', error);
      toast.error('Error executing topic merge');
    } finally {
      setLoading(false);
    }
  };

  const analyzeSplit = async (topicName) => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/split-topic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topicName, maxSuggestedSplits: 4 }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSplitAnalysis(data.analysis);
        setSelectedSplitTopic(topicName);
      } else {
        toast.error('Failed to analyze split');
      }
    } catch (error) {
      console.error('Error analyzing split:', error);
      toast.error('Error analyzing topic split');
    } finally {
      setLoading(false);
    }
  };

  const executeSplit = async (topicName) => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/split-topic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topicName, executeImmediately: true }),
      });
      
      const data = await response.json();
      
      if (data.success && data.executed) {
        toast.success(`Successfully created ${data.result.newTopics.length} new topics from "${topicName}"`);
        // Refresh data
        await fetchTopicStats();
        await fetchSimilarTopics();
        setSelectedSplitTopic(null);
        setSplitAnalysis(null);
      } else {
        toast.error('Failed to execute split');
      }
    } catch (error) {
      console.error('Error executing split:', error);
      toast.error('Error executing topic split');
    } finally {
      setLoading(false);
    }
  };

  const formatTopicName = (name) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getSimilarityColor = (score) => {
    if (score >= 0.9) return 'text-red-600 bg-red-100';
    if (score >= 0.8) return 'text-orange-600 bg-orange-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  const getConfidenceColor = (confidence) => {
    if (confidence === 'high') return 'text-green-600 bg-green-100';
    if (confidence === 'medium') return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  if (loading && !stats) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Topic Curation Admin</h1>
        <p className="text-gray-600">Manage topic merging, splitting, and optimization</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Total Topics</div>
            <div className="text-2xl font-bold text-gray-900">{stats.overview.totalTopics}</div>
            <div className="text-xs text-gray-500">{stats.overview.activeTopics} active</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Total Usage</div>
            <div className="text-2xl font-bold text-gray-900">{stats.overview.totalUsage.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Avg: {stats.overview.averageUsage}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Merge Opportunities</div>
            <div className="text-2xl font-bold text-orange-600">{stats.curationOpportunities.mergeCandidates}</div>
            <div className="text-xs text-gray-500">{stats.curationOpportunities.similarPairs} similar pairs</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Split Candidates</div>
            <div className="text-2xl font-bold text-blue-600">{stats.curationOpportunities.splitCandidates}</div>
            <div className="text-xs text-gray-500">{stats.curationOpportunities.highUsageTopics} high usage</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'merge', label: 'Merge Topics' },
            { id: 'split', label: 'Split Topics' },
            { id: 'analytics', label: 'Analytics' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Topics by Usage</h3>
            <div className="space-y-2">
              {stats.topTopics.map((topic, index) => (
                <div key={topic.name} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                    <span className="text-sm font-medium text-gray-900">{formatTopicName(topic.name)}</span>
                  </div>
                  <span className="text-sm text-gray-600">{topic.usage_count} uses</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">High-Confidence Merge Candidates</h3>
              <div className="space-y-3">
                {stats.mergeCandidates.filter(pair => pair.mergeRecommendation.confidence === 'high').map((pair, index) => (
                  <div key={index} className="p-3 bg-orange-50 rounded border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatTopicName(pair.topic1.name)} + {formatTopicName(pair.topic2.name)}
                        </div>
                        <div className="text-xs text-gray-600">
                          Similarity: {(pair.similarityScore * 100).toFixed(1)}%
                        </div>
                      </div>
                      <button
                        onClick={() => analyzeMerge(pair.topic1.name, pair.topic2.name)}
                        className="text-xs px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700"
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Split Candidates</h3>
              <div className="space-y-3">
                {stats.splitCandidates.map((topic, index) => (
                  <div key={index} className="p-3 bg-blue-50 rounded border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{formatTopicName(topic.name)}</div>
                        <div className="text-xs text-gray-600">{topic.usage_count} uses</div>
                      </div>
                      <button
                        onClick={() => analyzeSplit(topic.name)}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'merge' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Similar Topic Pairs</h3>
            <div className="space-y-4">
              {similarTopics.map((pair, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium text-gray-900">
                          {formatTopicName(pair.topic1.name)} + {formatTopicName(pair.topic2.name)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Usage: {pair.topic1.usage_count} + {pair.topic2.usage_count} = {pair.topic1.usage_count + pair.topic2.usage_count}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSimilarityColor(pair.similarityScore)}`}>
                        {(pair.similarityScore * 100).toFixed(1)}% similar
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(pair.mergeRecommendation.confidence)}`}>
                        {pair.mergeRecommendation.confidence} confidence
                      </span>
                      <button
                        onClick={() => analyzeMerge(pair.topic1.name, pair.topic2.name)}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        disabled={loading}
                      >
                        Analyze Merge
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {pair.mergeRecommendation.recommendation}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Merge Analysis Modal */}
          {selectedMergePair && mergeAnalysis && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Merge Analysis: {formatTopicName(selectedMergePair.topic1)} + {formatTopicName(selectedMergePair.topic2)}
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedMergePair(null);
                        setMergeAnalysis(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded">
                        <div className="text-sm font-medium text-gray-500">Compatibility Score</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {(mergeAnalysis.compatibility * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded">
                        <div className="text-sm font-medium text-gray-500">Can Merge</div>
                        <div className={`text-2xl font-bold ${mergeAnalysis.canMerge ? 'text-green-600' : 'text-red-600'}`}>
                          {mergeAnalysis.canMerge ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">Suggested Name</div>
                      <div className="p-3 bg-blue-50 rounded text-sm">{mergeAnalysis.suggestedName}</div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">Impact Analysis</div>
                      <div className="p-3 bg-gray-50 rounded text-sm space-y-1">
                        <div>Total Usage: {mergeAnalysis.impactAnalysis.totalUsage}</div>
                        <div>Affected Sessions: {mergeAnalysis.impactAnalysis.affectedSessions}</div>
                        <div>User Impact: {mergeAnalysis.impactAnalysis.userImpact}</div>
                        <div>Data Risk: {mergeAnalysis.impactAnalysis.dataIntegrityRisk}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">Implementation Steps</div>
                      <div className="space-y-2">
                        {mergeAnalysis.mergeSteps.map((step, index) => (
                          <div key={index} className="flex items-start space-x-3 text-sm">
                            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                              {step.step}
                            </span>
                            <div>
                              <div className="font-medium">{step.action.replace(/_/g, ' ')}</div>
                              <div className="text-gray-600">{step.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {mergeAnalysis.canMerge && (
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          onClick={() => {
                            setSelectedMergePair(null);
                            setMergeAnalysis(null);
                          }}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => executeMerge(selectedMergePair.topic1, selectedMergePair.topic2)}
                          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                          disabled={loading}
                        >
                          {loading ? 'Executing...' : 'Execute Merge'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'split' && stats && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">High Usage Topics (Split Candidates)</h3>
            <div className="space-y-4">
              {stats.splitCandidates.map((topic, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{formatTopicName(topic.name)}</div>
                      <div className="text-sm text-gray-600">
                        {topic.usage_count} uses • Created {new Date(topic.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => analyzeSplit(topic.name)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      disabled={loading}
                    >
                      Analyze Split
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Split Analysis Modal */}
          {selectedSplitTopic && splitAnalysis && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Split Analysis: {formatTopicName(selectedSplitTopic)}
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedSplitTopic(null);
                        setSplitAnalysis(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {splitAnalysis.shouldSplit ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded">
                          <div className="text-sm font-medium text-gray-500">Split Score</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {(splitAnalysis.splitScore * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded">
                          <div className="text-sm font-medium text-gray-500">Complexity</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {splitAnalysis.impactAnalysis.implementationComplexity}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Suggested Split Topics</div>
                        <div className="space-y-2">
                          {splitAnalysis.suggestedSplits.map((suggestion, index) => (
                            <div key={index} className="p-3 bg-blue-50 rounded border border-blue-200">
                              <div className="font-medium text-sm">{formatTopicName(suggestion.name)}</div>
                              <div className="text-xs text-gray-600">{suggestion.description}</div>
                              <div className="text-xs text-gray-500">
                                Est. usage: {suggestion.estimatedUsage} • Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Implementation Steps</div>
                        <div className="space-y-2">
                          {splitAnalysis.implementationSteps.map((step, index) => (
                            <div key={index} className="flex items-start space-x-3 text-sm">
                              <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                                {step.step}
                              </span>
                              <div>
                                <div className="font-medium">{step.action.replace(/_/g, ' ')}</div>
                                <div className="text-gray-600">{step.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          onClick={() => {
                            setSelectedSplitTopic(null);
                            setSplitAnalysis(null);
                          }}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => executeSplit(selectedSplitTopic)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          disabled={loading}
                        >
                          {loading ? 'Executing...' : 'Execute Split'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-gray-500 mb-2">Topic is not suitable for splitting</div>
                      <div className="text-sm text-gray-400">{splitAnalysis.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && stats && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Topic Curation Opportunities</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-orange-600">{stats.curationOpportunities.mergeCandidates}</div>
                <div className="text-sm text-gray-600">High-confidence merge candidates</div>
                <div className="text-xs text-gray-500">
                  {stats.curationOpportunities.similarPairs} total similar pairs found
                </div>
              </div>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-blue-600">{stats.curationOpportunities.splitCandidates}</div>
                <div className="text-sm text-gray-600">Topics suitable for splitting</div>
                <div className="text-xs text-gray-500">
                  {stats.curationOpportunities.highUsageTopics} high usage topics
                </div>
              </div>
              <div className="text-center p-4">
                <div className="text-3xl font-bold text-gray-600">{stats.curationOpportunities.lowUsageTopics}</div>
                <div className="text-sm text-gray-600">Low usage topics</div>
                <div className="text-xs text-gray-500">May need consolidation</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Distribution</h3>
            <div className="text-sm text-gray-600">
              Average topic usage: {stats.overview.averageUsage} sessions
            </div>
            <div className="text-sm text-gray-600">
              Total active topics: {stats.overview.activeTopics}
            </div>
            <div className="text-sm text-gray-600">
              Last updated: {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Unknown'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopicsAdmin; 