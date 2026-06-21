"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { useTranslation } from "@/contexts/I18nContext";
import {
  listAiConfigs,
  createAiConfig,
  updateAiConfig,
  deleteAiConfig,
  activateAiConfig,
  type AiModelConfig,
} from "@/lib/ai";

type FormState = { id?: number; name: string; modelUrl: string; modelName: string; apiKey: string };
const EMPTY: FormState = { name: "", modelUrl: "", modelName: "", apiKey: "" };

export default function AiSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
    queryClient.invalidateQueries({ queryKey: ["ai-config"] });
  };

  const [form, setForm] = useState<FormState | null>(null); // null = 폼 닫힘
  const [testing, setTesting] = useState(false);

  const { data: configs = [] } = useQuery({ queryKey: ["ai-configs"], queryFn: listAiConfigs });

  const saveMutation = useMutation({
    mutationFn: (f: FormState) => {
      const payload: AiModelConfig = {
        name: f.name.trim() || null,
        modelUrl: f.modelUrl.trim(),
        modelName: f.modelName.trim(),
        ...(f.apiKey.trim() ? { apiKey: f.apiKey.trim() } : {}),
      };
      return f.id ? updateAiConfig(f.id, payload) : createAiConfig(payload);
    },
    onSuccess: () => { invalidate(); setForm(null); toast.success(t("ai.settings.saved")); },
    onError: () => toast.error(t("common.save") + " 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAiConfig,
    onSuccess: invalidate,
  });

  const activateMutation = useMutation({
    mutationFn: activateAiConfig,
    onSuccess: invalidate,
  });

  const handleTest = async () => {
    if (!form || !form.modelUrl.trim() || !form.modelName.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/ai/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelUrl: form.modelUrl.trim(),
          modelName: form.modelName.trim(),
          ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        }),
      });
      if (res.ok) toast.success(t("ai.settings.test_ok"));
      else toast.error(`${t("ai.settings.test_fail")}: ${await res.text()}`);
    } catch {
      toast.error(t("ai.settings.test_fail"));
    } finally {
      setTesting(false);
    }
  };

  const startEdit = (c: AiModelConfig) =>
    setForm({ id: c.id, name: c.name ?? "", modelUrl: c.modelUrl, modelName: c.modelName, apiKey: "" });

  const canSave = form && form.modelUrl.trim() && form.modelName.trim();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("ai.settings.title")}</h1>
        {!form && (
          <button
            onClick={() => setForm({ ...EMPTY })}
            className="inline-flex items-center gap-1.5 rounded-pill active:scale-95 transition-transform bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> 새 프로파일
          </button>
        )}
      </div>

      {/* 프로파일 목록 */}
      <div className="space-y-2">
        {configs.length === 0 && !form && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            등록된 LLM 서버가 없습니다. &quot;새 프로파일&quot;로 추가하세요.
          </p>
        )}
        {configs.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 rounded-xl border p-3 ${
              c.active ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <button
              onClick={() => c.id && !c.active && activateMutation.mutate(c.id)}
              title={c.active ? "활성 서버" : "이 서버로 전환"}
              className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                c.active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
              }`}
            >
              {c.active && <Check className="w-3 h-3" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{c.name || c.modelName}</span>
                {c.active && <span className="text-xs text-primary font-medium shrink-0">활성</span>}
                {c.hasApiKey && <span className="text-xs text-muted-foreground shrink-0">🔑</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {c.modelName} · {c.modelUrl}
              </div>
            </div>
            <button onClick={() => startEdit(c)} className="p-1.5 rounded-pill active:scale-95 hover:bg-accent" title="수정">
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={() => c.id && deleteMutation.mutate(c.id)}
              className="p-1.5 rounded-pill active:scale-95 hover:bg-destructive/10"
              title="삭제"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          </div>
        ))}
      </div>

      {/* 추가/수정 폼 */}
      {form && (
        <div className="space-y-4 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">{form.id ? "프로파일 수정" : "새 프로파일"}</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">프로파일 이름</label>
            <input
              className="w-full px-4 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="예: rapid-mlx, ollama-local"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("ai.settings.model_url")}</label>
            <input
              className="w-full px-4 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="http://192.168.0.48:8000"
              value={form.modelUrl}
              onChange={(e) => setForm({ ...form, modelUrl: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("ai.settings.model_name")}</label>
            <input
              className="w-full px-4 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={t("ai.settings.model_name_hint")}
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("ai.settings.api_key")}</label>
            <input
              type="password"
              className="w-full px-4 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={form.id ? "변경 시에만 입력 (로컬 서버는 불필요)" : t("ai.settings.api_key_hint")}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => canSave && saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !canSave}
              className="px-5 py-2 text-sm bg-primary text-primary-foreground rounded-pill active:scale-95 transition-[transform,background-color] hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending ? t("common.saving") : t("ai.settings.save")}
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !form.modelUrl.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm border rounded-pill active:scale-95 transition-transform hover:bg-accent disabled:opacity-50"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {testing ? "..." : t("ai.settings.test")}
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-5 py-2 text-sm border rounded-pill active:scale-95 transition-transform hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
