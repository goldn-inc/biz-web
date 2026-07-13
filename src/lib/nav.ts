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

/** 사이드바(lg+) 전용 항목 순서. 도매 주문은 tierOnly — NONE 계정에는 렌더하지 않음. */
export const SIDEBAR_NAV: NavItem[] = [
  { href: "/dashboard", label: "홈", icon: HomeIcon },
  { href: "/reservations", label: "예약", icon: CalendarIcon },
  { href: "/transactions", label: "거래", icon: ScaleIcon },
  { href: "/coupons", label: "쿠폰", icon: TicketIcon },
  { href: "/catalog", label: "카탈로그 신청", icon: CatalogIcon },
  { href: "/wholesale", label: "도매 주문", icon: WholesaleIcon, tierOnly: true },
];

/** 하단 탭바(lg 미만) 4항목 + 더보기. */
export const TABBAR_NAV: NavItem[] = [
  { href: "/dashboard", label: "홈", icon: HomeIcon },
  { href: "/reservations", label: "예약", icon: CalendarIcon },
  { href: "/transactions", label: "거래", icon: ScaleIcon },
  { href: "/coupons", label: "쿠폰", icon: TicketIcon },
];
