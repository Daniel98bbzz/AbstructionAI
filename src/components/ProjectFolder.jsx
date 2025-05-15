import React, { useState } from 'react';

function ProjectFolder({ project, activeConversation, onSelectConversation, onNewConversation }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="project-folder border-b border-gray-200">
      <div 
        className="folder-header flex items-center justify-between p-3 hover:bg-gray-100 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''} mr-2`}>▶</span>
          <span className="font-medium text-gray-900">{project.name}</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onNewConversation(project.id);
          }}
          className="text-sm text-primary-600 hover:text-primary-700 px-2 py-1 rounded"
        >
          + New Chat
        </button>
      </div>
      
      {isExpanded && (
        <div className="pl-6">
          {project.conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelectConversation(project.id, conversation.id)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                activeConversation === conversation.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
              }`}
            >
              <div className="text-sm font-medium text-gray-900 truncate">
                {conversation.title}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(conversation.lastMessageTime).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProjectFolder; 