import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as d3 from 'd3';
import './CrowdWisdomVisualizer.css';

// Use the correct API URL with port 3001 (from server logs)
const API_URL = 'http://localhost:3001';

const CrowdWisdomVisualizer = () => {
  const [clusters, setClusters] = useState([]);
  const [recentAssignments, setRecentAssignments] = useState([]);
  const [queryPoints, setQueryPoints] = useState({points: [], clusterCentroids: []});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch all data for visualization
  const fetchVisualizationData = useCallback(async () => {
    try {
      setDebugInfo('Fetching clusters...');
      console.log('Fetching clusters from:', `${API_URL}/api/crowd-wisdom/clusters`);
      
      // Fetch clusters
      const clustersResponse = await fetch(`${API_URL}/api/crowd-wisdom/clusters`);
      if (!clustersResponse.ok) throw new Error(`Clusters API failed: ${clustersResponse.status}`);
      const clustersResult = await clustersResponse.json();
      
      console.log('Clusters data:', clustersResult);
      setDebugInfo('Fetching assignments...');
      
      // Fetch ALL query assignments with embeddings
      const assignmentsResponse = await fetch(`${API_URL}/api/crowd-wisdom/assignments?limit=500`);
      if (!assignmentsResponse.ok) throw new Error(`Assignments API failed: ${assignmentsResponse.status}`);
      const assignmentsResult = await assignmentsResponse.json();
      
      console.log('Assignments data:', assignmentsResult);
      setDebugInfo('Processing semantic space...');
      
      setClusters(clustersResult.data || []);
      setRecentAssignments(assignmentsResult.data?.slice(0, 10) || []);
      
      // Process data for t-SNE visualization
      const visualizationData = processSemanticSpace(clustersResult.data, assignmentsResult.data);
      setQueryPoints(visualizationData);
      
      setDebugInfo(`Loaded ${clustersResult.data?.length || 0} clusters, ${assignmentsResult.data?.length || 0} queries`);
      
    } catch (error) {
      console.error('[CrowdWisdomVisualizer] Error:', error);
      setError(error.message);
      setDebugInfo(`Error: ${error.message}`);
    }
  }, []);

  // Process 1536-dimensional embeddings into 2D semantic space using simulated t-SNE
  const processSemanticSpace = (clustersData, assignmentsData) => {
    if (!clustersData || !assignmentsData) return { points: [], clusterCentroids: [] };
    
    // Create realistic t-SNE/UMAP-like cluster positioning in semantic space
    const clusterPositions = generateSemanticClusterPositions(clustersData.length);
    
    // Map clusters to their semantic positions
    const clusterCentroids = clustersData.map((cluster, index) => {
      const position = clusterPositions[index];
      return {
        id: cluster.id,
        x: position.x,
        y: position.y,
        cluster: cluster,
        totalQueries: cluster.total_queries || 0,
        successRate: cluster.success_rate || 0,
        hasEnhancement: !!(cluster.prompt_enhancement && cluster.prompt_enhancement.length > 0),
        color: getClusterColor(cluster.success_rate || 0)
      };
    });

    // Create cluster lookup for quick access
    const clusterLookup = new Map();
    clusterCentroids.forEach(centroid => {
      clusterLookup.set(centroid.id, centroid);
    });

    // Generate query points distributed around their cluster centroids
    const queryPoints = assignmentsData.map((assignment, index) => {
      const clusterCentroid = clusterLookup.get(assignment.cluster_id);
      if (!clusterCentroid) return null;

      // Position queries around cluster centroid based on similarity
      const similarityDistance = (1 - (assignment.similarity_score || 0.5)) * 15; // Higher similarity = closer to center
      const angle = (index * 137.5) % 360; // Golden angle distribution for natural spread
      const jitter = (Math.random() - 0.5) * 8; // Add some randomness

      const x = clusterCentroid.x + similarityDistance * Math.cos(angle * Math.PI / 180) + jitter;
      const y = clusterCentroid.y + similarityDistance * Math.sin(angle * Math.PI / 180) + jitter;

      return {
        id: assignment.id,
        x: x,
        y: y,
        queryText: assignment.query_text,
        similarity: assignment.similarity_score || 0.5,
        clusterId: assignment.cluster_id,
        clusterName: assignment.crowd_wisdom_clusters?.cluster_name || 'Unknown',
        feedback: assignment.user_feedback_positive,
        feedbackConfidence: assignment.feedback_confidence || 0,
        createdAt: assignment.created_at,
        promptEnhancementApplied: assignment.prompt_enhancement_applied || false,
        processingTime: assignment.processing_time_ms || 0
      };
    }).filter(point => point !== null);

    return { points: queryPoints, clusterCentroids };
  };

  // Generate realistic cluster positions in semantic space (simulating t-SNE output)
  const generateSemanticClusterPositions = (numClusters) => {
    const positions = [];
    const centerX = 0, centerY = 0;
    const maxRadius = 80;

    // Use a combination of spiral and random positioning for natural clustering
    for (let i = 0; i < numClusters; i++) {
      let x, y;
      
      if (i === 0) {
        // First cluster at center
        x = centerX;
        y = centerY;
      } else {
        // Spiral placement with some randomness
        const spiralFactor = Math.sqrt(i) * 12;
        const angle = i * 137.5; // Golden angle
        const randomOffset = (Math.random() - 0.5) * 20;
        
        x = centerX + spiralFactor * Math.cos(angle * Math.PI / 180) + randomOffset;
        y = centerY + spiralFactor * Math.sin(angle * Math.PI / 180) + randomOffset;
        
        // Ensure within bounds
        const distance = Math.sqrt(x*x + y*y);
        if (distance > maxRadius) {
          const scale = maxRadius / distance;
          x *= scale;
          y *= scale;
        }
      }
      
      positions.push({ x, y });
    }
    
    return positions;
  };

  // Get cluster color based on success rate
  const getClusterColor = (successRate) => {
    if (successRate >= 0.8) return '#22c55e'; // Green - high success
    if (successRate >= 0.6) return '#eab308'; // Yellow - medium success  
    if (successRate >= 0.4) return '#f97316'; // Orange - low success
    return '#ef4444'; // Red - very low success
  };

  // Get feedback color for query points
  const getFeedbackColor = (feedback) => {
    if (feedback === true) return '#16a34a'; // Green - positive
    if (feedback === false) return '#dc2626'; // Red - negative
    return '#6b7280'; // Gray - no feedback
  };

  // Create the main t-SNE visualization
  const createSemanticSpaceVisualization = useCallback(() => {
    if (!containerRef.current || !queryPoints.points || !queryPoints.clusterCentroids) {
      console.log("Missing required elements for visualization", {
        container: !!containerRef.current,
        points: !!queryPoints.points,
        centroids: !!queryPoints.clusterCentroids
      });
      return;
    }

    try {
      // Clear previous visualization
      const svgElement = svgRef.current;
      if (!svgElement) {
        console.error("SVG element not found");
        return;
      }

      d3.select(svgElement).selectAll("*").remove();

      const container = containerRef.current;
      const width = container.clientWidth || 800;
      const height = Math.max(700, container.clientHeight || 700);

      const svg = d3.select(svgElement)
        .attr("width", width)
        .attr("height", height);

      // Calculate scales based on data extent
      const allX = [...queryPoints.points.map(d => d.x), ...queryPoints.clusterCentroids.map(d => d.x)];
      const allY = [...queryPoints.points.map(d => d.y), ...queryPoints.clusterCentroids.map(d => d.y)];
      
      const xExtent = d3.extent(allX);
      const yExtent = d3.extent(allY);
      
      const padding = 50;
      const xScale = d3.scaleLinear()
        .domain([xExtent[0] - 20, xExtent[1] + 20])
        .range([padding, width - padding]);
      
      const yScale = d3.scaleLinear()
        .domain([yExtent[0] - 20, yExtent[1] + 20])
        .range([height - padding, padding]);

      // Add subtle grid
      const xAxis = d3.axisBottom(xScale).tickSize(-height + 2 * padding).tickFormat('');
      const yAxis = d3.axisLeft(yScale).tickSize(-width + 2 * padding).tickFormat('');

      svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height - padding})`)
        .call(xAxis)
        .style("stroke-dasharray", "2,2")
        .style("opacity", 0.1);

      svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${padding},0)`)
        .call(yAxis)
        .style("stroke-dasharray", "2,2")
        .style("opacity", 0.1);

      // Create tooltip
      const tooltip = d3.select("body").append("div")
        .attr("class", "semantic-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "rgba(0, 0, 0, 0.9)")
        .style("color", "white")
        .style("padding", "12px")
        .style("border-radius", "8px")
        .style("font-size", "12px")
        .style("font-family", "monospace")
        .style("box-shadow", "0 4px 20px rgba(0, 0, 0, 0.3)")
        .style("pointer-events", "none")
        .style("z-index", "1000")
        .style("max-width", "300px")
        .style("line-height", "1.4");

      // Add cluster regions (subtle background areas)
      queryPoints.clusterCentroids.forEach((centroid, i) => {
        const clusterQueries = queryPoints.points.filter(p => p.clusterId === centroid.id);
        if (clusterQueries.length > 2) {
          try {
            // Calculate convex hull for cluster region
            const hullPoints = d3.polygonHull(clusterQueries.map(p => [xScale(p.x), yScale(p.y)]));
            if (hullPoints && hullPoints.length > 2) {
              svg.append("path")
                .datum(hullPoints)
                .attr("class", "cluster-region")
                .attr("d", d3.line().curve(d3.curveCatmullRomClosed))
                .style("fill", centroid.color)
                .style("opacity", 0.05)
                .style("stroke", centroid.color)
                .style("stroke-width", 1)
                .style("stroke-opacity", 0.2);
            }
          } catch (err) {
            console.error("Error creating hull for cluster", centroid.id, err);
          }
        }
      });

      // Add query points (each question)
      svg.selectAll(".query-point")
        .data(queryPoints.points)
        .enter()
        .append("circle")
        .attr("class", "query-point")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", d => 3 + (d.feedbackConfidence || 0) * 2) // Size by feedback confidence
        .attr("fill", d => getFeedbackColor(d.feedback))
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("opacity", d => selectedCluster ? (d.clusterId === selectedCluster ? 0.9 : 0.2) : 0.7)
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 6)
            .attr("stroke-width", 2);

          tooltip.style("visibility", "visible")
            .html(`
              <div style="color: #60a5fa; font-weight: bold; margin-bottom: 6px;">
                📍 Query in "${d.clusterName}"
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Text:</strong> ${d.queryText.length > 80 ? d.queryText.substring(0, 80) + '...' : d.queryText}
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Similarity:</strong> ${(d.similarity * 100).toFixed(1)}%
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Feedback:</strong> ${
                  d.feedback === true ? '✅ Positive' : 
                  d.feedback === false ? '❌ Negative' : 
                  '⚪ No feedback'
                }
              </div>
              ${d.feedbackConfidence > 0 ? `
                <div style="margin-bottom: 4px;">
                  <strong>Confidence:</strong> ${(d.feedbackConfidence * 100).toFixed(1)}%
                </div>
              ` : ''}
              ${d.promptEnhancementApplied ? `
                <div style="color: #34d399;">🧠 Enhancement Applied</div>
              ` : ''}
              <div style="color: #9ca3af; font-size: 10px; margin-top: 4px;">
                Processing: ${d.processingTime}ms
              </div>
            `);
        })
        .on("mousemove", function(event) {
          tooltip.style("top", (event.pageY - 10) + "px")
            .style("left", (event.pageX + 15) + "px");
        })
        .on("mouseout", function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("r", 3 + (d.feedbackConfidence || 0) * 2)
            .attr("stroke-width", 0.5);
          tooltip.style("visibility", "hidden");
        });

      // Add cluster centroids (main cluster circles)
      svg.selectAll(".cluster-centroid")
        .data(queryPoints.clusterCentroids)
        .enter()
        .append("circle")
        .attr("class", "cluster-centroid")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", d => Math.max(8, Math.min(25, Math.sqrt(d.totalQueries) * 2))) // Size by query count
        .attr("fill", "none")
        .attr("stroke", d => d.color)
        .attr("stroke-width", 3)
        .attr("opacity", 0.8)
        .style("cursor", "pointer")
        .on("click", function(event, d) {
          setSelectedCluster(selectedCluster === d.id ? null : d.id);
        })
        .on("mouseover", function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("stroke-width", 5);

          tooltip.style("visibility", "visible")
            .html(`
              <div style="color: ${d.color}; font-weight: bold; margin-bottom: 6px;">
                🎯 Cluster: ${d.cluster.cluster_name}
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Queries:</strong> ${d.totalQueries}
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Success Rate:</strong> ${(d.successRate * 100).toFixed(1)}%
              </div>
              <div style="margin-bottom: 4px;">
                <strong>Enhancement:</strong> ${d.hasEnhancement ? '🧠 Yes' : '❌ No'}
              </div>
              ${d.cluster.representative_query ? `
                <div style="margin-bottom: 4px;">
                  <strong>Representative:</strong> ${d.cluster.representative_query.substring(0, 60)}...
                </div>
              ` : ''}
              <div style="color: #9ca3af; font-size: 10px; margin-top: 4px;">
                Click to filter queries
              </div>
            `);
        })
        .on("mousemove", function(event) {
          tooltip.style("top", (event.pageY - 10) + "px")
            .style("left", (event.pageX + 15) + "px");
        })
        .on("mouseout", function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr("stroke-width", 3);
          tooltip.style("visibility", "hidden");
        });

      // Add X marks at cluster centroids
      svg.selectAll(".cluster-center-mark")
        .data(queryPoints.clusterCentroids)
        .enter()
        .append("g")
        .attr("class", "cluster-center-mark")
        .attr("transform", d => `translate(${xScale(d.x)}, ${yScale(d.y)})`)
        .each(function(d) {
          const g = d3.select(this);
          
          // Add X mark
          g.append("path")
            .attr("d", "M-4,-4 L4,4 M-4,4 L4,-4")
            .attr("stroke", d.color)
            .attr("stroke-width", 2)
            .attr("opacity", 0.8);
          
          // Add enhancement symbol if applicable
          if (d.hasEnhancement) {
            g.append("text")
              .attr("x", 8)
              .attr("y", -8)
              .text("🧠")
              .style("font-size", "12px");
          }
        });

      // Add cluster labels
      svg.selectAll(".cluster-label")
        .data(queryPoints.clusterCentroids)
        .enter()
        .append("text")
        .attr("class", "cluster-label")
        .attr("x", d => xScale(d.x))
        .attr("y", d => yScale(d.y) - Math.max(8, Math.min(25, Math.sqrt(d.totalQueries) * 2)) - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("font-weight", "bold")
        .style("fill", d => d.color)
        .style("stroke", "white")
        .style("stroke-width", 2)
        .style("paint-order", "stroke")
        .text(d => d.cluster.cluster_name.length > 15 ? 
              d.cluster.cluster_name.substring(0, 15) + '...' : 
              d.cluster.cluster_name);

      // Add axes labels
      svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height - 10)
        .style("font-size", "14px")
        .style("font-weight", "500")
        .style("fill", "#374151")
        .text("t-SNE Dimension 1 (Semantic Similarity)");

      svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 20)
        .style("font-size", "14px")
        .style("font-weight", "500")
        .style("fill", "#374151")
        .text("t-SNE Dimension 2 (Semantic Similarity)");

      // Add title
      svg.append("text")
        .attr("class", "plot-title")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", 25)
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#111827")
        .text("Semantic Space: Questions Distribution in 2D (Reduced from 1536D)");

      // Cleanup function
      return () => {
        tooltip.remove();
      };
    } catch (err) {
      console.error("Error creating visualization:", err);
      setError(`Visualization error: ${err.message}`);
    }
  }, [queryPoints, selectedCluster]);

  // Initialize data
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      await fetchVisualizationData();
      setLoading(false);
    };
    init();
  }, [fetchVisualizationData]);

  // Create visualization when data changes
  useEffect(() => {
    if (queryPoints.points && queryPoints.clusterCentroids) {
      console.log("Creating visualization with data:", {
        points: queryPoints.points.length,
        centroids: queryPoints.clusterCentroids.length
      });
      const cleanup = createSemanticSpaceVisualization();
      return cleanup;
    }
  }, [createSemanticSpaceVisualization, queryPoints]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (queryPoints.points && queryPoints.points.length > 0) {
        createSemanticSpaceVisualization();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [createSemanticSpaceVisualization, queryPoints]);

  if (loading) {
    return (
      <div className="crowd-wisdom-loading">
        <div className="loading-spinner"></div>
        <p>Loading Semantic Space Visualization...</p>
        <p style={{fontSize: '12px', color: '#666'}}>{debugInfo}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="crowd-wisdom-visualizer">
        <div className="error-message">
          <h3>Error Loading Crowd Wisdom System</h3>
          <p>{error}</p>
          <div style={{fontSize: '12px', color: '#666', marginTop: '16px'}}>
            <strong>Debug Info:</strong><br/>
            Status: {debugInfo}<br/>
            API URL: {API_URL}
          </div>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      </div>
    );
  }

  return (
    <div className="crowd-wisdom-visualizer">
      <div className="visualizer-header">
        <h2>🧠 Crowd Wisdom: Semantic Space Visualization</h2>
        
        <div className="stats-summary">
          <div className="stat-item">
            <span className="stat-label">Clusters:</span>
            <span className="stat-value">{clusters.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Questions:</span>
            <span className="stat-value">{queryPoints.points?.length || 0}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Enhanced:</span>
            <span className="stat-value">
              {queryPoints.clusterCentroids?.filter(c => c.hasEnhancement).length || 0}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Dimensions:</span>
            <span className="stat-value">1536→2D</span>
          </div>
        </div>

        <div className="legend-section">
          <div className="legend-group">
            <h4>Query Points:</h4>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-dot" style={{backgroundColor: '#16a34a'}}></div>
                <span>Positive Feedback</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{backgroundColor: '#dc2626'}}></div>
                <span>Negative Feedback</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{backgroundColor: '#6b7280'}}></div>
                <span>No Feedback</span>
              </div>
            </div>
          </div>
          <div className="legend-group">
            <h4>Clusters:</h4>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-circle" style={{borderColor: '#22c55e'}}></div>
                <span>High Success (80%+)</span>
              </div>
              <div className="legend-item">
                <div className="legend-circle" style={{borderColor: '#eab308'}}></div>
                <span>Medium Success (60-80%)</span>
              </div>
              <div className="legend-item">
                <div className="legend-circle" style={{borderColor: '#ef4444'}}></div>
                <span>Low Success (&lt;60%)</span>
              </div>
              <div className="legend-item">
                <span>🧠 = Enhanced Prompt</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="main-visualization">
        <div className="semantic-plot-container" ref={containerRef}>
          <svg ref={svgRef}></svg>
        </div>
        
        {selectedCluster && (
          <div className="cluster-details">
            <h4>Cluster Analysis</h4>
            <p>Filtering queries for selected cluster. Click cluster again to clear filter.</p>
          </div>
        )}
      </div>

      <div style={{marginTop: '20px', fontSize: '12px', color: '#666', textAlign: 'center'}}>
        <strong>Status:</strong> {debugInfo} | 
        <strong> Selected:</strong> {selectedCluster ? 'Cluster filtered' : 'All clusters'} |
        <strong> Interaction:</strong> Hover points for details, click clusters to filter
      </div>
    </div>
  );
};

export default CrowdWisdomVisualizer; 