"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createCluster, getImages, getServers, CreateClusterRequest } from "@/lib/api";
import { JobLogViewer } from "@/components/job-log-viewer";
import { ServerStatusBadge } from "@/components/server-status-badge";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Server } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const SPECS = [
  { value: "small",  label: "Small  (2 CPU / 2G 메모리 / 10G 디스크)" },
  { value: "medium", label: "Medium (4 CPU / 4G 메모리 / 20G 디스크)" },
  { value: "large",  label: "Large  (8 CPU / 8G 메모리 / 40G 디스크)" },
  { value: "custom", label: "Custom" },
];

const K3S_COMPONENTS = [
  { key: "traefik",       label: "Traefik (인그레스 컨트롤러)" },
  { key: "flannel",       label: "Flannel (CNI)" },
  { key: "servicelb",     label: "ServiceLB (로드밸런서)" },
  { key: "localStorage",  label: "Local Storage" },
  { key: "metricsServer", label: "Metrics Server" },
];

const schema = z.object({
  serverId: z.number().nullable().optional(),
  name: z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "영문 소문자, 숫자, 하이픈만 허용"),
  masterSpec: z.string(),
  masterCpus: z.number().optional(),
  masterMemory: z.string().optional(),
  masterDisk: z.string().optional(),
  workerCount: z.number().min(0).max(20),
  workerSpec: z.string(),
  workerCpus: z.number().optional(),
  workerMemory: z.string().optional(),
  workerDisk: z.string().optional(),
  ubuntuImage: z.string().min(1),
  options: z.record(z.boolean()),
});

type FormData = z.infer<typeof schema>;

const STEPS = ["서버 선택", "기본 정보", "마스터 스펙", "워커 노드", "이미지 & 컴포넌트", "확인"];

function NewClusterForm() {
  const searchParams = useSearchParams();
  const defaultServerId = searchParams.get("serverId") ? parseInt(searchParams.get("serverId")!) : null;

  const [step, setStep] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: images = [] } = useQuery({ queryKey: ["images"], queryFn: getImages });
  const { data: servers = [] } = useQuery({ queryKey: ["servers"], queryFn: getServers });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      serverId: defaultServerId,
      name: "",
      masterSpec: "medium",
      workerCount: 1,
      workerSpec: "medium",
      ubuntuImage: "",
      options: Object.fromEntries(K3S_COMPONENTS.map((c) => [c.key, true])),
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateClusterRequest) => createCluster(data),
    onSuccess: (res) => setJobId(res.jobId),
    onError: () => toast.error("클러스터 생성 요청 실패"),
  });

  const values = form.watch();
  const selectedServer = servers.find((s) => s.id === values.serverId);

  const onSubmit = (data: FormData) => mutation.mutate(data as CreateClusterRequest);

  if (jobId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">클러스터 생성 중</h1>
        <JobLogViewer jobId={jobId} redirectOnSuccess="/" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">새 클러스터 생성</h1>

      {/* Stepper */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
              i < step ? "bg-primary text-primary-foreground"
              : i === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
              : "bg-muted text-muted-foreground"
            }`}>
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{STEPS[step]}</span>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Step 0: 서버 선택 */}
        {step === 0 && (
          <div className="space-y-3">
            {servers.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 서버가 없습니다.</p>
            ) : (
              servers.map((server) => (
                <label key={server.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 ${
                    values.serverId === server.id ? "border-primary bg-primary/5" : ""
                  }`}>
                  <input
                    type="radio"
                    value={server.id}
                    checked={values.serverId === server.id}
                    onChange={() => form.setValue("serverId", server.id)}
                    className="accent-primary"
                  />
                  <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{server.name}</span>
                      {server.local && <span className="text-xs bg-muted rounded px-1.5 py-0.5">local</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {server.local ? "localhost" : `${server.host}:${server.port}`}
                    </p>
                  </div>
                  <ServerStatusBadge status={server.status} />
                </label>
              ))
            )}
          </div>
        )}

        {/* Step 1: 기본 정보 */}
        {step === 1 && (
          <div className="space-y-4">
            {selectedServer && (
              <div className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
                서버: <span className="font-medium text-foreground">{selectedServer.name}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">클러스터 이름</label>
              <input
                {...form.register("name")}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                placeholder="my-cluster"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">영문 소문자, 숫자, 하이픈 사용 가능</p>
            </div>
          </div>
        )}

        {/* Step 2: 마스터 스펙 */}
        {step === 2 && (
          <div className="space-y-3">
            {SPECS.map((s) => (
              <label key={s.value} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input type="radio" value={s.value} {...form.register("masterSpec")} className="accent-primary" />
                <span className="text-sm">{s.label}</span>
              </label>
            ))}
            {values.masterSpec === "custom" && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-medium mb-1">CPU</label>
                  <input type="number" {...form.register("masterCpus", { valueAsNumber: true })}
                    className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">메모리</label>
                  <input {...form.register("masterMemory")}
                    className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2G" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">디스크</label>
                  <input {...form.register("masterDisk")}
                    className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="10G" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: 워커 노드 */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">워커 수</label>
              <input type="number" min={0} max={20}
                {...form.register("workerCount", { valueAsNumber: true })}
                className="w-32 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
            </div>
            {values.workerCount > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">워커 스펙</label>
                {SPECS.map((s) => (
                  <label key={s.value} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                    <input type="radio" value={s.value} {...form.register("workerSpec")} className="accent-primary" />
                    <span className="text-sm">{s.label}</span>
                  </label>
                ))}
                {values.workerSpec === "custom" && (
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">CPU</label>
                      <input type="number" {...form.register("workerCpus", { valueAsNumber: true })}
                        className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">메모리</label>
                      <input {...form.register("workerMemory")}
                        className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2G" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">디스크</label>
                      <input {...form.register("workerDisk")}
                        className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="10G" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: 이미지 & 컴포넌트 */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Ubuntu 이미지</label>
              <select {...form.register("ubuntuImage")}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background">
                <option value="">-- 선택 --</option>
                {images.map((img) => (
                  <option key={img} value={img}>{img}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">K3s 컴포넌트</label>
              <div className="space-y-2">
                {K3S_COMPONENTS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                    <input type="checkbox"
                      checked={values.options?.[key] ?? true}
                      onChange={(e) => form.setValue(`options.${key}`, e.target.checked)}
                      className="accent-primary h-4 w-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: 확인 */}
        {step === 5 && (
          <div className="rounded-lg border p-5 space-y-3 text-sm">
            <h3 className="font-medium text-base mb-2">설정 요약</h3>
            <Row label="서버" value={selectedServer?.name ?? "미선택"} />
            <Row label="클러스터 이름" value={values.name} />
            <Row label="마스터 스펙" value={values.masterSpec} />
            <Row label="워커 수" value={String(values.workerCount)} />
            <Row label="워커 스펙" value={values.workerSpec} />
            <Row label="이미지" value={values.ubuntuImage} />
            <Row label="활성 컴포넌트"
              value={K3S_COMPONENTS.filter((c) => values.options?.[c.key]).map((c) => c.label).join(", ")} />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6">
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" /> 이전
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90 transition-colors">
              다음 <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={mutation.isPending}
              className="rounded-lg bg-primary text-primary-foreground px-6 py-2 text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {mutation.isPending ? "생성 중..." : "클러스터 생성"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default function NewClusterPage() {
  return (
    <Suspense>
      <NewClusterForm />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );
}
