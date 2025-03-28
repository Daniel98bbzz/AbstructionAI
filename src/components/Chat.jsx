import React, { useEffect, useRef } from 'react';
import { useQuery } from '../contexts/QueryContext';
import ChatMessage from './Chat/ChatMessage';
import './Chat/Chat.css';

const Chat = () => {
  const { messageHistory, loading, error } = useQuery();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messageHistory]);

  console.log('Chat: Rendering with message history:', messageHistory);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messageHistory.map((message, index) => {
          console.log('Chat: Rendering message at index:', index, message);
          return (
            <ChatMessage
              key={message.id || index}
              message={message}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {loading && <div className="chat-loading">Thinking...</div>}
      {error && <div className="chat-error">{error}</div>}
    </div>
  );
};

export default Chat; 