import { useEffect, useRef, useState } from "react";
import { useChat } from "./hooks/useChat";
import { useBackendHealth } from "./hooks/useBackendHealth";
import Sidebar from "./components/Sidebar";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";
import "./App.css";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState("");
  const isOnline = useBackendHealth();
  const {
    conversations,
    activeConversationId,
    activeConversation,
    generatingConversationIds,
    selectConversation,
    createNewConversation,
    deleteConversation,
    sendMessage: sendChatMessage
  } = useChat();

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages]);

  function sendMessage() {
    if (!message.trim() || activeConversationId === null) return;
    void sendChatMessage(activeConversationId, message);
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  // actual web page
  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewConversation={createNewConversation}
        onDeleteConversation={deleteConversation}
      />

      <main className="chat-container">
        <header className="chat-header">
          <h2>Nova</h2>
          <span
            className={`nova-status ${isOnline ? "online" : "offline"}`}
            role="status"
          >
            ● {isOnline ? "Online" : "Offline"}
          </span>
        </header>

        <MessageList
          messages={activeConversation?.messages ?? []}
          messagesRef={messagesRef}
          isGenerating={
            activeConversationId !== null &&
            generatingConversationIds.has(activeConversationId)
          }
        />

        <MessageInput
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          textareaRef={textareaRef}
        />
      </main>
    </div>
  );
}

export default App;
