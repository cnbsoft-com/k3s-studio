import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "K3s-Studio - K3s Cluster Manager",
  description: "Multipass + K3s 기반 Kubernetes 클러스터 관리 도구",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col bg-background">
            {/* Apple global-nav: slim true-black bar pinned to the top */}
            <header className="bg-black text-white">
              <div className="h-11 px-4 flex items-center gap-4">
                <span className="text-sm font-semibold tracking-apple-tight">K3s-Studio</span>
                <div className="ml-auto flex items-center gap-1">
                  <LangToggle />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-auto px-6 py-8">{children}</main>
            </div>
          </div>
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
