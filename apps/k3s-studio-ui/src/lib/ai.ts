import { api } from "./api";

export interface AiModelConfig {
  id?: number;
  modelUrl: string;
  modelName: string;
}

export interface Conversation {
  id: number;
  title: string | null;
  createdAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface PreviewPayload {
  action: "apply_manifest" | "delete_manifest";
  yaml: string;
  clusterName: string;
}

export async function getAiConfig(): Promise<AiModelConfig | null> {
  const res = await api.get<AiModelConfig>("/ai/config");
  return res.status === 204 ? null : res.data;
}

export async function saveAiConfig(config: AiModelConfig): Promise<AiModelConfig> {
  const res = await api.put<AiModelConfig>("/ai/config", config);
  return res.data;
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await api.get<Conversation[]>("/ai/conversations");
  return res.data;
}

export async function deleteConversation(id: number): Promise<void> {
  await api.delete(`/ai/conversations/${id}`);
}

export async function updateConversationTitle(id: number, title: string): Promise<Conversation> {
  const res = await api.patch<Conversation>(`/ai/conversations/${id}/title`, { title });
  return res.data;
}

export async function getMessages(conversationId: number): Promise<Message[]> {
  const res = await api.get<Message[]>(`/ai/conversations/${conversationId}/messages`);
  return res.data;
}

export async function confirmManifest(conversationId: number): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>(`/ai/confirm/${conversationId}`);
  return res.data;
}

export async function cancelManifest(conversationId: number): Promise<void> {
  await api.post(`/ai/cancel/${conversationId}`);
}

export interface ChatStreamCallbacks {
  onText: (text: string) => void;
  onTool: (toolName: string) => void;
  onPreview: (payload: PreviewPayload) => void;
  onDone: (conversationId: number) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  message: string,
  apiKey: string | null,
  conversationId: number | null,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const url = new URL("/api/ai/chat", window.location.origin);
  if (conversationId) url.searchParams.set("conversationId", String(conversationId));

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-AI-Api-Key"] = apiKey;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });

  if (!res.ok || !res.body) {
    callbacks.onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatchEvent = (eventType: string, data: string) => {
    if (eventType === "tool") {
      callbacks.onTool(data.replace(/^⚙ /, "").replace(/ 실행 중\.\.\.$/, ""));
    } else if (eventType === "preview") {
      try {
        callbacks.onPreview(JSON.parse(data));
      } catch {
        callbacks.onError("preview 파싱 오류");
      }
    } else if (eventType === "done") {
      callbacks.onDone(parseInt(data, 10));
    } else if (eventType === "error") {
      callbacks.onError(data);
    } else {
      callbacks.onText(data);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      let eventType = "message";
      let dataLines: string[] = [];

      for (const line of event.split("\n")) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length > 0) {
        dispatchEvent(eventType, dataLines.join("\n"));
      }
    }
  }
}
