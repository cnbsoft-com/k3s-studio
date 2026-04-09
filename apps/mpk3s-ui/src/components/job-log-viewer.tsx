"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface JobLogViewerProps {
  jobId: string;
  redirectOnSuccess?: string;
  onDone?: (success: boolean) => void;
}

export function JobLogViewer({ jobId, redirectOnSuccess, onDone }: JobLogViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener("log", (e) => {
      setLines((prev) => [...prev, e.data]);
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });

    es.addEventListener("done", (e) => {
      const success = e.data === "SUCCESS";
      setDone(true);
      es.close();
      if (success) {
        toast.success("작업이 완료되었습니다.");
        if (redirectOnSuccess) setTimeout(() => router.push(redirectOnSuccess), 1000);
      } else {
        toast.error("작업이 실패했습니다.");
      }
      onDone?.(success);
    });

    es.addEventListener("error", () => {
      es.close();
      setDone(true);
      toast.error("작업 중 오류가 발생했습니다.");
      onDone?.(false);
    });

    return () => es.close();
  }, [jobId, redirectOnSuccess, router, onDone]);

  return (
    <div className="rounded-lg border bg-black text-green-400 font-mono text-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
        <span className="text-gray-400 text-xs">작업 로그</span>
        {!done && (
          <span className="flex items-center gap-1.5 text-yellow-400 text-xs">
            <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            실행 중
          </span>
        )}
        {done && (
          <span className="text-gray-400 text-xs">완료</span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto p-4 space-y-0.5"
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {lines.length === 0 && (
          <div className="text-gray-600">로그 대기 중...</div>
        )}
      </div>
    </div>
  );
}
