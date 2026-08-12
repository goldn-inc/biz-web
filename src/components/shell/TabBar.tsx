"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { ComponentType, SVGProps } from "react";
import { TABBAR_NAV } from "@/lib/nav";
import { MoreIcon } from "@/components/icons";

/** 탭 1개 — 활성 시 상단 인디케이터(layoutId 슬라이드) + 아이콘 스프링 팝. */
function TabItem({
  href,
  label,
  Icon,
  active,
  spring,
}: {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  spring: Transition;
}) {
  return (
    <Link
      href={href}
      className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 ${
        active ? "text-primary" : "text-caption"
      }`}
    >
      {active && (
        <motion.span
          layoutId="biz-tab-indicator"
          className="absolute -top-2 h-[3px] w-9 rounded-full bg-primary"
          transition={spring}
        />
      )}
      <motion.span animate={active ? { scale: 1.08, y: -1 } : { scale: 1, y: 0 }} transition={spring}>
        <Icon className="w-6 h-6" />
      </motion.span>
      <span className={`text-[11px] ${active ? "font-bold" : "font-semibold"}`}>{label}</span>
    </Link>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const reduced = Boolean(useReducedMotion());
  const spring: Transition = reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 32 };
  const moreActive =
    pathname.startsWith("/more") || pathname.startsWith("/catalog") || pathname.startsWith("/wholesale");

  return (
    <nav className="lg:hidden bg-white border-t border-line flex px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]">
      {TABBAR_NAV.map((item) => (
        <TabItem
          key={item.href}
          href={item.href}
          label={item.label}
          Icon={item.icon}
          active={pathname.startsWith(item.href)}
          spring={spring}
        />
      ))}
      <TabItem href="/more" label="더보기" Icon={MoreIcon} active={moreActive} spring={spring} />
    </nav>
  );
}
