"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Server, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/I18nContext";

const navItems = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/servers", labelKey: "nav.servers", icon: Server },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  return (
    <aside
      className={`relative flex flex-col border-r bg-muted/40 transition-[width] duration-200 ${
        collapsed ? "w-14" : "md:w-52 w-14"
      }`}
    >
      <nav className="flex-1 py-4 space-y-1">
        {navItems.map(({ href, labelKey, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const label = t(labelKey);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 py-2.5 mx-2 px-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${
                isActive ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="hidden md:inline">{label}</span>}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute -right-3 top-6 w-6 h-6 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-foreground shadow-sm"
        aria-label={collapsed ? t("sidebar.open") : t("sidebar.close")}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}
