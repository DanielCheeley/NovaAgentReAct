import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 [scrollbar-width:thin] sm:px-7 sm:py-8" ref={messagesRef}>
      {messages.length === 0 ? (
        <div className="relative isolate mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center py-7 text-center sm:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-radial from-primary/10 to-transparent to-65%" />
          <div className="mb-6 grid size-16 place-items-center rounded-[1.35rem] border border-primary/25 bg-linear-to-br from-primary/25 to-primary/5 text-primary shadow-lg shadow-primary/10 ring-8 ring-primary/5 sm:mb-8">
            <Icon name="spark" size={31} />
          </div>
          <h1 className="text-[clamp(1.75rem,5vw,3rem)] leading-[1.1] font-semibold tracking-[-0.055em] text-balance">What are we working on?</h1>
          <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">Ask a question or choose a starting point.</p>
          <div className="mt-7 grid w-full gap-2.5 sm:mt-10 sm:grid-cols-3 sm:gap-3">
            {([
              { icon: "idea", title: "Explore an idea", description: "Find a fresh perspective", prompt: "Help me brainstorm a creative idea. Ask me what I'm working on first." },
              { icon: "code", title: "Build something", description: "Work through a coding challenge", prompt: "Help me work through a coding challenge. Ask me about my project first." },
              { icon: "write", title: "Find the words", description: "Turn a rough thought into a draft", prompt: "Help me turn my thoughts into a clear draft. Ask me what I want to write." },
            ] as const).map((item) => (
              <Button
                key={item.title}
                variant="outline"
                className="group relative h-auto min-w-0 justify-start gap-3 rounded-xl p-3 text-left whitespace-normal sm:flex-col sm:items-start sm:gap-4 sm:p-4"
                onClick={() => onChoosePrompt(item.prompt)}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="flex min-w-0 flex-col gap-1 pr-5 sm:pr-0">
                  <strong className="font-semibold leading-tight">{item.title}</strong>
                  <span className="text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                </span>
                <span aria-hidden="true" className="absolute top-4 right-3 rotate-90 text-muted-foreground transition-colors group-hover:text-primary sm:right-4 sm:rotate-45">
                  <Icon name="arrow" size={15} />
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-7">
          {messages.map((message, index) =>
            message.role === "assistant" &&
            !message.content.trim() &&
            message.status !== "stopped" &&
            message.status !== "error" ? null : (
              <div
                className={cn(
                  "min-w-0 text-sm leading-7 sm:text-[15px]",
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-sm border border-border bg-secondary px-4 py-3 text-secondary-foreground sm:max-w-[85%] sm:px-5"
                    : "w-full",
                )}
                key={index}
              >
                <div className={cn("mb-2 flex items-center gap-2 text-xs font-semibold", message.role === "assistant" ? "text-primary" : "text-muted-foreground")}>
                  {message.role === "assistant" && (
                    <span className="grid size-7 place-items-center rounded-lg bg-primary/10">
                      <Icon name="spark" size={15} />
                    </span>
                  )}
                  {message.role === "user" ? "You" : "Nova"}
                </div>
                <div className="message-markdown">
                  <ReactMarkdown
                    components={{
                      code({ className, children }) {
                        const match = /language-(\w+)/.exec(className || "");

                        return match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="code"
                            CodeTag="span"
                            customStyle={{ background: "transparent" }}
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.status === "stopped" && (
                  <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                    Stopped. Actions already started may still finish.
                  </p>
                )}
                {message.status === "error" && (
                  <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
                    Response interrupted by a connection or model error. Please
                    try again.
                  </p>
                )}
                {message.timing && (
                  <details className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Response timing</summary>
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
              </div>
            )
          )}

          {isGenerating && (
            <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground" role="status">
              <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              Nova is responding
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default MessageList;
