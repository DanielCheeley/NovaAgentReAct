import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Icon from "./Icon";
import type { RefObject } from "react";

type MessageInputProps = {
  message: string;
  setMessage: (message: string) => void;
  sendMessage: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isGenerating: boolean;
  stopResponse: () => void;
};

function MessageInput({
  message,
  setMessage,
  sendMessage,
  textareaRef,
  isGenerating,
  stopResponse
}: MessageInputProps) {
  const handleInput = () => {
    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isGenerating) sendMessage();
    }
  };

  return (
    <div className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-5">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-card p-2 shadow-xl shadow-black/15 transition-colors focus-within:border-ring/75">
        <Textarea
          className="max-h-44 min-w-0 flex-1 resize-none overflow-y-auto border-0 px-3 py-2.5 leading-5 focus-visible:ring-0"
          aria-label="Message Nova"
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message Nova..."
          rows={1}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />

        <Button
          size="icon"
          variant={isGenerating ? "destructive" : "default"}
          className="rounded-xl"
          disabled={!isGenerating && !message.trim()}
          onClick={isGenerating ? stopResponse : sendMessage}
          aria-label={isGenerating ? "Stop response" : "Send message"}
          title={isGenerating ? "Stop response" : "Send message"}
        >
          <Icon name={isGenerating ? "stop" : "arrow"} size={20} />
        </Button>
      </div>
      <div className="mx-auto mt-3 flex max-w-3xl justify-center gap-3 text-center text-[11px] text-muted-foreground sm:justify-between">
        <span>Nova can make mistakes. Double-check important details.</span>
        <span className="hidden shrink-0 lg:inline">
          <kbd className="font-sans text-foreground/80">Enter</kbd> to send
          <span className="mx-2 text-muted-foreground/60" aria-hidden="true">·</span>
          <kbd className="font-sans text-foreground/80">Shift + Enter</kbd> for a new line
        </span>
      </div>
    </div>
  );
}

export default MessageInput;
