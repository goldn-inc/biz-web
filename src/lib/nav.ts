import {
  CalendarIcon,
  CatalogIcon,
  HomeIcon,
  ScaleIcon,
  TicketIcon,
  WholesaleIcon,
} from "@/components/icons";
import { ComponentType, SVGProps } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tierOnly?: boolean;
};

/**
 * 임시 잠금(2026-07-15): 로그인·대시보드만 공개하고 나머지 화면은 내비에서 숨김 +
 * 직접 진입 시 "준비 중" 화면. 전체 공개로 되돌리려면 NAV_LOCKDOWN 을 false 로.
 * 2026-07-23 전체 공개 전환.
 */
export const NAV_LOCKDOWN = false;

const LOCKED_ROUTES = ["/reservations", "/transactions", "/coupons", "/catalog", "/wholesale"];

export function isLockedRoute(pathname: string): boolean {
  return NAV_LOCKDOWN && LOCKED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

const withLockdown = (items: NavItem[]) =>
  NAV_LOCKDOWN ? items.filter((item) => !LOCKED_ROUTES.includes(item.href)) : items;

/** 사이드바(lg+) 전용 항목 순서. 도매 주문은 tierOnly — NONE 계정에는 렌더하지 않음. */
export const SIDEBAR_NAV: NavItem[] = withLockdown([
  { href: "/dashboard", label: "홈", icon: HomeIcon },
  { href: "/reservations", label: "예약", icon: CalendarIcon },
  { href: "/transactions", label: "거래", icon: ScaleIcon },
  { href: "/coupons", label: "쿠폰", icon: TicketIcon },
  { href: "/catalog", label: "카탈로그 신청", icon: CatalogIcon },
  { href: "/wholesale", label: "도매 주문", icon: WholesaleIcon, tierOnly: true },
]);

/** 하단 탭바(lg 미만) 4항목 + 더보기. */
export const TABBAR_NAV: NavItem[] = withLockdown([
  { href: "/dashboard", label: "홈", icon: HomeIcon },
  { href: "/reservations", label: "예약", icon: CalendarIcon },
  { href: "/transactions", label: "거래", icon: ScaleIcon },
  { href: "/coupons", label: "쿠폰", icon: TicketIcon },
]);
