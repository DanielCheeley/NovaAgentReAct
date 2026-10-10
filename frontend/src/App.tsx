// import necessary modules
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "./types/chat.ts";
import { connectWebSocket, disconnectWebSocket, setWebSocketMessageHandler } from "./communication/websocket";
import "./App.css";

// import components
import Sidebar from "./components/Sidebar";
import MessageList from "./components/MessageList";
import MessageInput from "./components/MessageInput";

function App() {
  //set up variables
  // references to the textarea and messages container
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLElement>(null);

  const [activeConversationId, setActiveConversationId] =
  useState<number | null>(null);

  // state for the message input and conversations
  const [message, setMessage] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    async function checkHealth() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 3000);

      try {
        const response = await fetch("http://localhost:3000/health", {
          signal: controller.signal,
          cache: "no-store"
        });
        if (active) setIsOnline(response.ok);
      } catch {
        if (active) setIsOnline(false);
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkHealth();

    return () => {
      active = false;
      controller?.abort();
    };
  }, []);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId
  );

  const [generatingConversationIds, setGeneratingConversationIds] =
    useState<Set<number>>(new Set());


  //set up websocket connection
  useEffect(() => {
  connectWebSocket();

  return () => {
    disconnectWebSocket();
  };
}, []);

useEffect(() => {
  setWebSocketMessageHandler((data) => {
    if (data.type !== "nova.message") {
      return;
    }

    setConversations((currentConversations) => {
      return currentConversations.map((conversation) => {
        //used for active conversation(might be useful later idk)
        // if (conversation.id !== activeConversationId) {
        //   return conversation;
        // }
        if (conversation.id !== data.conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: [
            ...conversation.messages,
            {
              role: "assistant",
              content: data.message
            }
          ]
        };
      });
    });
  });
}, [activeConversationId]);


useEffect(() => {
  async function loadConversations() {
    try {
      const response = await fetch(
        "http://localhost:3000/conversations"
      );

      if (!response.ok) {
        throw new Error(
          `Nova backend returned ${response.status}`
        );
      }

      const data: Conversation[] = await response.json();

      const visibleConversations = data.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.filter(
          (message) =>
            message.role === "user" ||
            (
              message.role === "assistant" &&
              message.content.trim() !== ""
            )
        )
      }));

      setConversations(visibleConversations);

      if (visibleConversations.length > 0) {
        setActiveConversationId(visibleConversations[0].id);
      }
    } catch (error) {
      console.error(
        "Failed to load conversations:",
        error
      );
    }
  }

  loadConversations();
}, []);

  // create new conversation
  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now(),
      title: "New Conversation",
      messages: []
    };

    setConversations((previousConversations) => [
      newConversation,
      ...previousConversations
    ]);

    setActiveConversationId(newConversation.id);
  };

  // update a conversation and move it to the top
  const updateConversation = (
    conversationId: number,
    update: (conversation: Conversation) => Conversation
  ) => {
    setConversations((previousConversations) => {
      const conversation = previousConversations.find(
        (conversation) => conversation.id === conversationId
      );

      if (!conversation) {
        return previousConversations;
      }

      const updatedConversation = update(conversation);

      return [
        updatedConversation,
        ...previousConversations.filter(
          (conversation) => conversation.id !== conversationId
        )
      ];
    });
  };

  // delete a conversation
  const deleteConversation = async (conversationId: number) => {
  try {
    const response = await fetch(
      `http://localhost:3000/conversations/${conversationId}`,
      {
        method: "DELETE"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Nova backend returned ${response.status}`
      );
    }

    setConversations((previousConversations) => {
      const remainingConversations =
        previousConversations.filter(
          (conversation) => conversation.id !== conversationId
        );

      if (activeConversationId === conversationId) {
        setActiveConversationId(
          remainingConversations[0]?.id ?? null
        );
      }

      return remainingConversations;
    });
  } catch (error) {
    console.error(
      "Failed to delete conversation:",
      error
    );
  }
};
  // scroll to bottom when messages change
  useEffect(() => {
    const messagesContainer = messagesRef.current;

    if (!messagesContainer) {
      return;
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, [activeConversation?.messages]);

  // send message
  const sendMessage = async () => {
    if (message.trim() === "") {
      return;
    }

    if (activeConversationId === null) {
      return;
    }

    const conversationId = activeConversationId;
    const userMessage = message;

    // mark conversation as generating
    setGeneratingConversationIds((previousIds) => {
      const newIds = new Set(previousIds);
      newIds.add(conversationId);
      return newIds;
    });

    // add user message and move conversation to top
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: [
        ...conversation.messages,
        {
          role: "user",
          content: userMessage
        }
      ]
    }));

    // clear message box
    setMessage("");

    // reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

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

      if (!response.ok) {
        throw new Error(`Nova backend returned ${response.status}`);
      }

      const data: {
        conversationId: number;
        message: string;
        title: string;
      } = await response.json();

      console.log(data);

      // add Nova response and move conversation to top
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        title: data.title,
        messages: [
          ...conversation.messages,
          {
            role: "assistant",
            content: data.message
          }
        ]
      }));
    } catch (error) {
      console.error("Failed to contact Nova backend:", error);

      // add error message and move conversation to top
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            role: "assistant",
            content: "Sorry, I'm having trouble connecting to my server."
          }
        ]
      }));
    } finally {
      // mark conversation as finished generating
      setGeneratingConversationIds((previousIds) => {
        const newIds = new Set(previousIds);
        newIds.delete(conversationId);
        return newIds;
      });
    }
  };

  // actual web page
  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewConversation={createNewConversation}
        onDeleteConversation={deleteConversation}
      />

      <main className="chat-container">
        <header className="chat-header">
          <h2>Nova</h2>
          <span
            className={`nova-status ${isOnline ? "online" : "offline"}`}
            role="status"
          >
            ● {isOnline ? "Online" : "Offline"}
          </span>
        </header>

        <MessageList
          messages={activeConversation?.messages ?? []}
          messagesRef={messagesRef}
          isGenerating={
            activeConversationId !== null &&
            generatingConversationIds.has(activeConversationId)
          }
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
