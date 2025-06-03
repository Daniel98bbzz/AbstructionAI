# Frontend Integration Guide - Enhanced Template Recommendations

## 🎯 **How Users Access Template Recommendations**

### **1. Via Dedicated Recommendations Page**

**Navigation:** `/recommendations`

**Access Methods:**
- Direct URL navigation
- Navigation menu link (add to your main navigation)
- Dashboard widget "View All →" link

**Features:**
- Full recommendations dashboard with filtering
- User insights and cluster information
- Custom weight adjustment for power users
- Multiple view modes (grid, list, compact)
- Topic-based filtering

### **2. Via Dashboard Widget**

**Location:** Main Dashboard page (`/dashboard`)

**Features:**
- Shows top 3 personalized recommendations
- Compact card view
- Quick template application
- "View All" link to full recommendations page

**Integration Code:**
```jsx
<RecommendationsWidget 
  userId={user?.id}
  maxRecommendations={3}
  onTemplateSelected={(template) => {
    localStorage.setItem('selectedTemplate', JSON.stringify(template));
    navigate('/query', { state: { selectedTemplate: template } });
  }}
  className="shadow-md"
/>
```

### **3. Via Query Page Template Banner**

**Location:** Query page (`/query`)

**Features:**
- Shows applied template information
- Template match score and reasoning
- Ability to clear template
- Pre-filled query suggestions

## 🔄 **User Flow Examples**

### **Flow 1: Discover → Apply → Query**

1. **User visits Dashboard**
   - Sees personalized recommendations widget
   - Views 3 recommended templates

2. **User clicks "Use Template"**
   - Navigates to `/query` with template data
   - Query page shows template banner
   - Query input pre-filled with suggestion

3. **User submits enhanced query**
   - Gets response optimized for their cluster
   - System learns from interaction

### **Flow 2: Explore → Customize → Apply**

1. **User visits `/recommendations`**
   - Views full recommendations dashboard
   - Sees user insights (cluster, topics, sentiment)

2. **User customizes experience**
   - Adjusts recommendation weights
   - Filters by topic
   - Views score breakdowns

3. **User applies template**
   - Clicks "Use Template" on preferred recommendation
   - Seamlessly transitions to query interface

### **Flow 3: Topic-Specific Recommendations**

1. **User selects specific topic filter**
   - Recommendations filtered to mathematics, science, etc.
   - See specialized templates for chosen field

2. **User compares templates**
   - Views efficacy scores and usage counts
   - Reads detailed recommendation reasoning

3. **User applies best match**
   - Gets topic-optimized query experience

## 🎨 **UI Components Overview**

### **RecommendationCard Component**

**Features:**
- Template topic and quality indicator
- Match score percentage
- Efficacy and usage metrics
- Expandable score breakdown
- "Use Template" action button

**Visual Design:**
- Clean card layout with hover effects
- Color-coded quality indicators (Excellent, Good, Fair, Poor)
- Progressive disclosure for advanced details

### **RecommendationsDashboard Component**

**Features:**
- Comprehensive filtering and sorting
- User insight cards (cluster, topics, sentiment)
- Custom weight adjustment sliders
- Multiple view modes
- Real-time recommendation updates

### **RecommendationsWidget Component**

**Features:**
- Compact display for embedding
- Configurable recommendation count
- Quick template application
- "View More" navigation

### **Template Banner (QueryPage)**

**Features:**
- Applied template information
- Match score display
- Clear template option
- Visual template indicator

## 🔧 **Technical Integration Points**

### **API Endpoints Used**

```javascript
// Get basic recommendations
GET /api/users/:userId/template-recommendations?topic=mathematics&max_recommendations=10

// Get recommendations with custom weights
POST /api/users/:userId/template-recommendations
{
  "weights": {
    "clusterPopularity": 0.4,
    "topicRelevance": 0.35,
    "sentimentWeight": 0.25
  }
}

// Get user insights
GET /api/users/:userId/recommendation-insights
```

### **State Management**

```javascript
// Template selection state
const [selectedTemplate, setSelectedTemplate] = useState(null);

// Navigation with template data
navigate('/query', { 
  state: { 
    selectedTemplate: templateData,
    fromRecommendations: true 
  } 
});

// Persistent storage
localStorage.setItem('selectedTemplate', JSON.stringify(template));
```

### **Template Application Flow**

1. **Template Selection:** User clicks "Use Template"
2. **Data Transfer:** Template data stored in localStorage + navigation state
3. **Query Page Detection:** useEffect detects template data
4. **UI Update:** Template banner displayed, query pre-filled
5. **Cleanup:** Template data cleared after application

## 🎯 **User Experience Features**

### **Personalization Indicators**

- **Match Score:** Shows how well template fits user (0-100%)
- **Quality Badge:** Excellent/Good/Fair/Poor based on efficacy
- **Cluster Insight:** "Users like you frequently use this template"
- **Topic Relevance:** Highlights alignment with user's active topics

### **Responsive Design**

- **Desktop:** Full dashboard with all features
- **Tablet:** Responsive grid layout, compact controls
- **Mobile:** Stacked layout, simplified filtering

### **Progressive Enhancement**

- **Basic:** Simple template list with apply buttons
- **Enhanced:** Score breakdowns and insights
- **Advanced:** Custom weight adjustment and detailed analytics

## 🔍 **Accessibility Features**

- **Keyboard Navigation:** Full keyboard support for all interactions
- **Screen Readers:** Proper ARIA labels and descriptions
- **Color Contrast:** WCAG AA compliant color schemes
- **Focus Management:** Clear focus indicators and logical tab order

## 📊 **Analytics Integration**

Track user interactions for continuous improvement:

```javascript
// Template application events
analytics.track('template_applied', {
  templateId: template.id,
  topic: template.topic,
  matchScore: template.finalScore,
  source: 'dashboard_widget' // or 'recommendations_page'
});

// Recommendation view events
analytics.track('recommendations_viewed', {
  userId: user.id,
  recommendationCount: recommendations.length,
  topTopic: recommendations[0]?.topic
});
```

## 🚀 **Getting Started**

### **1. Add to Navigation**

Add recommendations link to your main navigation:

```jsx
<nav>
  <Link to="/dashboard">Dashboard</Link>
  <Link to="/query">Query</Link>
  <Link to="/recommendations">Recommendations</Link>
  <Link to="/history">History</Link>
</nav>
```

### **2. Update Dashboard**

The RecommendationsWidget is already integrated into your Dashboard.

### **3. Test User Flow**

1. Navigate to `/recommendations`
2. Apply a template
3. Verify query page shows template banner
4. Submit query and verify enhanced experience

### **4. Customize Styling**

Adjust the component styles to match your design system:

```css
/* Custom template card styling */
.recommendation-card {
  /* Your custom styles */
}

/* Custom dashboard styling */
.recommendations-dashboard {
  /* Your custom styles */
}
```

## 🎉 **Ready to Use!**

Your Enhanced Template Recommendations system is now fully integrated into the frontend! Users can:

✅ **Discover** personalized recommendations on the dashboard  
✅ **Explore** the full recommendations experience  
✅ **Apply** templates seamlessly to their queries  
✅ **Customize** recommendation weights for their preferences  
✅ **Track** their learning patterns and cluster insights  

The system will continuously learn from user interactions to provide increasingly accurate and helpful recommendations! 