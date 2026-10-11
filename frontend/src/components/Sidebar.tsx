import Icon from "./Icon";
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
        <div className="brand"><span className="brand-mark"><Icon name="spark" size={23} /></span><div><h1>Nova</h1><span className="brand-caption">Your AI workspace</span></div></div>

      </div>

      <button className="new-chat-button" onClick={onNewConversation}><Icon name="plus" />New conversation</button>
      <div className="conversation-list">
        <p className="conversation-label">Conversations <span>{conversations.length}</span></p>

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
              aria-current={conversation.id === activeConversationId ? "page" : undefined}
              title={conversation.title}
              onClick={() =>
                onSelectConversation(conversation.id)
              }
            >
              <Icon name="chat" size={16} /><span>{conversation.title}</span>
            </button>

            <button
              className="delete-conversation-button"
              aria-label={`Delete ${conversation.title}`}
              title="Delete conversation"
              onClick={() => {
                const confirmed = window.confirm(
                  "Are you sure you want to delete this conversation?"
                );

                if (confirmed) {
                  onDeleteConversation(conversation.id);
                }
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="sidebar-footer"><span className="footer-mark"><Icon name="spark" size={16} /></span><div><strong>Nova workspace</strong><p>Your conversations, in one place.</p></div></div>
    </aside>
  );
}

export default Sidebar;