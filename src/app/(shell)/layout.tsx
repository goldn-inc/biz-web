"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sidebar } from "@/components/shell/Sidebar";
import { PageWipeProvider, usePageWipe } from "@/components/shell/PageWipe";
import { TabBar } from "@/components/shell/TabBar";
import { BizSessionProvider, useBizSession } from "@/components/shell/BizSessionProvider";
import { isLockedRoute } from "@/lib/nav";

/** 잠금 경로 진입 시 페이지 본문 대신 렌더 — nav.ts NAV_LOCKDOWN 해제 시 자동으로 사라짐. */
function UnderConstruction() {
  return (
    <div className="flex-1 grid place-items-center py-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="text-5xl font-extrabold text-slate-200">404</div>
        <div className="text-base font-bold">아직 만들어지지 않은 페이지입니다</div>
        <div className="text-sm text-caption">준비 중인 기능이에요. 조금만 기다려 주세요.</div>
        <Link
          href="/dashboard"
          className="mt-2 h-11 px-5 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold inline-flex items-center"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

/*
 * 메뉴 이동 전환은 PageWipe(주황 풀스크린 커튼)가 담당 — 예약=위에서 내려오고
 * 도매=중앙에서 촥 열리는 식으로 메뉴별 방향이 다르다. 여기 본문 전환은
 * 커튼이 걷힌 뒤 드러나는 가벼운 페이드 + .page-stagger 섹션 촤라락만.
 */

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { account, logout } = useBizSession();
  const pathname = usePathname();
  const locked = isLockedRoute(pathname);
  const reduced = Boolean(useReducedMotion());
  const { phase: wipePhase } = usePageWipe();

  // 로그인 성공 전환의 후반부 — 로그인 카드가 오른쪽으로 빠진 뒤, 셸 전체가 왼쪽에서 샥 들어온다.
  // BizSessionProvider 가 hydration 전 null 을 렌더하므로 여기는 클라이언트에서만 초기화된다.
  const [arrived] = useState(() => {
    if (typeof window === "undefined") return false;
    const flag = sessionStorage.getItem("biz-sweep-arrive");
    if (flag) sessionStorage.removeItem("biz-sweep-arrive");
    return Boolean(flag);
  });

  return (
    <motion.section
      className="h-screen flex flex-col"
      initial={arrived && !reduced ? { x: "-12%", opacity: 0 } : false}
      animate={{ x: 0, opacity: 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex-1 flex min-h-0">
        <Sidebar storeName={account.storeName} tier={account.tier} onLogout={logout} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-5 md:p-9 flex flex-col">
          {/* 본문 스왑은 커튼에 가려진 채 일어난다 — 커튼이 걷힐 때 1.03→1 로 살짝 정착 */}
          <motion.div
            className="flex-1 flex flex-col"
            animate={!reduced && wipePhase === "reveal" ? { scale: [1.03, 1] } : { scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "50% 30%" }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={pathname}
                className="page-stagger flex-1 flex flex-col gap-5 md:gap-6"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.15, ease: "linear" }}
              >
                {locked ? <UnderConstruction /> : children}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </main>
      </div>
      <TabBar />
    </motion.section>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <BizSessionProvider>
      <PageWipeProvider>
        <ShellFrame>{children}</ShellFrame>
      </PageWipeProvider>
    </BizSessionProvider>
  );
}
