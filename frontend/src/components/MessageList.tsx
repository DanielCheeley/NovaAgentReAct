import Icon from "./Icon";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Message } from "../types/chat";

type MessageListProps = {
  messages: Message[];
  messagesRef: RefObject<HTMLElement | null>;
  isGenerating: boolean;
  onChoosePrompt: (prompt: string) => void;
};

function MessageList({
  messages,
  messagesRef,
  isGenerating,
  onChoosePrompt
}: MessageListProps) {
  return (
    <section className="messages" ref={messagesRef}>
      {messages.length === 0 ? (
        <div className="welcome">
          <div className="welcome-orb"><Icon name="spark" size={26} /></div>
          <h2>What are we working on?</h2>
          <p>Ask a question or choose a starting point.</p>
          <div className="prompt-grid">
            {([
              { icon: "idea", title: "Explore an idea", description: "Find a fresh perspective", prompt: "Help me brainstorm a creative idea. Ask me what I'm working on first." },
              { icon: "code", title: "Build something", description: "Work through a coding challenge", prompt: "Help me work through a coding challenge. Ask me about my project first." },
              { icon: "write", title: "Find the words", description: "Turn a rough thought into a draft", prompt: "Help me turn my thoughts into a clear draft. Ask me what I want to write." },
            ] as const).map((item) => <button className="prompt-card" key={item.title} onClick={() => onChoosePrompt(item.prompt)}><Icon name={item.icon} size={21} /><strong>{item.title}</strong><span>{item.description}</span><span className="prompt-arrow"><Icon name="arrow" size={16} /></span></button>)}
          </div>
        </div>
      ) : (
        <div className="message-list">
          {messages.map((message, index) =>
            message.role === "assistant" &&
            !message.content.trim() &&
            message.status !== "stopped" &&
            message.status !== "error" ? null : (
              <div
                className={
                  message.role === "user" ? "user-message" : "nova-message"
                }
                key={index}
              >
                <div className="message-author">{message.role === "assistant" && <Icon name="spark" size={15} />}{message.role === "user" ? "You" : "Nova"}</div>
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
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.status === "stopped" && (
                  <p className="response-status">
                    Stopped. Actions already started may still finish.
                  </p>
                )}
                {message.status === "error" && (
                  <p className="response-status">
                    Response interrupted by a connection or model error. Please
                    try again.
                  </p>
                )}
                {message.timing && (
                  <details className="response-timing">
                    <summary>Response timing</summary>
                    <p>
                      First text:{" "}
                      {message.timing.firstContentMs === null
                        ? "unavailable"
                        : `${(message.timing.firstContentMs / 1000).toFixed(2)}s`}{" "}
                      · Total: {(message.timing.elapsedMs / 1000).toFixed(2)}s
                    </p>
                    {message.timing.models.map((model, index) => (
                      <p key={index}>
                        Model {index + 1}: load{" "}
                        {model.loadMs === null
                          ? "n/a"
                          : `${model.loadMs.toFixed(0)}ms`}
                        , prompt{" "}
                        {model.promptMs === null
                          ? "n/a"
                          : `${model.promptMs.toFixed(0)}ms`}
                        , generation{" "}
                        {model.generationMs === null
                          ? "n/a"
                          : `${model.generationMs.toFixed(0)}ms`}
                      </p>
                    ))}
                    {message.timing.tools.map((tool, index) => (
                      <p key={index}>
                        {tool.name}: {tool.elapsedMs.toFixed(0)}ms (
                        {tool.success ? "success" : "failed"})
                      </p>
                    ))}
                  </details>
                )}
                {/* was <ReactMarkdown>{message.text}</ReactMarkdown> but swithced for code readablity*/}
              </div>
            )
          )}

          {isGenerating && (
            <div className="nova-thinking" role="status" aria-label="Nova is responding">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default MessageList;
