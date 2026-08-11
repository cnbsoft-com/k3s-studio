"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createCluster, getImages, getServers, getServerNetworks, CreateClusterRequest, NetworkInterfaceInfo } from "@/lib/api";
import { JobLogViewer } from "@/components/job-log-viewer";
import { ServerStatusBadge } from "@/components/server-status-badge";
import { Breadcrumb } from "@/components/breadcrumb";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Server, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useTranslation } from "@/contexts/I18nContext";

const schema = z.object({
  serverId: z.number().nullable().optional(),
  name: z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
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
  networkInterface: z.string().optional(),
  networkInterfaceCidr: z.string().optional(),
  sshPublicKey: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function NewClusterForm() {
  const searchParams = useSearchParams();
  const defaultServerId = searchParams.get("serverId") ? parseInt(searchParams.get("serverId")!) : null;
  const { t } = useTranslation();

  const SPECS = [
    { value: "small",  label: t("cluster.spec.small") },
    { value: "medium", label: t("cluster.spec.medium") },
    { value: "large",  label: t("cluster.spec.large") },
    { value: "custom", label: t("cluster.spec.custom") },
  ];

  const K3S_COMPONENTS = [
    { key: "traefik",       label: t("cluster.component.traefik") },
    { key: "flannel",       label: t("cluster.component.flannel") },
    { key: "servicelb",     label: t("cluster.component.servicelb") },
    { key: "localStorage",  label: t("cluster.component.localStorage") },
    { key: "metricsServer", label: t("cluster.component.metricsServer") },
  ];

  const STEPS = [
    t("cluster.step.server"),
    t("cluster.step.info"),
    t("cluster.step.master"),
    t("cluster.step.worker"),
    t("cluster.step.image"),
    t("cluster.step.network"),
    t("cluster.step.review"),
  ];

  const [step, setStep] = useState(defaultServerId !== null ? 1 : 0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [networks, setNetworks] = useState<NetworkInterfaceInfo[]>([]);

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
      networkInterface: "",
      networkInterfaceCidr: "",
      sshPublicKey: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateClusterRequest) => createCluster(data),
    onSuccess: (res) => {
      setJobId(res.jobId);
      toast.success(t("cluster.create_started"));
    },
    onError: () => toast.error(t("cluster.create_failed")),
  });

  const values = form.watch();
  const selectedServer = servers.find((s) => s.id === values.serverId);
  const selectedNetwork = networks.find((n) => n.name === values.networkInterface);

  // 서버 선택 변경 시 네트워크 목록 프리로드
  useEffect(() => {
    const serverId = values.serverId ?? null;
    getServerNetworks(serverId).then(setNetworks).catch(() => setNetworks([]));
  }, [values.serverId]);

  const onSubmit = (data: FormData) => {
    const payload: CreateClusterRequest = {
      ...data,
      networkInterface: data.networkInterface || undefined,
      networkInterfaceCidr: data.networkInterfaceCidr || undefined,
      sshPublicKey: data.sshPublicKey || undefined,
    };
    mutation.mutate(payload);
  };
  const onValidationError = () => toast.error(t("cluster.validation_error"));

  const handleNext = async () => {
    if (step === 4) {
      const valid = await form.trigger("ubuntuImage");
      if (!valid) return;
    }
    setStep((s) => s + 1);
  };

  // 네트워크 인터페이스 선택 시 CIDR 자동 설정
  const handleNetworkChange = (ifaceName: string) => {
    form.setValue("networkInterface", ifaceName);
    const found = networks.find((n) => n.name === ifaceName);
    form.setValue("networkInterfaceCidr", found?.cidr ?? "");
  };

  if (jobId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{t("cluster.creating_title")}</h1>
        <JobLogViewer jobId={jobId} redirectOnSuccess="/" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <Breadcrumb items={[{ label: t("dashboard.title"), href: "/" }, { label: t("cluster.new") }]} />
        <h1 className="text-2xl font-bold">{t("cluster.create")}</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i >= step}
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i < step
                    ? "bg-primary text-primary-foreground hover:bg-primary/80 cursor-pointer"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 cursor-default"
                    : "bg-muted text-muted-foreground cursor-default"
                }`}
                aria-label={s}
              >
                {i + 1}
              </button>
              <span className={`hidden sm:block text-xs mt-1 whitespace-nowrap ${
                i === step ? "text-foreground font-medium" : "text-muted-foreground"
              }`}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-4 sm:mb-0 ${i < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>
      <p className="sm:hidden text-sm text-muted-foreground -mt-2">{STEPS[step]}</p>

      <form onSubmit={form.handleSubmit(onSubmit, onValidationError)}>
        {/* Step 0: Server selection */}
        {step === 0 && (
          <div className="space-y-3">
            {servers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("server.no_servers")}</p>
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

        {/* Step 1: Basic info */}
        {step === 1 && (
          <div className="space-y-4">
            {selectedServer && (
              <div className="text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
                {t("cluster.server")}: <span className="font-medium text-foreground">{selectedServer.name}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.name")}</label>
              <input
                {...form.register("name")}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                placeholder="my-cluster"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">{t("cluster.name_validation")}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{t("cluster.name_hint")}</p>
            </div>
          </div>
        )}

        {/* Step 2: Master spec */}
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
                  <label className="block text-xs font-medium mb-1">{t("cluster.memory")}</label>
                  <input {...form.register("masterMemory")}
                    className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2G" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{t("cluster.disk")}</label>
                  <input {...form.register("masterDisk")}
                    className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="10G" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Worker nodes */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.worker_count")}</label>
              <input type="number" min={0} max={20}
                {...form.register("workerCount", { valueAsNumber: true })}
                className="w-32 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
            </div>
            {values.workerCount > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium">{t("cluster.worker_spec")}</label>
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
                      <label className="block text-xs font-medium mb-1">{t("cluster.memory")}</label>
                      <input {...form.register("workerMemory")}
                        className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="2G" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">{t("cluster.disk")}</label>
                      <input {...form.register("workerDisk")}
                        className="w-full rounded border px-2 py-1 text-sm bg-background" placeholder="10G" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Image & components */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.ubuntu_image")}</label>
              <select {...form.register("ubuntuImage")}
                className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background ${form.formState.errors.ubuntuImage ? "border-destructive" : ""}`}>
                <option value="">{t("cluster.image_select")}</option>
                {images.map((img) => (
                  <option key={img} value={img}>{img}</option>
                ))}
              </select>
              {form.formState.errors.ubuntuImage && (
                <p className="text-xs text-destructive mt-1">{t("cluster.image_required")}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t("cluster.k3s_components")}</label>
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

        {/* Step 5: Network */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                동일 네트워크 PC에서 클러스터에 직접 접근하려면 물리 인터페이스를 선택하세요. 선택하지 않으면 기본 DHCP로 생성됩니다.
              </p>
              <label className="block text-sm font-medium mb-1">{t("cluster.step.network")}</label>
              <select
                value={values.networkInterface ?? ""}
                onChange={(e) => handleNetworkChange(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              >
                <option value="">브리지 없음 (기본 DHCP)</option>
                {networks.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name} — {n.type}{n.cidr ? ` (${n.cidr})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedNetwork?.cidr && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-3 py-2">
                <span>서브넷:</span>
                <span className="font-medium text-foreground">{selectedNetwork.cidr}</span>
              </div>
            )}
            {networks.length === 0 && (
              <p className="text-xs text-muted-foreground">네트워크 인터페이스를 불러오는 중이거나 사용 가능한 인터페이스가 없습니다.</p>
            )}
            <div className="pt-2">
              <label className="block text-sm font-medium mb-1">SSH 공개키 (선택)</label>
              <p className="text-xs text-muted-foreground mb-2">
                입력하면 multipass shell/exec와 무관하게 노드에 <code>ssh ubuntu@&lt;node-ip&gt;</code>로 직접 접속할 수 있습니다.
              </p>
              <textarea
                {...form.register("sshPublicKey")}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                placeholder="ssh-ed25519 AAAA... user@host"
              />
            </div>
          </div>
        )}

        {/* Step 6: Review */}
        {step === 6 && (
          <div className="rounded-lg border p-5 space-y-3 text-sm">
            <h3 className="font-medium text-base mb-2">{t("cluster.summary")}</h3>
            <Row label={t("cluster.server")} value={selectedServer?.name ?? t("cluster.unselected")} />
            <Row label={t("cluster.name")} value={values.name} />
            <Row label={t("cluster.master_spec")} value={values.masterSpec} />
            <Row label={t("cluster.worker_count")} value={String(values.workerCount)} />
            <Row label={t("cluster.worker_spec")} value={values.workerSpec} />
            <Row label={t("cluster.image")} value={values.ubuntuImage} />
            <Row label={t("cluster.k3s_components")}
              value={K3S_COMPONENTS.filter((c) => values.options?.[c.key]).map((c) => c.label).join(", ")} />
            <Row label={t("cluster.step.network")}
              value={values.networkInterface
                ? `${values.networkInterface}${selectedNetwork?.cidr ? ` (${selectedNetwork.cidr})` : ""}`
                : "브리지 없음"} />
            <Row label="SSH 공개키" value={values.sshPublicKey ? "설정됨" : "미설정"} />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-6">
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-pill active:scale-95 border px-4 py-2 text-sm disabled:opacity-40 hover:bg-muted transition-all">
            <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={handleNext}
              className="inline-flex items-center gap-1 rounded-pill active:scale-95 bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90 transition-all">
              {t("common.next")} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={mutation.isPending}
              className="inline-flex items-center gap-2 rounded-pill active:scale-95 bg-primary text-primary-foreground px-6 py-2 text-sm hover:bg-primary/90 disabled:opacity-60 transition-all">
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mutation.isPending ? t("common.creating") : t("cluster.create")}
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
