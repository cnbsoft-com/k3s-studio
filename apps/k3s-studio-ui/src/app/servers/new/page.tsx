"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  createServer, testServerConnection, checkMultipass, installMultipass,
  discoverClusters, importClusters, DiscoveredCluster,
} from "@/lib/api";
import { SshKeyInput } from "@/components/ssh-key-input";
import { JobLogViewer } from "@/components/job-log-viewer";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Loader2 } from "lucide-react";

const STEPS = ["서버 정보", "SSH 인증", "Multipass 확인", "클러스터 감지"];

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

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: createServer,
    onSuccess: (server) => { setServerId(server.id); setStep(1); },
    onError: () => toast.error("서버 등록 실패"),
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => testServerConnection(id),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.success) toast.success("SSH 연결 성공");
      else toast.error("SSH 연결 실패");
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => checkMultipass(id),
    onSuccess: (res) => {
      setMultipassResult(res);
      if (res.installed) {
        setStep(2);
      } else {
        // Multipass 미설치 시 Step 2에서 완료 처리 (Step 3 skip)
        setStep(2);
      }
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ id, clusters }: { id: number; clusters: DiscoveredCluster[] }) =>
      importClusters(id, clusters),
    onSuccess: () => {
      toast.success("클러스터 등록 완료");
      router.push(`/servers/${serverId}`);
    },
    onError: () => toast.error("클러스터 등록 실패"),
  });

  const installMutation = useMutation({
    mutationFn: (id: number) => installMultipass(id),
    onSuccess: (res) => setInstallJobId(res.jobId),
    onError: () => toast.error("Multipass 설치 시작 실패"),
  });

  const handleStep0 = () => {
    if (!form.name || !form.host || !form.username) {
      toast.error("필수 항목을 입력해주세요.");
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
        <h1 className="text-2xl font-bold">Multipass 설치 중</h1>
        <JobLogViewer jobId={installJobId} redirectOnSuccess={`/servers/${serverId}`} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">서버 추가</h1>

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

      {/* Step 0: 서버 정보 */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">레이블 이름 *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              className={inputCls} placeholder="production-01" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Host (IP 또는 도메인) *</label>
            <input value={form.host} onChange={(e) => set("host", e.target.value)}
              className={inputCls} placeholder="192.168.1.10" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">SSH Port</label>
              <input type="number" value={form.port} onChange={(e) => set("port", e.target.value)}
                className={inputCls} placeholder="22" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Username *</label>
              <input value={form.username} onChange={(e) => set("username", e.target.value)}
                className={inputCls} placeholder="ubuntu" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleStep0} disabled={createMutation.isPending} className={btnPrimary}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              다음 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: SSH 인증 */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">SSH Private Key</label>
            <SshKeyInput value={form.privateKey} onChange={(v) => set("privateKey", v)} />
          </div>
          <button
            onClick={() => serverId && testMutation.mutate(serverId)}
            disabled={testMutation.isPending}
            className={btnGhost}
          >
            {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            연결 테스트
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
              <ChevronLeft className="h-4 w-4" /> 이전
            </button>
            <button
              onClick={() => serverId && checkMutation.mutate(serverId)}
              disabled={!testResult?.success || checkMutation.isPending}
              className={btnPrimary}
            >
              {checkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              다음 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Multipass 확인 */}
      {step === 2 && (
        <div className="space-y-4">
          {multipassResult?.installed ? (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-400">Multipass 감지됨</p>
                <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">{multipassResult.version}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800 p-4 space-y-3">
              <div className="flex items-center gap-2 text-orange-800 dark:text-orange-400">
                <XCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">Multipass 미설치</p>
              </div>
              <button
                onClick={() => serverId && installMutation.mutate(serverId)}
                disabled={installMutation.isPending}
                className={`${btnPrimary} w-full justify-center`}
              >
                {installMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                설치하고 등록
              </button>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className={btnGhost}>
              <ChevronLeft className="h-4 w-4" /> 이전
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
                다음 <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => router.push(`/servers/${serverId}`)} className={btnPrimary}>
                등록 완료
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: 클러스터 감지 */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            이 서버의 Multipass에서 기존 K3s 클러스터를 감지합니다.
          </p>

          {discovering && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              클러스터 감지 중...
            </div>
          )}

          {discoverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-800 dark:text-red-400">
              감지 중 오류가 발생했습니다. 서버를 먼저 등록하고 나중에 다시 시도할 수 있습니다.
            </div>
          )}

          {!discovering && !discoverError && discovered !== null && (
            discovered.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                감지된 기존 클러스터가 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">{discovered.length}개 클러스터 감지됨</p>
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
                          master: {c.masterIp || "—"} · worker {c.workerCount}개
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
              <ChevronLeft className="h-4 w-4" /> 이전
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
              {selected.size > 0 ? `${selected.size}개 등록 완료` : "등록 완료"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
