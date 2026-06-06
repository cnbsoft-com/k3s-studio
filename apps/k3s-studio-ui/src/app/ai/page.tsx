"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Square, Plus, Bot, Settings, Loader2, Trash2, Pencil, Check, X, AlertTriangle, Copy, Menu, Download } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "@/contexts/I18nContext";
import {
  getAiConfig,
  listConversations,
  getMessages,
  streamChat,
  deleteConversation,
  updateConversationTitle,
  confirmManifest,
  cancelManifest,
  type Conversation,
  type PreviewPayload,
} from "@/lib/ai";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

type PreviewStatus = "pending" | "loading" | "done" | "error" | "cancelled";

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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingPreview, setPendingPreview] = useState<PreviewPayload | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string>("");
  const [previewReady, setPreviewReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevConversationIdRef = useRef<number | null>(null);

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
  }, [messages, activeTool, pendingPreview]);

  // 대화 전환 시 pending preview 자동 취소 (null→새ID는 첫 메시지 완료이므로 제외)
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    prevConversationIdRef.current = activeConversationId;
    if (pendingPreview && previewStatus === "pending" &&
        prevId !== null && activeConversationId !== null && prevId !== activeConversationId) {
      cancelManifest(activeConversationId).catch(() => {});
      setPendingPreview(null);
      setPreviewStatus(null);
      setPreviewReady(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const loadConversation = useCallback(async (id: number) => {
    abortRef.current?.abort();
    setActiveConversationId(id);
    const history = await getMessages(id);
    setMessages(history.map((m) => ({ role: m.role, content: m.content })));
  }, []);

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
    setPendingPreview(null);
    setPreviewStatus(null);
    setPreviewReady(false);
  };

  const handleSaveConversation = async (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    const msgs = await getMessages(c.id);
    const lines = msgs.map((m) =>
      `[${m.role.toUpperCase()}] ${new Date(m.createdAt).toLocaleString()}\n${m.content}`
    );
    const content = `# ${c.title ?? `Conversation #${c.id}`}\n\n` + lines.join("\n\n---\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversation-${c.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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

  const handleConfirm = async () => {
    if (!activeConversationId || !pendingPreview) return;
    setPreviewStatus("loading");
    try {
      const res = await confirmManifest(activeConversationId);
      setPreviewStatus("done");
      setPreviewMessage(res.message);
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { error?: string } } };
      const msg = axiosError?.response?.data?.error
        ?? (e instanceof Error ? e.message : "오류 발생");
      setPreviewStatus("error");
      setPreviewMessage(msg);
    }
  };

  const handleCancel = async () => {
    if (!activeConversationId) return;
    await cancelManifest(activeConversationId).catch(() => {});
    setPreviewStatus("cancelled");
    setPreviewMessage("취소되었습니다.");
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const handleSend = async (text?: string) => {
    const userMessage = (text ?? input).trim();
    if (!userMessage || streaming) return;

    setInput("");
    setPendingPreview(null);
    setPreviewStatus(null);
    setPreviewReady(false);
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setStreaming(true);
    setActiveTool(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let newConversationId: number | null = null;

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamChat(userMessage, apiKey, activeConversationId, {
        onText: (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: (updated[updated.length - 1].content || "") + chunk,
            };
            return updated;
          });
        },
        onTool: (toolName) => {
          setActiveTool(toolName);
        },
        onPreview: (payload) => {
          setPendingPreview(payload);
          setPreviewStatus("pending");
          setActiveTool(null);
        },
        onDone: (id) => {
          newConversationId = id;
          setActiveTool(null);
          setPreviewReady(true);
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
      }, controller.signal);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (controller.signal.aborted) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === "assistant" && !last.content ? prev.slice(0, -1) : prev;
        });
        setActiveTool(null);
      } else if (newConversationId && newConversationId !== activeConversationId) {
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

  const isDelete = pendingPreview?.action === "delete_manifest";
  const isDestructiveCluster = pendingPreview?.action === "stop_cluster";
  const isYamlAction = pendingPreview?.action === "apply_manifest" || pendingPreview?.action === "delete_manifest";

  const SidebarContent = () => (
    <>
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
                  onClick={() => { loadConversation(c.id); setSidebarOpen(false); }}
                  className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs truncate min-h-[28px]"
                >
                  {c.title ?? `#${c.id} ${new Date(c.createdAt).toLocaleDateString()}`}
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 pr-1 shrink-0">
                  <button
                    onClick={(e) => handleSaveConversation(c, e)}
                    className="p-0.5 rounded hover:text-foreground"
                    title="대화 저장"
                  >
                    <Download className="w-3 h-3" />
                  </button>
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
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-background border-r shadow-lg transition-transform duration-200">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 border-r bg-muted/20 shrink-0">
        <SidebarContent />
      </aside>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center md:hidden px-3 py-2 border-b gap-2">
          <button onClick={() => setSidebarOpen(true)} className="p-1 rounded hover:bg-accent">
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium truncate">
            {activeConversationId
              ? (conversations.find(c => c.id === activeConversationId)?.title ?? `#${activeConversationId}`)
              : t("ai.new_conversation")}
          </span>
        </div>
        {configMissing && (
          <div className="flex items-center gap-3 px-4 py-2 bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
            <span>{t("ai.config_missing")}</span>
            <Link href="/settings/ai" className="underline font-medium hover:opacity-80">
              {t("ai.config_go_settings")}
            </Link>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !pendingPreview && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="flex flex-col items-center gap-2">
                <Bot className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">k3s-studio AI 관리자</p>
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
              <div className={`relative group max-w-[80%]`}>
              <div
                className={`px-3 py-2 rounded-lg text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                    : "bg-muted prose prose-sm dark:prose-invert max-w-none"
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : msg.content || (streaming && i === messages.length - 1) ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const isBlock = className?.includes("language-");
                        return isBlock ? (
                          <pre className="bg-background/60 rounded p-2 overflow-x-auto text-xs">
                            <code {...props}>{children}</code>
                          </pre>
                        ) : (
                          <code className="bg-background/60 rounded px-1 text-xs" {...props}>
                            {children}
                          </code>
                        );
                      },
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto">
                            <table className="text-xs border-collapse w-full">{children}</table>
                          </div>
                        );
                      },
                      th({ children }) {
                        return <th className="border border-border px-2 py-1 bg-muted/50 text-left">{children}</th>;
                      },
                      td({ children }) {
                        return <td className="border border-border px-2 py-1">{children}</td>;
                      },
                    }}
                  >
                    {msg.content || "▋"}
                  </ReactMarkdown>
                ) : null}
              </div>
              {msg.role === "assistant" && msg.content && (
                <button
                  onClick={() => handleCopy(msg.content, i)}
                  className="absolute -bottom-5 right-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
                  title="복사"
                >
                  {copiedIndex === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              )}
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

          {/* Manifest 미리보기 카드 */}
          {pendingPreview && (
            <div className={`w-full rounded-lg border-2 overflow-hidden ${
              (isDelete || isDestructiveCluster) ? "border-red-400 dark:border-red-600" : "border-blue-400 dark:border-blue-600"
            }`}>
              {/* 헤더 + 버튼 */}
              <div className={`flex items-center justify-between px-4 py-3 ${
                (isDelete || isDestructiveCluster) ? "bg-red-50 dark:bg-red-950/30" : "bg-blue-50 dark:bg-blue-950/30"
              }`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {(isDelete || isDestructiveCluster) && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  <span>
                    {pendingPreview.action === "apply_manifest" && <>클러스터 <strong>{pendingPreview.clusterName}</strong>에 다음 매니페스트를 적용할까요?</>}
                    {pendingPreview.action === "delete_manifest" && <>클러스터 <strong>{pendingPreview.clusterName}</strong>에서 다음 리소스를 삭제할까요?</>}
                    {pendingPreview.action === "scale_deployment" && <>다음 디플로이먼트를 스케일할까요?</>}
                    {pendingPreview.action === "restart_deployment" && <>다음 디플로이먼트를 재시작할까요?</>}
                    {pendingPreview.action === "start_cluster" && <>클러스터 <strong>{pendingPreview.clusterName}</strong>을 시작할까요?</>}
                    {pendingPreview.action === "stop_cluster" && <>클러스터 <strong>{pendingPreview.clusterName}</strong>을 정지할까요?</>}
                    {pendingPreview.action === "create_cluster" && <>클러스터 <strong>{pendingPreview.clusterName}</strong>을 생성할까요?</>}
                  </span>
                </div>
                {previewStatus === "pending" && previewReady && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={handleCancel}
                      className="px-3 py-1 text-xs border rounded hover:bg-accent transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleConfirm}
                      className={`px-3 py-1 text-xs text-white rounded transition-colors ${
                        (isDelete || isDestructiveCluster)
                          ? "bg-red-500 hover:bg-red-600"
                          : "bg-blue-500 hover:bg-blue-600"
                      }`}
                    >
                      {isDelete ? "삭제 확인" : isDestructiveCluster ? "정지 확인" : "확인"}
                    </button>
                  </div>
                )}
                {previewStatus === "pending" && !previewReady && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {previewStatus === "loading" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {isDelete ? "삭제 중..." : "적용 중..."}
                  </div>
                )}
                {(previewStatus === "done" || previewStatus === "error" || previewStatus === "cancelled") && (
                  <span className={`text-xs font-medium ${
                    previewStatus === "done" ? "text-green-600 dark:text-green-400" :
                    previewStatus === "cancelled" ? "text-muted-foreground" : "text-red-600 dark:text-red-400"
                  }`}>
                    {previewStatus === "done" ? `✓ ${previewMessage}` :
                     previewStatus === "cancelled" ? previewMessage : `✗ ${previewMessage}`}
                  </span>
                )}
              </div>
              {/* 상세 정보 */}
              <div className="max-h-64 overflow-y-auto bg-muted/40 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {pendingPreview.yaml}
                </pre>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none min-h-[38px] max-h-[160px] overflow-y-auto"
              placeholder={t("ai.placeholder")}
              value={input}
              rows={1}
              disabled={streaming || configMissing === true}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
              >
                <Square className="w-4 h-4" />
                중단
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || configMissing === true}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
                {t("ai.send")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
