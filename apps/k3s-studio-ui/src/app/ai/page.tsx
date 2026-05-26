"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Plus, Bot, Settings, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/contexts/I18nContext";
import {
  getAiConfig,
  listConversations,
  getMessages,
  streamChat,
  deleteConversation,
  updateConversationTitle,
  type Conversation,
} from "@/lib/ai";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export default function AiPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const apiKey =
    typeof window !== "undefined" ? sessionStorage.getItem("ai_api_key") : null;

  const { data: config } = useQuery({
    queryKey: ["ai-config"],
    queryFn: getAiConfig,
    retry: false,
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["ai-conversations"],
    queryFn: listConversations,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTool]);

  const loadConversation = useCallback(
    async (id: number) => {
      setActiveConversationId(id);
      const history = await getMessages(id);
      setMessages(
        history.map((m) => ({ role: m.role, content: m.content }))
      );
    },
    []
  );

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      updateConversationTitle(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      setEditingId(null);
    },
  });

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
  };

  const startEditing = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditingTitle(c.title ?? `#${c.id}`);
  };

  const confirmRename = (id: number) => {
    const trimmed = editingTitle.trim();
    if (trimmed) renameMutation.mutate({ id, title: trimmed });
    else setEditingId(null);
  };

  const handleSend = async (text?: string) => {
    const userMessage = (text ?? input).trim();
    if (!userMessage || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);
    setActiveTool(null);

    let assistantContent = "";
    let newConversationId: number | null = null;

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamChat(userMessage, apiKey, activeConversationId, {
        onText: (text) => {
          assistantContent += text;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
            return updated;
          });
        },
        onTool: (toolName) => {
          setActiveTool(toolName);
        },
        onDone: (id) => {
          newConversationId = id;
          setActiveTool(null);
        },
        onError: (msg) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: `오류: ${msg}`,
            };
            return updated;
          });
          setActiveTool(null);
        },
      });
    } finally {
      setStreaming(false);
      if (newConversationId && newConversationId !== activeConversationId) {
        setActiveConversationId(newConversationId);
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      }
    }
  };

  const configMissing = config === null;

  const EXAMPLES = [
    t("ai.example.list_servers"),
    t("ai.example.list_clusters"),
    t("ai.example.list_pods"),
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation sidebar */}
      <aside className="hidden md:flex flex-col w-52 border-r bg-muted/20 shrink-0">
        <div className="flex items-center justify-between px-3 py-3 border-b">
          <span className="text-sm font-medium text-muted-foreground">
            {t("ai.conversations")}
          </span>
          <button
            onClick={handleNewConversation}
            className="p-1 rounded hover:bg-accent"
            title={t("ai.new_conversation")}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded transition-colors ${
                activeConversationId === c.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-1 px-1 py-0.5">
                  <input
                    autoFocus
                    className="flex-1 min-w-0 text-xs bg-background border rounded px-1 py-0.5 focus:outline-none"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button onClick={() => confirmRename(c.id)} className="shrink-0 hover:text-foreground">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="shrink-0 hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => loadConversation(c.id)}
                    className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs truncate"
                  >
                    {c.title ?? `#${c.id} ${new Date(c.createdAt).toLocaleDateString()}`}
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5 pr-1 shrink-0">
                    <button
                      onClick={(e) => startEditing(c, e)}
                      className="p-0.5 rounded hover:text-foreground"
                      title="이름 변경"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(c.id); }}
                      className="p-0.5 rounded hover:text-destructive"
                      title="삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Link
            href="/settings/ai"
            className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground rounded hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {t("ai.settings.title")}
          </Link>
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Config missing banner */}
        {configMissing && (
          <div className="flex items-center gap-3 px-4 py-2 bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
            <span>{t("ai.config_missing")}</span>
            <Link
              href="/settings/ai"
              className="underline font-medium hover:opacity-80"
            >
              {t("ai.config_go_settings")}
            </Link>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <Bot className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  k3s-studio AI 관리자
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleSend(ex)}
                    className="px-3 py-1.5 text-xs border rounded-full hover:bg-accent transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {msg.content || (streaming && i === messages.length - 1 ? "▋" : "")}
              </div>
            </div>
          ))}

          {activeTool && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("ai.tool_running")}: {activeTool}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              placeholder={t("ai.placeholder")}
              value={input}
              disabled={streaming || configMissing === true}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={streaming || !input.trim() || configMissing === true}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {streaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t("ai.send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
