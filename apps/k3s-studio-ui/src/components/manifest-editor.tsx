"use client";

import { useState } from "react";

interface ManifestEditorProps {
  onApply: (yaml: string) => void;
  onDelete: (yaml: string) => void;
  applyPending?: boolean;
  deletePending?: boolean;
}

export function ManifestEditor({ onApply, onDelete, applyPending, deletePending }: ManifestEditorProps) {
  const [yaml, setYaml] = useState("");
  const isPending = applyPending || deletePending;

  return (
    <div className="space-y-2">
      <textarea
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        placeholder="apiVersion: apps/v1&#10;kind: Deployment&#10;metadata:&#10;  name: my-app&#10;..."
        rows={10}
        className="w-full rounded-md border px-3 py-2 text-sm font-mono bg-background resize-y"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onApply(yaml)}
          disabled={!yaml.trim() || isPending}
          className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {applyPending ? "적용 중..." : "Apply"}
        </button>
        <button
          onClick={() => onDelete(yaml)}
          disabled={!yaml.trim() || isPending}
          className="rounded-lg border border-destructive text-destructive px-4 py-1.5 text-sm hover:bg-destructive/10 disabled:opacity-50"
        >
          {deletePending ? "삭제 중..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
