import React, { useState } from 'react';
import { useQuery } from '../../contexts/QueryContext';
import FeedbackForm from '../FeedbackForm';
import './ChatMessage.css';

const ChatMessage = ({ message }) => {
  const { handleDeepening, currentSession } = useQuery();
  const [showFeedback, setShowFeedback] = useState(false);

  console.log('ChatMessage: Rendering message:', JSON.stringify(message, null, 2));

  const handleFeedbackSubmitted = (messageId) => {
    console.log('Feedback submitted successfully for message:', messageId);
    setShowFeedback(false);
  };

  const handleRegenerateAnswer = (feedback) => {
    console.log('Regenerating answer with feedback:', feedback);
    handleDeepening('regenerate', message.originalQuery, feedback);
  };

  const renderSuggestions = (content) => {
    if (!content || !content.suggestions) return null;

    console.log('ChatMessage: Rendering suggestions:', JSON.stringify(content, null, 2));
    return (
      <div className="suggestions-container">
        <h3 className="suggestions-title">{content.title}</h3>
        <div className="suggestions-grid">
          {content.suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              className="suggestion-button"
              onClick={() => handleDeepening(suggestion.id, message.originalQuery)}
            >
              <div className="suggestion-text">{suggestion.text}</div>
              <div className="suggestion-description">{suggestion.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderMessageContent = () => {
    console.log('ChatMessage: Rendering message content for type:', message.type);
    console.log('ChatMessage: Full message object:', JSON.stringify(message, null, 2));
    
    if (message.type === 'suggestions') {
      return renderSuggestions(message.content);
    }

    if (message.type === 'main' || message.type === 'regenerated') {
      console.log('ChatMessage: Rendering main message with sections:', {
        hasTitle: !!message.suggested_title,
        hasIntroduction: !!message.introduction,
        hasExplanation: !!message.explanation,
        hasAnalogy: !!message.analogy,
        hasResources: !!message.resources,
        hasRecap: !!message.recap
      });

      return (
        <div className="message-container">
          {message.suggested_title && (
            <h3 className="message-title">{message.suggested_title}</h3>
          )}
          <div className="message-content">
            {message.introduction && (
              <div className="message-introduction">
                <p>{message.introduction}</p>
              </div>
            )}
            {message.explanation && (
              <div className="message-explanation">
                <p>{message.explanation}</p>
              </div>
            )}
          </div>
          {message.analogy && (
            <div className="message-analogy">
              <h4>Analogy:</h4>
              <p>{message.analogy}</p>
            </div>
          )}
          {message.resources && message.resources.length > 0 && (
            <div className="message-resources">
              <h4>Additional Resources:</h4>
              <ul>
                {message.resources.map((resource, index) => (
                  <li key={index}>
                    {resource.url ? (
                      <a href={resource.url} target="_blank" rel="noopener noreferrer">
                        {resource.title}
                      </a>
                    ) : (
                      resource.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {message.recap && (
            <div className="message-recap">
              <h4>Key Points:</h4>
              <ul>
                {message.recap.split('\n').map((point, index) => (
                  <li key={index}>{point.replace(/^[•-]\s*/, '')}</li>
                ))}
              </ul>
            </div>
          )}
          {message.role === 'assistant' && (
            <div className="message-actions">
              <button
                onClick={() => setShowFeedback(!showFeedback)}
                className="feedback-button"
              >
                {showFeedback ? 'Hide Feedback' : 'Provide Feedback'}
              </button>
            </div>
          )}
        </div>
      );
    }

    // Fallback for other message types
    console.log('ChatMessage: Falling back to basic content rendering');
    return <div className="message-content">{message.content}</div>;
  };

  return (
    <div className={`chat-message ${message.role}`}>
      <div className="message-header">
        <span className="message-role">
          {message.role === 'user' ? 'You' : 'Assistant'}
        </span>
        <span className="message-timestamp">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {renderMessageContent()}
      {message.role === 'assistant' && showFeedback && (
        <FeedbackForm
          responseId={message.id}
          originalQuery={message.originalQuery}
          sessionId={currentSession?.id}
          onFeedbackSubmitted={handleFeedbackSubmitted}
          onRegenerateAnswer={handleRegenerateAnswer}
        />
      )}
    </div>
  );
};

export default ChatMessage; 