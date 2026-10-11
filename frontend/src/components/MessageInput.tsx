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
    <div className="input-area">
      <div className="input-container">
        <textarea
          aria-label="Message Nova"
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message Nova..."
          rows={1}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />

        <button
          className={`send-button${isGenerating ? " stop-button" : ""}`}
          disabled={!isGenerating && !message.trim()}
          onClick={isGenerating ? stopResponse : sendMessage}
          aria-label={isGenerating ? "Stop response" : "Send message"}
          title={isGenerating ? "Stop response" : "Send message"}
        >
          <Icon name={isGenerating ? "stop" : "arrow"} size={20} />
        </button>
      </div>
      <div className="composer-footer"><span>Nova can make mistakes. Give important details a second look.</span><span className="keyboard-hint"><kbd>Enter</kbd> to send / <kbd>Shift + Enter</kbd> for a new line</span></div>
    </div>
  );
}

export default MessageInput;
