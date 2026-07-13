"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABBAR_NAV } from "@/lib/nav";
import { MoreIcon } from "@/components/icons";

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden bg-white border-t border-line flex px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
      {TABBAR_NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-1.5 ${
              active ? "text-primary" : "text-caption"
            }`}
          >
            <Icon className="w-6 h-6" />
            <span className={`text-[11px] ${active ? "font-bold" : "font-semibold"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
      <Link
        href="/more"
        className={`flex-1 flex flex-col items-center gap-1 py-1.5 relative ${
          pathname.startsWith("/more") || pathname.startsWith("/catalog") || pathname.startsWith("/wholesale")
            ? "text-primary"
            : "text-caption"
        }`}
      >
        <MoreIcon className="w-6 h-6" />
        <span className="text-[11px] font-semibold">더보기</span>
      </Link>
    </nav>
  );
}
