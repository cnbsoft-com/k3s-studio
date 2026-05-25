"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMessages } from "@/lib/api";

type Messages = Record<string, string>;

interface I18nContextValue {
  t: (key: string, ...args: (string | number)[]) => string;
  lang: string;
  setLang: (lang: string) => void;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => key,
  lang: "ko",
  setLang: () => {},
  ready: false,
});

function interpolate(template: string, args: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ""));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Messages>({});
  const [lang, setLangState] = useState<string>("ko");
  const [ready, setReady] = useState(false);

  const loadMessages = useCallback(async (l: string) => {
    try {
      const data = await getMessages(l);
      setMessages(data);
    } catch {
      // silently fall back to key
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("lang") ?? "ko" : "ko";
    setLangState(saved);
    loadMessages(saved);
  }, [loadMessages]);

  const setLang = useCallback((l: string) => {
    setLangState(l);
    localStorage.setItem("lang", l);
    loadMessages(l);
  }, [loadMessages]);

  const t = useCallback((key: string, ...args: (string | number)[]) => {
    const template = messages[key];
    if (!template) return key;
    return args.length > 0 ? interpolate(template, args) : template;
  }, [messages]);

  return (
    <I18nContext.Provider value={{ t, lang, setLang, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
