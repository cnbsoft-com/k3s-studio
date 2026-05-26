"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/I18nContext";
import { getAiConfig, saveAiConfig, type AiModelConfig } from "@/lib/ai";

export default function AiSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [modelUrl, setModelUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["ai-config"],
    queryFn: getAiConfig,
    retry: false,
  });

  useEffect(() => {
    if (config) {
      setModelUrl(config.modelUrl);
      setModelName(config.modelName);
    }
    const stored = sessionStorage.getItem("ai_api_key");
    if (stored) setApiKey(stored);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (data: AiModelConfig) => saveAiConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      if (apiKey) {
        sessionStorage.setItem("ai_api_key", apiKey);
      } else {
        sessionStorage.removeItem("ai_api_key");
      }
      toast.success(t("ai.settings.saved"));
    },
    onError: () => toast.error(t("common.save") + " 실패"),
  });

  const handleSave = () => {
    if (!modelUrl.trim() || !modelName.trim()) return;
    saveMutation.mutate({ modelUrl: modelUrl.trim(), modelName: modelName.trim() });
  };

  const handleTest = async () => {
    if (!modelUrl.trim() || !modelName.trim()) return;
    setTesting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["X-AI-Api-Key"] = apiKey;

      const res = await fetch("/api/ai/config/test", {
        method: "POST",
        headers,
        body: JSON.stringify({ modelUrl: modelUrl.trim(), modelName: modelName.trim() }),
      });
      if (res.ok) {
        toast.success(t("ai.settings.test_ok"));
      } else {
        const msg = await res.text();
        toast.error(`${t("ai.settings.test_fail")}: ${msg}`);
      }
    } catch {
      toast.error(t("ai.settings.test_fail"));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold">{t("ai.settings.title")}</h1>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("ai.settings.model_url")}</label>
          <input
            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("ai.settings.model_url_hint")}
            value={modelUrl}
            onChange={(e) => setModelUrl(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("ai.settings.model_name")}</label>
          <input
            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("ai.settings.model_name_hint")}
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("ai.settings.api_key")}</label>
          <input
            type="password"
            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("ai.settings.api_key_hint")}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("ai.settings.api_key_hint")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !modelUrl.trim() || !modelName.trim()}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveMutation.isPending ? t("common.saving") : t("ai.settings.save")}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !modelUrl.trim()}
          className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? "..." : t("ai.settings.test")}
        </button>
      </div>
    </div>
  );
}
