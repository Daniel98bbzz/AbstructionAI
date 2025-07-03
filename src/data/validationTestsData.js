// src/data/validationTestsData.js
// Mock data structure for validation tests with detailed information

export const validationTestsData = {
  clustering: {
    id: "clustering",
    title: "Clustering Validation",
    purpose: "To organize users and content based on thematic similarity for personalization. This system groups similar queries, topics, and user behaviors to enable more accurate content recommendations and adaptive learning paths.",
    method: "Uses UMAP (Uniform Manifold Approximation and Projection) for dimensionality reduction combined with K-Means clustering. Evaluated via silhouette score (measures cluster separation), Davies-Bouldin index (cluster compactness vs separation), and load testing with synthetic users to ensure scalability.",
    importance: "Enables accurate content recommendations, adaptive learning, and personalized educational experiences. Poor clustering leads to irrelevant suggestions and decreased learning efficiency.",
    results: [
      { metric: "Silhouette Score", value: 0.61, threshold: ">= 0.3", status: "good" },
      { metric: "Davies-Bouldin Index", value: 1.42, threshold: "<= 2.0", status: "good" },
      { metric: "Cluster Balance", value: "Good", threshold: "Balanced", status: "good" },
      { metric: "Processing Time", value: "2.3s", threshold: "< 5s", status: "good" },
      { metric: "Memory Usage", value: "45MB", threshold: "< 100MB", status: "good" }
    ],
    technicalDetails: {
      algorithm: "UMAP + K-Means",
      parameters: {
        "n_neighbors": 15,
        "min_dist": 0.1,
        "n_components": 2,
        "n_clusters": 8
      },
      dataSource: "User queries and content topics",
      updateFrequency: "Daily at 3 AM UTC"
    }
  },

  "crowd-wisdom": {
    id: "crowd-wisdom",
    title: "Crowd Wisdom System",
    purpose: "To leverage collective intelligence for improving content quality and learning outcomes. This system aggregates feedback from multiple users to identify high-quality content and learning materials.",
    method: "Compares enhanced feedback mechanisms (weighted ratings, contextual feedback) against normal rating systems. Uses statistical analysis to measure improvement rates and content quality correlation.",
    importance: "Ensures high-quality educational content reaches learners, improves content curation, and helps identify knowledge gaps in the system.",
    results: [
      { metric: "Enhanced Rating Avg", value: 4.2, threshold: ">= 3.5", status: "good" },
      { metric: "Normal Rating Avg", value: 3.8, threshold: ">= 3.0", status: "good" },
      { metric: "Improvement Rate", value: "15.3%", threshold: ">= 5%", status: "good" },
      { metric: "Participation Rate", value: "67%", threshold: ">= 50%", status: "good" },
      { metric: "Content Quality Score", value: 4.1, threshold: ">= 4.0", status: "good" }
    ],
    technicalDetails: {
      algorithm: "Weighted consensus with bias correction",
      parameters: {
        "min_votes": 3,
        "weight_decay": 0.95,
        "bias_threshold": 0.2
      },
      dataSource: "User feedback and ratings",
      updateFrequency: "Real-time with hourly aggregation"
    }
  },

  quizzes: {
    id: "quizzes",
    title: "Quiz System Validation",
    purpose: "To ensure quiz generation creates appropriate difficulty levels, covers relevant topics, and provides meaningful assessment of learning progress.",
    method: "Analyzes quiz score distributions, topic coverage breadth, difficulty progression, and correlation with learning outcomes. Uses both automated metrics and A/B testing.",
    importance: "Accurate assessment drives personalized learning paths and helps identify areas where students need additional support.",
    results: [
      { metric: "Average Score", value: "72.4%", threshold: ">= 30%", status: "good" },
      { metric: "Topic Coverage", value: "12 topics", threshold: ">= 3", status: "good" },
      { metric: "Difficulty Balance", value: "Optimal", threshold: "Balanced", status: "good" },
      { metric: "Completion Rate", value: "84%", threshold: ">= 70%", status: "good" },
      { metric: "Time to Complete", value: "4.2 min", threshold: "< 10 min", status: "good" }
    ],
    technicalDetails: {
      algorithm: "Adaptive difficulty with IRT (Item Response Theory)",
      parameters: {
        "difficulty_range": [-2, 2],
        "discrimination_min": 0.5,
        "guessing_factor": 0.25
      },
      dataSource: "Student responses and content database",
      updateFrequency: "After each quiz session"
    }
  },

  flashcards: {
    id: "flashcards",
    title: "Flashcard System Validation",
    purpose: "To validate that flashcard generation matches appropriate topics, maintains optimal review intervals, and supports effective spaced repetition learning.",
    method: "Evaluates topic matching accuracy using semantic similarity, measures retention rates across different review intervals, and analyzes user engagement patterns.",
    importance: "Effective flashcards improve long-term retention and help students maintain knowledge over time through scientifically-backed spaced repetition.",
    results: [
      { metric: "Topic Match Accuracy", value: "78.5%", threshold: ">= 70%", status: "good" },
      { metric: "Coverage Score", value: "82.1%", threshold: ">= 60%", status: "good" },
      { metric: "Retention Rate", value: "71%", threshold: ">= 65%", status: "good" },
      { metric: "Review Compliance", value: "59%", threshold: ">= 50%", status: "good" },
      { metric: "Average Review Time", value: "45s", threshold: "< 120s", status: "good" }
    ],
    technicalDetails: {
      algorithm: "Spaced Repetition System (SRS) with forgetting curve",
      parameters: {
        "initial_interval": 1,
        "ease_factor": 2.5,
        "max_interval": 365
      },
      dataSource: "Learning content and user performance",
      updateFrequency: "After each review session"
    }
  },

  analogies: {
    id: "analogies",
    title: "Analogy Generation Validation",
    purpose: "To ensure AI-generated analogies are relevant, diverse, and help students understand complex concepts through familiar comparisons.",
    method: "Tests analogy usage rates, domain diversity (variety of comparison subjects), semantic relevance scores, and user comprehension improvement metrics.",
    importance: "Good analogies significantly improve concept understanding and make complex topics more accessible to learners with different backgrounds.",
    results: [
      { metric: "Usage Rate", value: "64.2%", threshold: ">= 60%", status: "good" },
      { metric: "Unique Domains", value: 8, threshold: ">= 3", status: "good" },
      { metric: "Relevance Score", value: "4.3/5", threshold: ">= 4.0", status: "good" },
      { metric: "Comprehension Boost", value: "+23%", threshold: ">= 15%", status: "good" },
      { metric: "Average Length", value: "87 chars", threshold: "50-150", status: "good" }
    ],
    technicalDetails: {
      algorithm: "GPT-based generation with semantic filtering",
      parameters: {
        "temperature": 0.7,
        "max_tokens": 150,
        "similarity_threshold": 0.75
      },
      dataSource: "Concept database and analogy corpus",
      updateFrequency: "Generated on-demand, cached for 24h"
    }
  },

  analytics: {
    id: "analytics",
    title: "Analytics Engine Validation",
    purpose: "To ensure data consistency, accurate metric calculation, and reliable reporting across all system analytics and user progress tracking.",
    method: "Validates data integrity through consistency checks, time-series validation, cross-metric correlation analysis, and load testing of analytics pipelines.",
    importance: "Accurate analytics drive educational decisions, progress tracking, and system optimizations. Incorrect data leads to poor user experience and ineffective learning.",
    results: [
      { metric: "Data Consistency", value: "99.2%", threshold: ">= 90%", status: "good" },
      { metric: "Time Consistency", value: "Valid", threshold: "Valid", status: "good" },
      { metric: "Query Performance", value: "1.8s", threshold: "< 3s", status: "good" },
      { metric: "Data Freshness", value: "< 5 min", threshold: "< 15 min", status: "good" },
      { metric: "Error Rate", value: "0.1%", threshold: "< 1%", status: "good" }
    ],
    technicalDetails: {
      algorithm: "Real-time aggregation with batch validation",
      parameters: {
        "batch_size": 1000,
        "validation_window": "24h",
        "outlier_threshold": 3
      },
      dataSource: "User interactions and system logs",
      updateFrequency: "Real-time with 5-minute validation cycles"
    }
  },

  "session-continuity": {
    id: "session-continuity",
    title: "Session Continuity Validation",
    purpose: "To ensure seamless user experience across multiple learning sessions, maintaining context, progress, and personalization state.",
    method: "Tests multi-interaction sessions, context preservation across page reloads, state synchronization, and recovery from connection interruptions.",
    importance: "Session continuity prevents learning disruption, maintains engagement, and ensures students can pick up exactly where they left off.",
    results: [
      { metric: "Continuity Rate", value: "89.3%", threshold: ">= 30%", status: "good" },
      { metric: "Context Preservation", value: "76.8%", threshold: ">= 20%", status: "good" },
      { metric: "State Recovery", value: "94.1%", threshold: ">= 80%", status: "good" },
      { metric: "Session Duration", value: "24.5 min", threshold: ">= 10 min", status: "good" },
      { metric: "Reconnection Success", value: "97.2%", threshold: ">= 90%", status: "good" }
    ],
    technicalDetails: {
      algorithm: "State persistence with incremental updates",
      parameters: {
        "save_interval": 30,
        "session_timeout": 3600,
        "max_state_size": "1MB"
      },
      dataSource: "User session data and browser state",
      updateFrequency: "Continuous with 30-second checkpoints"
    }
  }
};

// Helper function to get test data by ID
export const getValidationTestById = (testId) => {
  return validationTestsData[testId] || null;
};

// Helper function to get all test IDs
export const getAllTestIds = () => {
  return Object.keys(validationTestsData);
};

// Helper function to get test summary for main dashboard
export const getTestSummary = (testId) => {
  const test = validationTestsData[testId];
  if (!test) return null;
  
  return {
    id: test.id,
    title: test.title,
    description: test.purpose.split('.')[0] + '.',
    icon: getTestIcon(testId),
    color: getTestColor(testId)
  };
};

// Helper function to get test icon
export const getTestIcon = (testId) => {
  const icons = {
    clustering: '🔮',
    'crowd-wisdom': '🧠',
    quizzes: '📝',
    flashcards: '📚',
    analogies: '🎭',
    analytics: '📊',
    'session-continuity': '🔗'
  };
  return icons[testId] || '🔍';
};

// Helper function to get test color
export const getTestColor = (testId) => {
  const colors = {
    clustering: 'blue',
    'crowd-wisdom': 'purple',
    quizzes: 'green',
    flashcards: 'orange',
    analogies: 'pink',
    analytics: 'indigo',
    'session-continuity': 'teal'
  };
  return colors[testId] || 'gray';
}; 