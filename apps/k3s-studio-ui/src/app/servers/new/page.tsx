"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  createServer, updateServer, testServerConnection, checkMultipass, installMultipass,
  discoverClusters, importClusters, DiscoveredCluster,
} from "@/lib/api";
import { SshKeyInput } from "@/components/ssh-key-input";
import { JobLogViewer } from "@/components/job-log-viewer";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "@/contexts/I18nContext";

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  privateKey: string;
}

const inputCls = "w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors";
const btnGhost = "inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-muted transition-colors";

export default function NewServerPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    name: "", host: "", port: "22", username: "", privateKey: "",
  });
  const [serverId, setServerId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [multipassResult, setMultipassResult] = useState<{ installed: boolean; version?: string } | null>(null);
  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredCluster[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const STEPS = [
    t("server.step.info"),
    t("server.step.ssh"),
    t("server.step.multipass"),
    t("server.step.discover"),
  ];

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: createServer,
    onSuccess: (server) => { setServerId(server.id); setStep(1); },
    onError: () => toast.error(t("server.register_failed")),
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      await updateServer(id, {
        name: form.name,
        host: form.host,
        port: parseInt(form.port) || 22,
        username: form.username,
        privateKey: form.privateKey || undefined,
      });
      return testServerConnection(id);
    },
    onSuccess: (res) => {
      setTestResult(res);
      if (res.success) toast.success(t("server.ssh_success"));
      else toast.error(t("server.ssh_failed"));
    },
  });

  const checkMutation = useMutation({
    mutationFn: async (id: number) => {
      await updateServer(id, {
        name: form.name,
        host: form.host,
        port: parseInt(form.port) || 22,
        username: form.username,
        privateKey: form.privateKey || undefined,
      });
      return checkMultipass(id);
    },
    onSuccess: (res) => {
      setMultipassResult(res);
      setStep(2);
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ id, clusters }: { id: number; clusters: DiscoveredCluster[] }) =>
      importClusters(id, clusters),
    onSuccess: () => {
      toast.success(t("server.cluster_registered"));
      router.push(`/servers/${serverId}`);
    },
    onError: () => toast.error(t("server.cluster_register_failed")),
  });

  const installMutation = useMutation({
    mutationFn: (id: number) => installMultipass(id),
    onSuccess: (res) => setInstallJobId(res.jobId),
    onError: () => toast.error(t("server.install_failed")),
  });

  const handleStep0 = () => {
    if (!form.name || !form.host || !form.username) {
      toast.error(t("server.form.required"));
      return;
    }
    createMutation.mutate({
      name: form.name,
      host: form.host,
      port: parseInt(form.port) || 22,
      username: form.username,
      privateKey: form.privateKey || undefined,
    });
  };

  if (installJobId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{t("server.multipass.installing")}</h1>
        <JobLogViewer jobId={installJobId} redirectOnSuccess={`/servers/${serverId}`} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t("server.add")}</h1>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
              i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            } ${i === step ? "ring-2 ring-primary/30" : ""}`}>
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{STEPS[step]}</span>
      </div>

      {/* Step 0: Server info */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("server.form.label")}</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              className={inputCls} placeholder="production-01" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("server.form.host")}</label>
            <input value={form.host} onChange={(e) => set("host", e.target.value)}
              className={inputCls} placeholder="192.168.1.10" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("server.form.port")}</label>
              <input type="number" value={form.port} onChange={(e) => set("port", e.target.value)}
                className={inputCls} placeholder="22" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("server.form.username")}</label>
              <input value={form.username} onChange={(e) => set("username", e.target.value)}
                className={inputCls} placeholder="ubuntu" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleStep0} disabled={createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("common.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: SSH auth */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t("server.form.ssh_key")}</label>
            <SshKeyInput value={form.privateKey} onChange={(v) => set("privateKey", v)} />
          </div>
          <button
            onClick={() => serverId && testMutation.mutate(serverId)}
            disabled={testMutation.isPending}
            className={btnGhost}
          >
            {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("server.form.connection_test")}
          </button>
          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
              testResult.success
                ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                : "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
            }`}>
              {testResult.success ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </div>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)} className={btnGhost}>
              <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
            </button>
            <button
              onClick={() => serverId && checkMutation.mutate(serverId)}
              disabled={!testResult?.success || checkMutation.isPending}
              className={btnPrimary}
            >
              {checkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Multipass check */}
      {step === 2 && (
        <div className="space-y-4">
          {multipassResult?.installed ? (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-400">{t("server.multipass.detected")}</p>
                <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">{multipassResult.version}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-orange-800 dark:text-orange-400">
                <XCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{t("server.multipass.not_installed")}</p>
              </div>
              <button
                onClick={() => serverId && installMutation.mutate(serverId)}
                disabled={installMutation.isPending}
                className={`${btnPrimary} w-full justify-center`}
              >
                {installMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("server.multipass.install")}
              </button>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className={btnGhost}>
              <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
            </button>
            {multipassResult?.installed ? (
              <button
                onClick={async () => {
                  if (!serverId) return;
                  setStep(3);
                  setDiscovering(true);
                  setDiscoverError(false);
                  try {
                    const result = await discoverClusters(serverId);
                    setDiscovered(result);
                    setSelected(new Set(result.map((c) => c.name)));
                  } catch {
                    setDiscoverError(true);
                  } finally {
                    setDiscovering(false);
                  }
                }}
                className={btnPrimary}
              >
                {t("common.next")} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => router.push(`/servers/${serverId}`)} className={btnPrimary}>
                {t("server.register_complete")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Cluster discovery */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("server.discover.description")}
          </p>

          {discovering && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("server.discover.detecting")}
            </div>
          )}

          {discoverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-800 dark:text-red-400">
              {t("server.discover.error")}
            </div>
          )}

          {!discovering && !discoverError && discovered !== null && (
            discovered.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                {t("server.discover.none")}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("server.discover.count", discovered.length)}</p>
                <div className="rounded-lg border divide-y">
                  {discovered.map((c) => (
                    <label key={c.name} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={selected.has(c.name)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(c.name);
                          else next.delete(c.name);
                          setSelected(next);
                        }}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          master: {c.masterIp || "—"} · worker {c.workerCount}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className={btnGhost}>
              <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
            </button>
            <button
              onClick={() => {
                if (!serverId) return;
                const toImport = (discovered ?? []).filter((c) => selected.has(c.name));
                if (toImport.length > 0) {
                  importMutation.mutate({ id: serverId, clusters: toImport });
                } else {
                  router.push(`/servers/${serverId}`);
                }
              }}
              disabled={importMutation.isPending}
              className={btnPrimary}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {selected.size > 0 ? t("server.discover.register", selected.size) : t("server.register_complete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
