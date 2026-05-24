import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

function truncate(text: string, max = 24) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground transition-colors">
              {truncate(item.label)}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{truncate(item.label)}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
