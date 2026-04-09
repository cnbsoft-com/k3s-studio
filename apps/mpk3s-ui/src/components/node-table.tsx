import { NodeResponse } from "@/lib/api";
import { Trash2 } from "lucide-react";

interface NodeTableProps {
  nodes: NodeResponse[];
  clusterName: string;
  onDeleteWorker?: (workerName: string) => void;
}

export function NodeTable({ nodes, clusterName, onDeleteWorker }: NodeTableProps) {
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
          {nodes.map((node) => {
            const isMaster = node.name === `${clusterName}-master`;
            return (
              <tr key={node.name} className="hover:bg-muted/50">
                <td className="px-4 py-3 font-mono">{node.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isMaster
                        ? "bg-blue-100 text-blue-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {isMaster ? "마스터" : "워커"}
                  </span>
                </td>
                <td className="px-4 py-3">{node.state}</td>
                <td className="px-4 py-3 font-mono text-xs">{node.ipv4 || "-"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{node.image || "-"}</td>
                <td className="px-4 py-3 text-right">
                  {!isMaster && onDeleteWorker && (
                    <button
                      onClick={() => onDeleteWorker(node.name)}
                      className="text-destructive hover:text-destructive/80 p-1 rounded"
                      title="워커 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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
        </tbody>
      </table>
    </div>
  );
}
