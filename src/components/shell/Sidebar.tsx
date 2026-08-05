"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { SIDEBAR_NAV } from "@/lib/nav";
import { BizTier, isWholesaleTier, tierLabel } from "@/lib/session";
import { usePageWipe } from "./PageWipe";

type SidebarProps = {
  storeName: string;
  tier: BizTier;
  onLogout: () => void;
};

export function Sidebar({ storeName, tier, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const reduced = Boolean(useReducedMotion());
  const { navigate } = usePageWipe();
  const items = SIDEBAR_NAV.filter((item) => !item.tierOnly || isWholesaleTier(tier));
  // 활성 항목 하이라이트가 메뉴 사이를 미끄러져 이동 — reduced-motion이면 즉시 전환
  const pill: Transition = reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 };

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

      {items.map((item, i) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <motion.div
            key={item.href}
            initial={reduced ? false : { opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { delay: 0.08 + i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }
            }
          >
          <Link
            href={item.href}
            onClick={(e) => {
              // 주황 커튼 전환이 라우팅을 대신 수행한다
              e.preventDefault();
              navigate(item.href);
            }}
            className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
              active ? "text-primary font-bold" : "text-body font-medium hover:bg-slate-100"
            }`}
          >
            {active && (
              <motion.span
                layoutId="biz-nav-pill"
                className="absolute inset-0 rounded-xl bg-orange-50"
                transition={pill}
              />
            )}
            <Icon className="relative w-5 h-5 transition-transform duration-150 group-hover:scale-110" />
            <span className="relative">{item.label}</span>
            {item.tierOnly && (
              <span className="relative ml-auto text-[10px] font-bold text-primary bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
                {tier === "SUPER_WHOLESALE" ? "도도매" : "도매"}
              </span>
            )}
          </Link>
          </motion.div>
        );
      })}

      <div className="flex-1" />

      <div className="border-t border-line pt-4 px-2.5 flex items-center gap-3">
        {/* 사이드바에는 「더보기」가 없어 매장 정보 진입점이 이 카드다(탭바 쪽은 /more 목록). */}
        <Link
          href="/store-info"
          onClick={(e) => {
            e.preventDefault();
            navigate("/store-info");
          }}
          className="flex items-center gap-3 min-w-0 flex-1 rounded-xl px-1 py-1 -mx-1 hover:bg-slate-100 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-slate-100 border border-line grid place-items-center text-sm font-bold text-body shrink-0">
            {storeName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold truncate">{storeName}</div>
            <div className="text-xs font-semibold text-caption">{tierLabel(tier)}</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          title="로그아웃"
          aria-label="로그아웃"
          className="shrink-0 grid place-items-center w-9 h-9 rounded-xl text-caption hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-[18px] h-[18px]"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
