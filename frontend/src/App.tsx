//import nessicary modules
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "./types/chat.ts"
import "./App.css";

//import components
import Sidebar from "./components/Sidebar";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";

function App() {
  //referances to the textarea and messages container
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLElement>(null);

  //state for the message input and the list of messages
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 1,
      title: "New Conversation",
      messages: []
    }
  ]);

  const [activeConversationId, setActiveConversationId] = useState(1);
  const activeConversation = conversations.find ((conversation) => conversation.id === activeConversationId);

  const [generatingConversationIds, setGeneratingConversationIds] = useState<Set<number>>(new Set());

  //create new conversation
  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now(),
      title: "New Conversation",
      messages: []
    };

    setConversations((previousConversations) => [ newConversation, ...previousConversations]);
    setActiveConversationId(newConversation.id);
  }

  //scroll to bottom after sending message
  useEffect(() => {
    const messagesContainer = messagesRef.current;

    if (!messagesContainer) {
      return;
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, [activeConversation?.messages]);

  //sends a message to a new array with previous messages
  const sendMessage = async () => {
    if (message.trim() === "") {
      return;
    }

    const conversationId = activeConversationId;
    const userMessage = message;

    setGeneratingConversationIds((previousIds) => {
      const newIds = new Set(previousIds);
      newIds.add(conversationId);
      return newIds;
    });

    //sets the new array
    setConversations((previousConversations) => {
      const conversation = previousConversations.find((conversation) => conversation.id === conversationId);

      if (!conversation) {
        return previousConversations;
      }

      const updatedConversation = {
          ...conversation, messages: [...conversation.messages,
            {
              sender: "user" as const,
              text: message
            }
          ]
        };
      return [
        updatedConversation, ...previousConversations.filter((conversation) => conversation.id !== activeConversationId)
      ];
    });

    //clears message box
    setMessage("");

    //resets the height to normal after sending message
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    //simulates a delay for Nova's response and respond with a set message
    try {
      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          conversationId,
          message: userMessage
        })
      });

      const data = await response.json();

      console.log(data);
    
      setConversations((previousConversations) =>
        previousConversations.map((conversation) => {
          if (conversation.id !== conversationId) {
            return conversation;
          }
        
          return {
            ...conversation,
            messages: [
              ...conversation.messages,
              {
                sender: "nova" as const,
                text: data.message
              }
            ]
          };
        })
      );
    } catch (error) {
      console.error("Failed to contact Nova backend:", error);
    } finally {
      setGeneratingConversationIds((previousIds) => {
        const newIds = new Set(previousIds);
        newIds.delete(conversationId);
        return newIds;
      });
    }
  };


  //the acual web page
  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewConversation={createNewConversation}
      />

      <main className="chat-container">
        <header className="chat-header">
          <h2>Nova</h2>
          <span className="nova-status">● Online</span>
        </header>

        <MessageList
          messages={activeConversation?.messages ?? []}
          messagesRef={messagesRef}
          isGenerating={generatingConversationIds.has(activeConversationId)}
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