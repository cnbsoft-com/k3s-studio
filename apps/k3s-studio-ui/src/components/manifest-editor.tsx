"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getManifestTemplates,
  deleteManifestTemplate,
} from "@/lib/api";

interface ManifestEditorProps {
  value: string;
  onChange: (yaml: string) => void;
  clusterName: string;
  onApply: (yaml: string) => void;
  onDelete: (yaml: string) => void;
  onSaveTemplate?: () => void;
  applyPending?: boolean;
  deletePending?: boolean;
}

export function ManifestEditor({
  value, onChange, clusterName,
  onApply, onDelete, onSaveTemplate,
  applyPending, deletePending,
}: ManifestEditorProps) {
  const [showTemplates, setShowTemplates] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ["manifest-templates", clusterName],
    queryFn: () => getManifestTemplates(clusterName),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteManifestTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manifest-templates", clusterName] });
      toast.success("Template 삭제 완료");
    },
    onError: () => toast.error("삭제 실패"),
  });

  const isPending = applyPending || deletePending;

  const handleTemplateDelete = (e: React.MouseEvent, id: number, tmplName: string) => {
    e.stopPropagation();
    if (!confirm(`"${tmplName}" Template을 삭제하시겠습니까?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-2">
      {/* Template 불러오기 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Template에서 불러오기 {showTemplates ? "▲" : "▾"}
        </button>
        <span className="text-xs text-muted-foreground">{templates.length}개</span>
      </div>

      {showTemplates && templates.length > 0 && (
        <div className="rounded-md border divide-y text-sm max-h-48 overflow-y-auto">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center px-3 py-2 hover:bg-muted/50 gap-2">
              <button
                className="flex-1 text-left"
                onClick={() => { onChange(t.yamlContent); setShowTemplates(false); }}
              >
                <span className="font-medium">{t.name}</span>
                {t.description && (
                  <span className="ml-2 text-xs text-muted-foreground">{t.description}</span>
                )}
              </button>
              <button
                onClick={(e) => handleTemplateDelete(e, t.id, t.name)}
                className="text-muted-foreground hover:text-destructive text-lg leading-none px-1"
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showTemplates && templates.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">저장된 Template이 없습니다.</p>
      )}

      {/* Editor */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-app\n..."}
        rows={10}
        className="w-full rounded-md border px-3 py-2 text-sm font-mono bg-background resize-y"
      />

      {/* Actions */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => onApply(value)}
          disabled={!value.trim() || isPending}
          className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {applyPending ? "적용 중..." : "Apply"}
        </button>
        <button
          onClick={() => onDelete(value)}
          disabled={!value.trim() || isPending}
          className="rounded-lg border border-destructive text-destructive px-4 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
        >
          {deletePending ? "삭제 중..." : "Delete"}
        </button>
        {onSaveTemplate && (
          <button
            onClick={onSaveTemplate}
            disabled={!value.trim()}
            className="ml-auto rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            현재 내용을 Template 저장
          </button>
        )}
      </div>
    </div>
  );
}
