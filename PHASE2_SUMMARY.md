# Phase 2: Multi-Signal Template Selection

## Overview

Phase 2 of the Multi-Signal Evaluation System enhances the Crowd Wisdom template selection logic by implementing a composite quality score that combines multiple signals beyond just user ratings. The system now uses a weighted blend of various quality indicators to select the best prompt templates for each topic.

## Key Implementations

### 1. Composite Quality Score Calculation

The system now calculates a comprehensive quality score using the following weighted signals:

- **Efficacy Score** (35%): Traditional user ratings (normalized to 0-1 scale)
- **Follow-up Rate** (20%): Inverse of follow-up question frequency (lower is better)
- **Confusion Score** (20%): Inverse of AI-evaluated confusion level (lower is better)
- **Confidence Score** (15%): Statistical confidence based on sample size and variance
- **Component Ratings** (10%): Granular feedback on specific template elements (analogy, explanation, etc.)

Each signal is normalized to a 0-1 scale where higher is better, then combined using weighted averaging.

```javascript
// Composite score formula
const compositeScore = 
  (efficacyScore * 0.35) +
  (followUpScore * 0.20) +
  (confusionScore * 0.20) +
  (confidenceScore * 0.15) +
  (componentScore * 0.10);
```

### 2. Enhanced Template Selection Logic

The `getTemplateForTopic` method was updated to:

- Accept a `useCompositeScore` flag to toggle between traditional and composite score selection
- Include an exploration rate parameter to balance exploitation vs. exploration
- Use the composite quality score for ranking when enabled
- Implement a minimum quality threshold for exploration

```javascript
// Improved template selection
const selectedTemplate = await responseClusterManager.getTemplateForTopic(
  topic, 
  useCompositeScore,  // true = composite score, false = traditional efficacy score
  explorationRate     // rate of trying less-used templates (default 0.1)
);
```

### 3. A/B Testing Framework

An A/B testing system was implemented to compare template selection methods:

- Users are randomly assigned to either the composite score or efficacy score group
- The system logs which selection method was used for each template usage
- An admin dashboard displays performance metrics for each group

### 4. Admin Dashboard

A new admin dashboard has been created to:

- Monitor template performance across all quality signals
- Configure signal weights for the composite score
- Run simulations to test template selection with different parameters
- View A/B testing results comparing different selection methods
- Run database migrations for the multi-signal system

### 5. Database Changes

New database fields and tables were added:

- Added to `prompt_templates`: 
  - `composite_quality_score`
  - `quality_score_metadata` for calculation details

- Added to `prompt_template_usage`:
  - `selection_method` to track which algorithm selected the template

## Usage Guide

### Enabling the Multi-Signal System

1. Navigate to `/crowd-wisdom-admin` in your browser
2. Go to the "Migration" tab
3. Enter the admin key (`multi-signal-admin`)
4. Click "Run Migration" to set up the database

### Configuring Signal Weights

1. Go to the "Multi-Signal Config" tab
2. Adjust the weight sliders for each signal (must sum to 1.0)
3. Click "Recalculate Scores" to update all template scores with the new weights

### Testing Template Selection

1. Go to the "Simulation" tab
2. Select a topic and set parameters (selection method, exploration rate)
3. Optionally customize weights for the composite score
4. Click "Run Simulation" to see which template would be selected

### Monitoring A/B Test Results

1. Go to the "A/B Testing" tab
2. View metrics comparing the composite score method vs. the traditional efficacy score method
3. Analyze differences in average ratings and follow-up rates

## API Endpoints

- **POST /api/admin/crowd-wisdom/recalculate-scores**  
  Recalculates composite quality scores for all templates, optionally with custom weights

- **POST /api/admin/crowd-wisdom/simulate-selection**  
  Simulates template selection for a given topic with specified parameters

- **GET /api/admin/crowd-wisdom/ab-stats**  
  Returns statistics comparing both selection methods

- **POST /api/admin/run-multi-signal-migration**  
  Runs the database migration to set up multi-signal evaluation

## Future Enhancements (Phase 3)

- Automated template improvement based on multi-signal feedback
- AI-driven template generation using patterns from high-performing templates
- More sophisticated exploration strategies to optimize template discovery 