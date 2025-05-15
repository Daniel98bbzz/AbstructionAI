import React, { useState } from 'react';
import ProjectFolder from './ProjectFolder';
import NewProjectModal from './NewProjectModal';

function ConversationHistory({ 
  projects, 
  activeProject,
  activeConversation, 
  onSelectConversation,
  onNewProject,
  onNewConversation 
}) {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  
  const handleCreateProject = (projectName) => {
    onNewProject(projectName);
    setShowNewProjectModal(false);
  };
  
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => setShowNewProjectModal(true)}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          New Project
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        {projects.map((project) => (
          <ProjectFolder
            key={project.id}
            project={project}
            activeConversation={activeConversation}
            onSelectConversation={onSelectConversation}
            onNewConversation={onNewConversation}
          />
        ))}
      </div>

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}

export default ConversationHistory; 