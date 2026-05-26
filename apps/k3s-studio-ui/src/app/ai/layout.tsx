export default function AiLayout({ children }: { children: React.ReactNode }) {
  // Counteract the root layout's px-6 py-8 padding so the chat fills the full area.
  return <div className="-mx-6 -my-8 flex flex-col overflow-hidden" style={{ height: "calc(100% + 4rem)" }}>{children}</div>;
}
