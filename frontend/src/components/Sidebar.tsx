import type { Conversation } from "../types/chat.ts"

type SidebarProps = {
    conversations: Conversation[];
    activeConversationId: number | null;
    onSelectConversation: (id: number) => void;
    onNewConversation: () => void;
  };
  
function Sidebar({ conversations, activeConversationId, onSelectConversation, onNewConversation }: SidebarProps) {


  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Nova</h1>
        <button className="new-chat-button" onClick={onNewConversation}>
          +
        </button>
      </div>

      <div className="conversation-list">
        <p className="conversation-label">Today</p>
        
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={conversation.id === activeConversationId ? "conversation active" : "conversation"}
            onClick={() => onSelectConversation(conversation.id)}
          >
            {conversation.title}
          </button>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;