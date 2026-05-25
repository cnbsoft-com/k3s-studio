"use client";

import { useTranslation } from "@/contexts/I18nContext";

export function LangToggle() {
  const { lang, setLang } = useTranslation();

  return (
    <button
      onClick={() => setLang(lang === "ko" ? "en" : "ko")}
      className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
      title={lang === "ko" ? "Switch to English" : "한국어로 변경"}
    >
      {lang === "ko" ? "EN" : "KO"}
    </button>
  );
}
