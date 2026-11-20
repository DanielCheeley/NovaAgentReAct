import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Icon from "./Icon";
import NovaMark from "./NovaMark";
import type { Conversation } from "../types/chat";

type SidebarProps = {
  open: boolean;
  conversations: Conversation[];
  activeConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: number) => void;
};

function Sidebar({
  open,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: SidebarProps) {
  const newConversationRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const deleteTitleId = useId();
  const deleteDescriptionId = useId();

  useEffect(() => {
    if (open) newConversationRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (conversationToDelete) deleteDialogRef.current?.showModal();
  }, [conversationToDelete]);

  return (
    <aside
      id="conversation-sidebar"
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex w-68 max-w-[85vw] shrink-0 flex-col border-r border-border/80 bg-sidebar px-4 py-5 md:relative md:visible md:translate-x-0 lg:w-72",
        open ? "visible translate-x-0" : "invisible -translate-x-full",
      )}
    >
      <div className="mb-7 flex items-center gap-3 px-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-primary text-primary-foreground">
          <NovaMark size={23} />
        </span>
        <div>
          <p className="text-lg leading-tight font-semibold tracking-tight">Nova</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Your AI workspace</p>
        </div>
      </div>

      <Button
        ref={newConversationRef}
        variant="outline"
        className="h-11 justify-start text-primary"
        onClick={onNewConversation}
      >
        <Icon name="plus" size={18} />
        New conversation
      </Button>

      <nav aria-label="Conversations" className="mt-7 flex min-h-0 flex-1 flex-col">
        <p className="mb-3 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
          Conversations
          <span className="tabular-nums">{conversations.length}</span>
        </p>

        <ul className="min-h-0 space-y-1 overflow-y-auto p-1 [scrollbar-width:thin]">
          {conversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            return (
              <li
                key={conversation.id}
                className={cn(
                  "group relative flex items-center gap-1 rounded-lg border border-transparent pr-1 hover:bg-muted",
                  active && "border-primary/20 bg-primary/10 hover:bg-primary/10",
                )}
              >
                <Button
                  variant="ghost"
                  className={cn("min-w-0 flex-1 justify-start px-2 hover:bg-transparent", active && "text-foreground")}
                  aria-current={active ? "page" : undefined}
                  title={conversation.title}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <span className={cn("shrink-0", active && "text-primary")}>
                    <Icon name="chat" size={16} />
                  </span>
                  <span className="truncate">{conversation.title}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 hover:bg-destructive/10 hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
                  aria-label={`Delete ${conversation.title}`}
                  aria-haspopup="dialog"
                  title="Delete conversation"
                  onClick={() => setConversationToDelete(conversation)}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>

      <dialog
        ref={deleteDialogRef}
        role="alertdialog"
        aria-labelledby={deleteTitleId}
        aria-describedby={deleteDescriptionId}
        className="visible fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-black/65 sm:p-6"
        onClose={() => setConversationToDelete(null)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
      >
        <div className="mb-4 grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <Icon name="trash" size={19} />
        </div>
        <h2 id={deleteTitleId} className="text-lg font-semibold tracking-tight">
          Delete conversation?
        </h2>
        <p id={deleteDescriptionId} className="mt-2 text-sm leading-relaxed wrap-anywhere text-muted-foreground">
          This will permanently delete <strong className="font-semibold text-foreground">{conversationToDelete?.title}</strong> and its messages.
        </p>
        <form method="dialog" className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="submit" variant="outline">Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!conversationToDelete) return;
              deleteDialogRef.current?.close();
              newConversationRef.current?.focus();
              onDeleteConversation(conversationToDelete.id);
            }}
          >
            Delete conversation
          </Button>
        </form>
      </dialog>
    </aside>
  );
}

export default Sidebar;
