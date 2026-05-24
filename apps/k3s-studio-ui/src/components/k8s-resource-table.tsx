"use client";

import {
  K8sPodResponse,
  K8sServiceResponse,
  K8sDeploymentResponse,
  K8sConfigMapResponse,
} from "@/lib/api";

type ResourceType = "pods" | "services" | "deployments" | "configmaps";

interface K8sResourceTableProps {
  resourceType: ResourceType;
  data: K8sPodResponse[] | K8sServiceResponse[] | K8sDeploymentResponse[] | K8sConfigMapResponse[];
  loading?: boolean;
}

const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";
const td = "px-3 py-2 text-sm whitespace-nowrap";

export function K8sResourceTable({ resourceType, data, loading }: K8sResourceTableProps) {
  if (loading) return <div className="animate-pulse h-24 bg-muted rounded-lg" />;
  if (data.length === 0) return <p className="text-sm text-muted-foreground py-4">리소스가 없습니다.</p>;

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
            {pods.map((p) => (
              <tr key={`${p.namespace}/${p.name}`} className="hover:bg-muted/30">
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
            ))}
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
            {services.map((s) => (
              <tr key={`${s.namespace}/${s.name}`} className="hover:bg-muted/30">
                <td className={td}>{s.name}</td>
                <td className={td}>{s.namespace}</td>
                <td className={td}>{s.type}</td>
                <td className={`${td} font-mono text-xs`}>{s.clusterIp}</td>
                <td className={td}>{s.ports}</td>
                <td className={td}>{s.age}</td>
              </tr>
            ))}
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
            {deployments.map((d) => (
              <tr key={`${d.namespace}/${d.name}`} className="hover:bg-muted/30">
                <td className={td}>{d.name}</td>
                <td className={td}>{d.namespace}</td>
                <td className={td}>{d.ready}</td>
                <td className={td}>{d.upToDate}</td>
                <td className={td}>{d.available}</td>
                <td className={td}>{d.age}</td>
              </tr>
            ))}
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
          {configmaps.map((c) => (
            <tr key={`${c.namespace}/${c.name}`} className="hover:bg-muted/30">
              <td className={td}>{c.name}</td>
              <td className={td}>{c.namespace}</td>
              <td className={td}>{c.data}</td>
              <td className={td}>{c.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
