import React, { useState } from 'react';

const ResponseTabs = ({ message, userPreferences = {} }) => {
  const [activeTab, setActiveTab] = useState('explanation');

  // Debug logging to see what data we're receiving
  console.log('ResponseTabs received message:', {
    is_structured: message.is_structured,
    has_examples: !!message.examples,
    examples_length: message.examples?.length || 0,
    examples_type: typeof message.examples,
    has_analogies: !!message.analogies, 
    analogies_length: message.analogies?.length || 0,
    analogies_type: typeof message.analogies,
    loadingExamples: message.loadingExamples,
    loadingAnalogies: message.loadingAnalogies,
    has_content: !!message.content,
    has_explanation: !!message.explanation
  });

  const tabs = [
    {
      id: 'explanation',
      name: 'Main Answer',
      icon: '🎯',
      count: null,
      gradient: 'from-blue-500 to-purple-600'
    },
    {
      id: 'examples',
      name: 'Examples',
      icon: '💡',
      count: message.loadingExamples ? '...' : (message.examples?.length || 0),
      loading: message.loadingExamples,
      gradient: 'from-green-500 to-emerald-600'
    },
    {
      id: 'analogies',
      name: 'Analogies',
      icon: '🔗',
      count: message.loadingAnalogies ? '...' : (message.analogies?.length || 0),
      loading: message.loadingAnalogies,
      gradient: 'from-amber-500 to-orange-600'
    }
  ];

  const TabButton = ({ tab, isActive, onClick }) => (
    <button
      onClick={() => onClick(tab.id)}
      className={`relative px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-3 min-w-[140px] ${
        isActive
          ? `bg-gradient-to-r ${tab.gradient} text-white shadow-xl transform scale-105 ring-4 ring-opacity-30 ring-white`
          : 'bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 border-2 border-gray-100 hover:border-gray-200 hover:shadow-lg hover:scale-102'
      }`}
    >
      <span className={`text-xl transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}>
        {tab.icon}
      </span>
      <div className="flex flex-col items-start">
        <span className="text-sm leading-tight">{tab.name}</span>
        {tab.count !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all duration-300 ${
            isActive 
              ? 'bg-white bg-opacity-25 text-white' 
              : 'bg-gray-100 text-gray-600'
          } ${tab.loading ? 'animate-pulse' : ''}`}>
            {tab.loading ? (
              <span className="flex items-center gap-1">
                <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </span>
            ) : (
              tab.count
            )}
          </span>
        )}
      </div>
      
      {/* Active tab indicator */}
      {isActive && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-white rounded-full"></div>
      )}
    </button>
  );

  const LoadingSpinner = ({ text, className = "" }) => (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      <div className="relative">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="w-8 h-8 border-4 border-transparent border-t-purple-500 rounded-full animate-spin absolute top-2 left-2" style={{animationDirection: 'reverse', animationDuration: '0.8s'}}></div>
      </div>
      <p className="mt-4 text-gray-600 font-medium animate-pulse">{text}</p>
    </div>
  );

  const ExplanationTab = () => (
    <div className="space-y-8">
      {/* Regeneration Notice */}
      {message.isRegenerated && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-400 rounded-r-xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <h4 className="text-green-800 font-semibold text-lg">Improved Answer</h4>
              <p className="text-green-600">This response has been enhanced based on your feedback</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Explanation */}
      {(() => {
        // Determine which content to show based on whether response is structured
        let explanationContent = '';
        
        if (message.is_structured && message.explanation) {
          explanationContent = message.explanation;
        } else if (message.content && message.content !== message.introduction) {
          explanationContent = message.content;
        }
        
        if (explanationContent) {
          // Function to format text with proper markdown support
          const formatText = (text) => {
            // Split by double newlines to get paragraphs
            const sections = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
            
            return sections.map((section, sectionIdx) => {
              const trimmedSection = section.trim();
              
              // Check for numbered lists (1. 2. 3. etc)
              const numberedListMatch = trimmedSection.match(/^(\d+)\.\s+(.+)/);
              if (numberedListMatch) {
                return (
                  <div key={sectionIdx} className="mb-6">
                    <div className="flex items-start gap-3">
                      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-lg flex-shrink-0">
                        {numberedListMatch[1]}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-gray-800 leading-relaxed text-lg">
                          {renderFormattedText(numberedListMatch[2])}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Check for bullet points
              const bulletMatch = trimmedSection.match(/^[•·-]\s+(.+)/);
              if (bulletMatch) {
                return (
                  <div key={sectionIdx} className="mb-4 ml-4">
                    <div className="flex items-start gap-3">
                      <div className="text-blue-600 mt-1.5">•</div>
                      <p className="text-gray-700 leading-relaxed">
                        {renderFormattedText(bulletMatch[1])}
                      </p>
                    </div>
                  </div>
                );
              }
              
              // Check if it's a heading (line that's short and doesn't end with punctuation)
              if (trimmedSection.length < 100 && !trimmedSection.match(/[.!?]$/)) {
                // Check if it contains bold text to make it a heading
                if (trimmedSection.includes('**')) {
                  return (
                    <h3 key={sectionIdx} className="text-2xl font-bold text-gray-900 mt-8 mb-4 pb-2 border-b-2 border-gradient-to-r from-blue-500 to-purple-600">
                      {renderFormattedText(trimmedSection)}
                    </h3>
                  );
                }
              }
              
              // Regular paragraph
              return (
                <div key={sectionIdx} className="mb-6">
                  <p className="text-gray-800 leading-relaxed text-lg">
                    {renderFormattedText(trimmedSection)}
                  </p>
                </div>
              );
            });
          };
          
          // Enhanced helper function to render markdown-style formatting
          const renderFormattedText = (text) => {
            // Process the text in segments to handle nested formatting
            const segments = [];
            let lastIndex = 0;
            
            // Combined regex to find all formatting patterns
            const formattingRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\d+\.\s+)/g;
            let match;
            
            while ((match = formattingRegex.exec(text)) !== null) {
              // Add text before the match
              if (match.index > lastIndex) {
                segments.push({
                  type: 'text',
                  content: text.substring(lastIndex, match.index)
                });
              }
              
              const matchedText = match[0];
              
              // Determine the type of formatting
              if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
                // Bold text
                segments.push({
                  type: 'bold',
                  content: matchedText.slice(2, -2)
                });
              } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
                // Italic text
                segments.push({
                  type: 'italic',
                  content: matchedText.slice(1, -1)
                });
              } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
                // Code text
                segments.push({
                  type: 'code',
                  content: matchedText.slice(1, -1)
                });
              } else if (matchedText.match(/^\d+\.\s+$/)) {
                // Numbered list marker
                segments.push({
                  type: 'number',
                  content: matchedText
                });
              }
              
              lastIndex = match.index + matchedText.length;
            }
            
            // Add remaining text
            if (lastIndex < text.length) {
              segments.push({
                type: 'text',
                content: text.substring(lastIndex)
              });
            }
            
            // Render segments
            return (
              <>
                {segments.map((segment, idx) => {
                  switch (segment.type) {
                    case 'bold':
                      return (
                        <strong key={idx} className="font-bold text-gray-900 bg-yellow-50 px-1 rounded">
                          {segment.content}
                        </strong>
                      );
                    case 'italic':
                      return (
                        <em key={idx} className="italic text-gray-700">
                          {segment.content}
                        </em>
                      );
                    case 'code':
                      return (
                        <code key={idx} className="bg-gray-100 text-purple-700 px-2 py-1 rounded font-mono text-sm border border-gray-200">
                          {segment.content}
                        </code>
                      );
                    case 'number':
                      return (
                        <span key={idx} className="font-bold text-blue-600">
                          {segment.content}
                        </span>
                      );
                    default:
                      return <span key={idx}>{segment.content}</span>;
                  }
                })}
              </>
            );
          };
          
          return (
            <div className="bg-white rounded-2xl p-10 border border-gray-100 shadow-xl">
              <div className="prose prose-xl max-w-none">
                {formatText(explanationContent)}
              </div>
              
              {/* Add a beautiful visual separator */}
              <div className="mt-12 pt-8 border-t border-gradient-to-r from-transparent via-gray-200 to-transparent">
                <div className="flex items-center justify-center">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full animate-pulse"></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-pink-400 to-red-500 rounded-full animate-pulse" style={{animationDelay: '0.6s'}}></div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        
        return null;
      })()}

      {/* Resources */}
      {((message.resources && message.resources.length > 0) || 
        (message.additional_sources && message.additional_sources.length > 0)) && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8 border border-purple-200 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">📚</span>
            <h4 className="text-2xl font-bold text-purple-900">Additional Resources</h4>
          </div>
          <div className="grid gap-4">
            {(message.resources || message.additional_sources || []).map((resource, idx) => (
              <a
                key={idx}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white rounded-xl p-6 border border-purple-100 hover:border-purple-300 hover:shadow-xl transition-all duration-300 transform hover:scale-102"
              >
                <div className="flex items-start gap-4">
                  <span className="text-purple-600 text-xl mt-1">🔗</span>
                  <div>
                    <h5 className="font-bold text-lg text-purple-900 group-hover:text-purple-700 transition-colors">
                      {resource.title}
                    </h5>
                    {resource.description && (
                      <p className="text-purple-600 mt-2 leading-relaxed">{resource.description}</p>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const ExamplesTab = () => {
    // Show loading state if examples are being generated
    if (message.loadingExamples) {
      return <LoadingSpinner text="Crafting perfect examples for you..." className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl" />;
    }

    return (
      <div className="space-y-8">
        <div className="text-center mb-10">
          <div className="inline-block bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-2xl shadow-lg">
            <h3 className="text-3xl font-bold mb-2">💡 Practical Examples</h3>
            <p className="text-green-100 text-lg">Real-world applications to solidify your understanding</p>
          </div>
        </div>
        
        {message.examples && Array.isArray(message.examples) && message.examples.length > 0 ? (
          <div className="grid gap-8">
            {message.examples.map((example, idx) => (
              <div key={idx} className="group bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-8 border-2 border-green-200 hover:border-green-300 hover:shadow-2xl transition-all duration-300 transform hover:scale-102">
                <div className="flex items-start gap-6">
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full w-12 h-12 flex items-center justify-center font-bold text-lg shadow-lg group-hover:scale-110 transition-transform">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    {example.title && (
                      <h4 className="text-2xl font-bold text-green-900 mb-4 group-hover:text-green-700 transition-colors">{example.title}</h4>
                    )}
                    <div className="text-green-800 leading-relaxed text-lg">
                      {typeof example === 'string' ? (
                        <p>{example}</p>
                      ) : (
                        <p>{example.description || example.content || example}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl">
            <div className="text-8xl mb-6 opacity-50">🔍</div>
            <h3 className="text-2xl font-semibold text-gray-600 mb-4">No Examples Available</h3>
            <p className="text-gray-500 text-lg">
              Examples couldn't be generated for this response.
            </p>
          </div>
        )}
      </div>
    );
  };

  const AnalogiesTab = () => {
    // Show loading state if analogies are being generated
    if (message.loadingAnalogies) {
      return <LoadingSpinner text="Creating personalized analogies..." className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl" />;
    }

    return (
      <div className="space-y-8">
        <div className="text-center mb-10">
          <div className="inline-block bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-4 rounded-2xl shadow-lg">
            <h3 className="text-3xl font-bold mb-2">🔗 Personalized Analogies</h3>
            <p className="text-amber-100 text-lg">
              Tailored to your interests: {userPreferences.interests?.join(', ') || userPreferences.preferred_analogy_domains?.join(', ') || 'various topics'}
            </p>
          </div>
        </div>
        
        {message.analogies && Array.isArray(message.analogies) && message.analogies.length > 0 ? (
          <div className="grid gap-8">
            {message.analogies.map((analogy, idx) => (
              <div key={idx} className="group bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 border-2 border-amber-200 hover:border-amber-300 hover:shadow-2xl transition-all duration-300 transform hover:scale-102">
                <div className="flex items-start gap-6">
                  <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-full w-14 h-14 flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform">
                    🔗
                  </div>
                  <div className="flex-1">
                    {analogy.title && (
                      <div className="flex items-center gap-3 mb-4">
                        <h4 className="text-2xl font-bold text-amber-900 group-hover:text-amber-700 transition-colors">{analogy.title}</h4>
                        {analogy.domain && (
                          <span className="bg-gradient-to-r from-amber-200 to-orange-200 text-amber-800 px-3 py-1 rounded-full text-sm font-semibold shadow-sm">
                            {analogy.domain}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-amber-800 leading-relaxed text-lg">
                      {typeof analogy === 'string' ? (
                        <p>{analogy}</p>
                      ) : (
                        <p>{analogy.description || analogy.content || analogy}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : message.analogy ? (
          // Fallback to single analogy if new format not available
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-8 border-2 border-amber-200 shadow-lg">
            <div className="flex items-start gap-6">
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-full w-14 h-14 flex items-center justify-center text-2xl shadow-lg">
                🔗
              </div>
              <div className="flex-1">
                {message.analogy_title && (
                  <h4 className="text-2xl font-bold text-amber-900 mb-4">{message.analogy_title}</h4>
                )}
                <div className="text-amber-800 leading-relaxed text-lg">
                  {message.analogy.split('\n').map((line, idx) => (
                    <p key={idx} className="mb-3">{line}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl">
            <div className="text-8xl mb-6 opacity-50">🧩</div>
            <h3 className="text-2xl font-semibold text-gray-600 mb-4">No Analogies Available</h3>
            <p className="text-gray-500 text-lg">
              Analogies couldn't be generated for this response.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-8 p-2 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl shadow-inner">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={setActiveTab}
          />
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {activeTab === 'explanation' && <ExplanationTab />}
        {activeTab === 'examples' && <ExamplesTab />}
        {activeTab === 'analogies' && <AnalogiesTab />}
      </div>
    </div>
  );
};

export default ResponseTabs; 