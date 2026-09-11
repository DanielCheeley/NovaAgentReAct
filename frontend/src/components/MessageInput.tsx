import type { RefObject } from "react";

type MessageInputProps = {
  message: string;
  setMessage: (message: string) => void;
  sendMessage: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

function MessageInput({
  message,
  setMessage,
  sendMessage,
  textareaRef
}: MessageInputProps) {

  const handleInput = () => {
    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="input-area">
      <div className="input-container">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Message Nova..."
          rows={1}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />

        <button className="send-button" onClick={sendMessage}>
          ↑
        </button>
      </div>
    </div>
  );
}

export default MessageInput;