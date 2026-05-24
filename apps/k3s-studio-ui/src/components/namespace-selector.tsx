"use client";

interface NamespaceSelectorProps {
  namespaces: string[];
  value: string;
  onChange: (ns: string) => void;
  loading?: boolean;
}

export function NamespaceSelector({ namespaces, value, onChange, loading }: NamespaceSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading}
      className="rounded-md border px-3 py-1.5 text-sm bg-background disabled:opacity-50"
    >
      <option value="all">모든 네임스페이스</option>
      {namespaces.map((ns) => (
        <option key={ns} value={ns}>{ns}</option>
      ))}
    </select>
  );
}
