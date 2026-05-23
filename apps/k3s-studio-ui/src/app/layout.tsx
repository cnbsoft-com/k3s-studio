import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/theme-toggle";
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
          <div className="min-h-screen bg-background">
            <header className="border-b">
              <div className="container mx-auto px-4 py-3 flex items-center gap-4">
                <span className="font-bold text-lg">K3s-Studio</span>
                <nav className="flex items-center gap-3 text-sm text-muted-foreground">
                  <a href="/" className="hover:text-foreground transition-colors">대시보드</a>
                  <a href="/servers" className="hover:text-foreground transition-colors">서버</a>
                </nav>
                <div className="ml-auto">
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="container mx-auto px-4 py-8">{children}</main>
          </div>
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
