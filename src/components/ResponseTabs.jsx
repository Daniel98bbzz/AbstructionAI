import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';
import { API_URL } from '../config';

const ResponseTabs = ({ 
  messageId, 
  mainContent, 
  originalQuery, 
  sessionId, 
  preferences = {},
  userId,
  tabContent = null // New prop for pre-generated content
}) => {
  const [activeTab, setActiveTab] = useState('main');
  const [examplesContent, setExamplesContent] = useState(null);
  const [abstractContent, setAbstractContent] = useState(null);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [loadingAbstract, setLoadingAbstract] = useState(false);
  const [errorExamples, setErrorExamples] = useState(null);
  const [errorAbstract, setErrorAbstract] = useState(null);
  const [examplesFromCache, setExamplesFromCache] = useState(false);
  const [abstractFromCache, setAbstractFromCache] = useState(false);

  // Load existing content when component mounts
  useEffect(() => {
    const loadContent = async () => {
      // First check if we have pre-generated content from the main response
      if (tabContent && tabContent.generated_simultaneously) {
        console.log('Using pre-generated tab content from main response');
        if (tabContent.examples) {
          setExamplesContent(tabContent.examples);
          setExamplesFromCache(true);
        }
        if (tabContent.abstract) {
          setAbstractContent(tabContent.abstract);
          setAbstractFromCache(true);
        }
        return; // Don't need to fetch from database if we have fresh content
      }

      // If no pre-generated content, try to load from database
      if (!messageId || !userId) {
        console.log('Missing messageId or userId, cannot load cached content');
        return;
      }

      try {
        console.log(`Loading existing tab content for message ${messageId}`);
        
        // Check for existing content for both tabs
        const [examplesResponse, abstractResponse] = await Promise.allSettled([
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/examples`),
          axios.get(`${API_URL}/api/response-tab-content/${messageId}/abstract`)
        ]);

        if (examplesResponse.status === 'fulfilled' && examplesResponse.value.data.content) {
          console.log('Loaded examples from database cache');
          setExamplesContent(examplesResponse.value.data.content);
          setExamplesFromCache(true);
        }

        if (abstractResponse.status === 'fulfilled' && abstractResponse.value.data.content) {
          console.log('Loaded abstract from database cache');
          setAbstractContent(abstractResponse.value.data.content);
          setAbstractFromCache(true);
        }
      } catch (error) {
        console.log('No existing content found or error loading:', error.message);
        // This is normal on first load, so we don't show errors
      }
    };

    loadContent();
  }, [messageId, userId, tabContent]); // Add tabContent to dependencies

  // Function to generate examples content
  const generateExamples = async () => {
    if (examplesContent) {
      console.log('Examples content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating examples content via API call');
    setLoadingExamples(true);
    setErrorExamples(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/generate-examples`, {
        query: originalQuery,
        mainContent: mainContent,
        sessionId: sessionId,
        preferences: preferences,
        userId: userId,
        messageId: messageId
      });
      
      setExamplesContent(response.data.content || response.data.examples);
      setExamplesFromCache(response.data.from_cache || false);
      console.log('Examples generated successfully:', response.data.from_cache ? 'from cache' : 'newly generated');
    } catch (error) {
      console.error('Error generating examples:', error);
      setErrorExamples('Failed to generate examples. Please try again.');
    } finally {
      setLoadingExamples(false);
    }
  };

  // Function to generate abstract content
  const generateAbstract = async () => {
    if (abstractContent) {
      console.log('Abstract content already available, skipping generation');
      return; // Already loaded
    }
    
    console.log('Generating abstract content via API call');
    setLoadingAbstract(true);
    setErrorAbstract(null);
    
    try {
      const response = await axios.post(`${API_URL}/api/generate-abstract`, {
        query: originalQuery,
        mainContent: mainContent,
        sessionId: sessionId,
        preferences: preferences,
        userId: userId,
        messageId: messageId
      });
      
      setAbstractContent(response.data.content || response.data.abstract);
      setAbstractFromCache(response.data.from_cache || false);
      console.log('Abstract generated successfully:', response.data.from_cache ? 'from cache' : 'newly generated');
    } catch (error) {
      console.error('Error generating abstract:', error);
      setErrorAbstract('Failed to generate abstract content. Please try again.');
    } finally {
      setLoadingAbstract(false);
    }
  };

  // Handle tab changes and trigger API calls
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    
    if (tab === 'examples' && !examplesContent && !loadingExamples) {
      generateExamples();
    } else if (tab === 'abstract' && !abstractContent && !loadingAbstract) {
      generateAbstract();
    }
  };

  // Markdown components for consistent rendering
  const markdownComponents = {
    code({node, inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={tomorrow}
          language={match[1]}
          PreTag="div"
          className="rounded-md"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  return (
    <div className="response-tabs-container">
      {/* Main Tab Navigation - Top Level */}
      <div className="border-b border-gray-200 mb-3">
        <nav className="-mb-px flex justify-center" aria-label="Main response tab">
          <button
            onClick={() => handleTabChange('main')}
            className={`py-4 px-6 border-b-3 font-bold text-base ${
              activeTab === 'main'
                ? 'border-primary-500 text-primary-700 bg-primary-50 rounded-t-lg shadow-sm'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
            } transition-all duration-200 transform hover:scale-105`}
            style={{ 
              fontSize: '1.1rem',
              fontWeight: activeTab === 'main' ? '700' : '600'
            }}
          >
            📋 Main Answer
          </button>
        </nav>
      </div>

      {/* Secondary Tabs Navigation - Bottom Level */}
      <div className="border-b border-gray-100 mb-4">
        <nav className="-mb-px flex space-x-6 justify-center" aria-label="Secondary response tabs">
          {/* Examples Tab */}
          <button
            onClick={() => handleTabChange('examples')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'examples'
                ? 'border-secondary-500 text-secondary-600 bg-secondary-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              examplesFromCache 
                ? 'Content loaded from cache' 
                : (examplesContent ? 'Content pre-generated' : 'Click to generate examples')
            }
          >
            💡 Examples
            {examplesFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {examplesContent && !examplesFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingExamples && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>
          
          {/* Abstract Tab */}
          <button
            onClick={() => handleTabChange('abstract')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'abstract'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50 rounded-t-md'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } transition-all duration-200`}
            title={
              abstractFromCache 
                ? 'Content loaded from cache' 
                : (abstractContent ? 'Content pre-generated' : 'Click to generate abstract content')
            }
          >
            🎭 Abstract
            {abstractFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Cached content">💾</span>
            )}
            {abstractContent && !abstractFromCache && (
              <span className="ml-1 text-xs opacity-60" title="Pre-generated content">⚡</span>
            )}
            {loadingAbstract && (
              <span className="ml-2 inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Main Tab Content */}
        {activeTab === 'main' && (
          <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
            <ReactMarkdown components={markdownComponents}>
              {mainContent}
            </ReactMarkdown>
          </div>
        )}

        {/* Examples Tab Content */}
        {activeTab === 'examples' && (
          <div className="examples-content">
            {loadingExamples ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-secondary-600"></div>
                  <span className="text-gray-600">Generating examples...</span>
                </div>
              </div>
            ) : errorExamples ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorExamples}</p>
                    <button 
                      onClick={generateExamples}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : examplesContent ? (
              <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
                <ReactMarkdown components={markdownComponents}>
                  {examplesContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateExamples}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-secondary-600 hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500"
                >
                  Generate Examples
                </button>
              </div>
            )}
          </div>
        )}

        {/* Abstract Tab Content */}
        {activeTab === 'abstract' && (
          <div className="abstract-content">
            {loadingAbstract ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                  <span className="text-gray-600">Generating abstractions...</span>
                </div>
              </div>
            ) : errorAbstract ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{errorAbstract}</p>
                    <button 
                      onClick={generateAbstract}
                      className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : abstractContent ? (
              <div className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-white">
                <ReactMarkdown components={markdownComponents}>
                  {abstractContent}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <button 
                  onClick={generateAbstract}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Generate Abstractions
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponseTabs; 