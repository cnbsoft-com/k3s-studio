import { NodeResponse, NodeState } from "@/lib/api";
import { NodeStatusBadge } from "@/components/node-status-badge";
import { Trash2, RefreshCw, AlertCircle, Play, Square, RotateCcw, PauseCircle, Loader2, Cpu } from "lucide-react";

interface NodeTableProps {
  nodes: NodeResponse[];
  clusterName: string;
  isLocal?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onDeleteWorker?: (workerName: string) => void;
  onStart?: (nodeName: string) => void;
  onStop?: (nodeName: string) => void;
  onRestart?: (nodeName: string) => void;
  onSuspend?: (nodeName: string) => void;
  onEditHardware?: (nodeName: string) => void;
  pendingNodes?: Set<string>;
  isClusterPending?: boolean;
}

const TRANSIENT: NodeState[] = ["Starting", "Restarting"];

export function NodeTable({
  nodes,
  clusterName,
  isLocal,
  isError,
  onRetry,
  onDeleteWorker,
  onStart,
  onStop,
  onRestart,
  onSuspend,
  onEditHardware,
  pendingNodes = new Set(),
  isClusterPending,
}: NodeTableProps) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-3 font-medium">이름</th>
            <th className="text-left px-4 py-3 font-medium">종류</th>
            <th className="text-left px-4 py-3 font-medium">상태</th>
            <th className="text-left px-4 py-3 font-medium">IP</th>
            <th className="text-left px-4 py-3 font-medium">이미지</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {isError ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center">
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm">노드 정보를 불러오지 못했습니다.</span>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-1"
                    >
                      <RefreshCw className="h-3 w-3" /> 다시 시도
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            <>
              {nodes.map((node) => {
                const isMaster = node.name === `${clusterName}-master`;
                const isPending = pendingNodes.has(node.name) || isClusterPending;
                const isTransient = TRANSIENT.includes(node.state);
                const isRunning = node.state === "Running";
                const canStart = node.state === "Stopped" || node.state === "Suspended";

                return (
                  <tr key={node.name} className={`hover:bg-muted/50 ${isPending ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 font-mono">{node.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isMaster
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                        }`}
                      >
                        {isMaster ? "마스터" : "워커"}
                      </span>
                    </td>
                    <td className="px-4 py-3"><NodeStatusBadge state={node.state} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{node.ipv4 || "-"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{node.image || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {(isPending || isTransient) ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            {canStart && onStart && (
                              <button
                                onClick={() => onStart(node.name)}
                                className="p-1 rounded text-muted-foreground hover:text-green-600"
                                title="시작"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                            {isRunning && onStop && (
                              <button
                                onClick={() => onStop(node.name)}
                                className="p-1 rounded text-muted-foreground hover:text-amber-600"
                                title="중지"
                              >
                                <Square className="h-4 w-4" />
                              </button>
                            )}
                            {isRunning && onRestart && (
                              <button
                                onClick={() => onRestart(node.name)}
                                className="p-1 rounded text-muted-foreground hover:text-blue-600"
                                title="재시작"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )}
                            {isRunning && isLocal && onSuspend && (
                              <button
                                onClick={() => onSuspend(node.name)}
                                className="p-1 rounded text-muted-foreground hover:text-indigo-600"
                                title="일시정지"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </button>
                            )}
                            {node.state === "Stopped" && onEditHardware && (
                              <button
                                onClick={() => onEditHardware(node.name)}
                                className="p-1 rounded text-muted-foreground hover:text-sky-600"
                                title="스펙 수정"
                              >
                                <Cpu className="h-4 w-4" />
                              </button>
                            )}
                            {!isMaster && onDeleteWorker && (
                              <button
                                onClick={() => onDeleteWorker(node.name)}
                                className="p-1 rounded text-destructive hover:text-destructive/80"
                                title="워커 삭제"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    노드 없음
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
