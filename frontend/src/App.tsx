import Icon from "./components/Icon";
import { useEffect, useRef, useState } from "react";
import { useChat } from "./hooks/useChat";
import { useBackendHealth } from "./hooks/useBackendHealth";
import Sidebar from "./components/Sidebar";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
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

  function closeNavigation() {
    setSidebarOpen(false);
    menuRef.current?.focus();
  }

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

  return (
    <div
      className="relative flex h-dvh overflow-hidden"
      onKeyDown={(event) => {
        if (sidebarOpen && event.key === "Escape") closeNavigation();
      }}
    >
      {sidebarOpen && (
        <button
          className="absolute inset-0 z-20 bg-black/65 md:hidden"
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={closeNavigation}
        />
      )}
      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          selectConversation(id);
          if (sidebarOpen) closeNavigation();
        }}
        onNewConversation={() => {
          createNewConversation();
          setSidebarOpen(false);
          textareaRef.current?.focus();
        }}
        onDeleteConversation={deleteConversation}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-17 shrink-0 items-center justify-between gap-3 border-b border-border/75 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              ref={menuRef}
              variant="ghost"
              size="icon"
              className="-ml-1 md:hidden"
              aria-controls="conversation-sidebar"
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Icon name="menu" />
            </Button>
            <span className="hidden size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary md:grid">
              <Icon name="spark" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Nova</p>
              <p className="truncate text-xs text-muted-foreground">{activeConversation?.title ?? "Your AI companion"}</p>
            </div>
          </div>
          <Badge role="status" className="bg-card">
            <span
              className={`size-1.5 rounded-full ${isOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d39966]" : "bg-amber-400"}`}
            />
            {isOnline ? "Online" : "Offline"}
          </Badge>
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
