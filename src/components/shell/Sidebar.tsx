"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDEBAR_NAV } from "@/lib/nav";
import { BizTier, isWholesaleTier, tierLabel } from "@/lib/session";

type SidebarProps = {
  storeName: string;
  tier: BizTier;
};

export function Sidebar({ storeName, tier }: SidebarProps) {
  const pathname = usePathname();
  const items = SIDEBAR_NAV.filter((item) => !item.tierOnly || isWholesaleTier(tier));

  return (
    <aside className="hidden lg:flex w-60 shrink-0 bg-white border-r border-line flex-col gap-2 px-4 py-6">
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center text-white text-sm font-extrabold">
          金
        </div>
        <div className="text-base font-bold">
          금은마켓 <span className="text-primary">BIZ</span>
        </div>
      </div>

      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-orange-50 text-primary text-sm font-bold"
                : "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-body text-sm font-medium hover:bg-slate-100"
            }
          >
            <Icon className="w-5 h-5" />
            {item.label}
            {item.tierOnly && (
              <span className="ml-auto text-[10px] font-bold text-primary bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
                도매
              </span>
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      <div className="border-t border-line pt-4 px-2.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 border border-line grid place-items-center text-sm font-bold text-body shrink-0">
          {storeName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{storeName}</div>
          <div className="text-xs font-semibold text-caption">{tierLabel(tier)}</div>
        </div>
      </div>
    </aside>
  );
}
