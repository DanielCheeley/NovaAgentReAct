import type { RefObject } from "react";
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");

                    return match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.text}
              </ReactMarkdown>
              {/* was <ReactMarkdown>{message.text}</ReactMarkdown> but swithced for code readablity*/}
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