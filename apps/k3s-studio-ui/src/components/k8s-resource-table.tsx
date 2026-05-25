"use client";

import {
  K8sPodResponse,
  K8sServiceResponse,
  K8sDeploymentResponse,
  K8sConfigMapResponse,
  K8sStatefulSetResponse,
  K8sIngressResponse,
  K8sSecretResponse,
} from "@/lib/api";
import { useTranslation } from "@/contexts/I18nContext";

type ResourceType = "pods" | "services" | "deployments" | "configmaps" | "statefulsets" | "ingresses" | "secrets";

interface K8sResourceTableProps {
  resourceType: ResourceType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  loading?: boolean;
  selectedKey?: string | null;
  onSelect?: (namespace: string, name: string) => void;
}

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";
const td = "px-3 py-2 text-sm whitespace-nowrap";

function rowCls(isSelected: boolean) {
  return `cursor-pointer transition-colors ${
    isSelected
      ? "bg-primary/10 border-l-2 border-primary"
      : "hover:bg-muted/30"
  }`;
}

export function K8sResourceTable({ resourceType, data, loading, selectedKey, onSelect }: K8sResourceTableProps) {
  const { t } = useTranslation();
  if (loading) return <div className="animate-pulse h-24 bg-muted rounded-lg" />;
  if (data.length === 0) return <p className="text-sm text-muted-foreground py-4">{t("k8s.no_resources")}</p>;

  if (resourceType === "pods") {
    const pods = data as K8sPodResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Namespace</th>
              <th className={th}>Status</th>
              <th className={th}>Ready</th>
              <th className={th}>Age</th>
              <th className={th}>Node</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pods.map((p) => {
              const key = `${p.namespace}/${p.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(p.namespace, p.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.namespace}</td>
                  <td className={td}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "Running" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : p.status === "Pending" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>{p.status}</span>
                  </td>
                  <td className={td}>{p.ready}</td>
                  <td className={td}>{p.age}</td>
                  <td className={`${td} text-muted-foreground`}>{p.hostIp || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (resourceType === "services") {
    const services = data as K8sServiceResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Namespace</th>
              <th className={th}>Type</th>
              <th className={th}>Cluster-IP</th>
              <th className={th}>Ports</th>
              <th className={th}>Age</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {services.map((s) => {
              const key = `${s.namespace}/${s.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(s.namespace, s.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{s.name}</td>
                  <td className={td}>{s.namespace}</td>
                  <td className={td}>{s.type}</td>
                  <td className={`${td} font-mono text-xs`}>{s.clusterIp}</td>
                  <td className={td}>{s.ports}</td>
                  <td className={td}>{s.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (resourceType === "deployments") {
    const deployments = data as K8sDeploymentResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Namespace</th>
              <th className={th}>Ready</th>
              <th className={th}>Up-to-date</th>
              <th className={th}>Available</th>
              <th className={th}>Age</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {deployments.map((d) => {
              const key = `${d.namespace}/${d.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(d.namespace, d.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{d.name}</td>
                  <td className={td}>{d.namespace}</td>
                  <td className={td}>{d.ready}</td>
                  <td className={td}>{d.upToDate}</td>
                  <td className={td}>{d.available}</td>
                  <td className={td}>{d.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (resourceType === "statefulsets") {
    const sets = data as K8sStatefulSetResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50"><tr>
            <th className={th}>Name</th><th className={th}>Namespace</th>
            <th className={th}>Ready</th><th className={th}>Age</th>
          </tr></thead>
          <tbody className="divide-y">
            {sets.map((s) => {
              const key = `${s.namespace}/${s.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(s.namespace, s.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{s.name}</td><td className={td}>{s.namespace}</td>
                  <td className={td}>{s.ready}</td><td className={td}>{s.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (resourceType === "ingresses") {
    const ingresses = data as K8sIngressResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50"><tr>
            <th className={th}>Name</th><th className={th}>Namespace</th>
            <th className={th}>Hosts</th><th className={th}>Age</th>
          </tr></thead>
          <tbody className="divide-y">
            {ingresses.map((i) => {
              const key = `${i.namespace}/${i.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(i.namespace, i.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{i.name}</td><td className={td}>{i.namespace}</td>
                  <td className={td}>{i.hosts}</td><td className={td}>{i.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (resourceType === "secrets") {
    const secrets = data as K8sSecretResponse[];
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full">
          <thead className="bg-muted/50"><tr>
            <th className={th}>Name</th><th className={th}>Namespace</th>
            <th className={th}>Type</th><th className={th}>Data</th><th className={th}>Age</th>
          </tr></thead>
          <tbody className="divide-y">
            {secrets.map((s) => {
              const key = `${s.namespace}/${s.name}`;
              return (
                <tr key={key} onClick={() => onSelect?.(s.namespace, s.name)} className={rowCls(selectedKey === key)}>
                  <td className={td}>{s.name}</td><td className={td}>{s.namespace}</td>
                  <td className={`${td} text-xs text-muted-foreground`}>{s.type}</td>
                  <td className={td}>{s.dataCount}</td><td className={td}>{s.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // configmaps
  const configmaps = data as K8sConfigMapResponse[];
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Namespace</th>
            <th className={th}>Data</th>
            <th className={th}>Age</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {configmaps.map((c) => {
            const key = `${c.namespace}/${c.name}`;
            return (
              <tr key={key} onClick={() => onSelect?.(c.namespace, c.name)} className={rowCls(selectedKey === key)}>
                <td className={td}>{c.name}</td>
                <td className={td}>{c.namespace}</td>
                <td className={td}>{c.data}</td>
                <td className={td}>{c.age}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
