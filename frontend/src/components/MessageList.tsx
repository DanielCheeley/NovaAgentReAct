import type { RefObject } from "react";

type Message = {
  sender: "user" | "nova";
  text: string;
};

type MessageListProps = {
  messages: Message[];
  messagesRef: RefObject<HTMLElement | null>;
  isGenerating: boolean;
};

function MessageList({ messages, messagesRef, isGenerating }: MessageListProps) {
  return (
    <section className="messages" ref={messagesRef}>
      {messages.length === 0 ? (
        <div className="welcome">
          <h2>How can I help?</h2>
          <p>Start a conversation with Nova.</p>
        </div>
      ) : (
        <div className="message-list">
          {messages.map((message, index) => (
            <div
              className={
                message.sender === "user"
                  ? "user-message"
                  : "nova-message"
              }
              key={index}
            >
              {message.text}
            </div>
          ))}

          {isGenerating && (
            <div className="nova-thinking">
              <span>●</span>
              <span>●</span>
              <span>●</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default MessageList;