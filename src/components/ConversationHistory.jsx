import React from 'react';

function ConversationHistory({ conversations, activeConversation, onSelectConversation, onNewConversation }) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          New Conversation
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation.id)}
            className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none ${
              activeConversation === conversation.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
            }`}
          >
            <div className="text-sm font-medium text-gray-900 truncate">
              {conversation.title && conversation.title.length > 1 
                ? conversation.title 
                : conversation.id 
                  ? `Conversation ${new Date(parseInt(conversation.id)).toLocaleDateString()}` 
                  : 'New Conversation'}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(conversation.lastMessageTime).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ConversationHistory; 