import Icon from "./components/Icon";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isOnline = useBackendHealth();
  const {
    conversations,
    activeConversationId,
    activeConversation,
    generatingConversationIds,
    selectConversation,
    createNewConversation,
    deleteConversation,
    sendMessage: sendChatMessage,
    stopResponse
  } = useChat();

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages]);

  function sendMessage() {
    if (
      !message.trim() ||
      activeConversationId === null ||
      generatingConversationIds.has(activeConversationId)
    )
      return;
    void sendChatMessage(activeConversationId, message);
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  // actual web page
  return (
    <div
      className={`app${sidebarOpen ? " sidebar-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") setSidebarOpen(false);
      }}
    >
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          selectConversation(id);
          setSidebarOpen(false);
        }}
        onNewConversation={() => {
          createNewConversation();
          setSidebarOpen(false);
          textareaRef.current?.focus();
        }}
        onDeleteConversation={deleteConversation}
      />

      <main className="chat-container">
        <header className="chat-header">
          <div className="header-title">
            <button
              className="menu-button"
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Icon name="menu" />
            </button>
            <span className="header-mark">
              <Icon name="spark" />
            </span>
            <div>
              <h2>Nova</h2>
              <p>{activeConversation?.title ?? "Your AI companion"}</p>
            </div>
          </div>
          <span
            className={`nova-status ${isOnline ? "online" : "offline"}`}
            role="status"
          >
            <span className="status-dot" /> {isOnline ? "Online" : "Offline"}
          </span>
        </header>

        <MessageList
          messages={activeConversation?.messages ?? []}
          messagesRef={messagesRef}
          onChoosePrompt={(prompt) => {
            if (activeConversationId === null) createNewConversation();
            setMessage(prompt);
            textareaRef.current?.focus();
          }}
          isGenerating={
            activeConversationId !== null &&
            generatingConversationIds.has(activeConversationId)
          }
        />

        <MessageInput
          message={message}
          setMessage={(value) => {
            if (activeConversationId === null && value.trim())
              createNewConversation();
            setMessage(value);
          }}
          sendMessage={sendMessage}
          textareaRef={textareaRef}
          isGenerating={
            activeConversationId !== null &&
            generatingConversationIds.has(activeConversationId)
          }
          stopResponse={() => {
            if (activeConversationId !== null)
              stopResponse(activeConversationId);
          }}
        />
      </main>
    </div>
  );
}

export default App;
