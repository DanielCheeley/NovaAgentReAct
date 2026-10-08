import type { Conversation } from "../types/chat.ts";

type SidebarProps = {
  conversations: Conversation[];
  activeConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: number) => void;
};

function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Nova</h1>

        <button
          className="new-chat-button"
          onClick={onNewConversation}
        >
          +
        </button>
      </div>

      <div className="conversation-list">
        <p className="conversation-label">Today</p>

        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={
              conversation.id === activeConversationId
                ? "conversation active"
                : "conversation"
            }
          >
            <button
              className="conversation-button"
              onClick={() =>
                onSelectConversation(conversation.id)
              }
            >
              {conversation.title}
            </button>

            <button
              className="delete-conversation-button"
              onClick={() => {
                const confirmed = window.confirm(
                  "Are you sure you want to delete this conversation?"
                );

                if (confirmed) {
                  onDeleteConversation(conversation.id);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;