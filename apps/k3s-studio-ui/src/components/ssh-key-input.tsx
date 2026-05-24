"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SshKeyInput({ value, onChange, placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          파일 업로드
        </button>
        <span className="text-xs text-muted-foreground">.pem / .key 파일</span>
        <input ref={fileRef} type="file" accept=".pem,.key,.txt" className="hidden" onChange={handleFile} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={placeholder ?? "-----BEGIN OPENSSH PRIVATE KEY-----\n..."}
        className="w-full rounded-md border px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    </div>
  );
}
