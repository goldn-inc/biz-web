"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
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
 * 메뉴 이동에는 전환 연출을 두지 않는다 — 누르면 바로 바뀐다.
 * 예전에는 주황 풀스크린 커튼(PageWipe)과 본문 페이드·섹션 촤라락이 있었으나 전부 걷어냈다.
 */

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { account, logout } = useBizSession();
  const pathname = usePathname();
  const locked = isLockedRoute(pathname);

  return (
    <section className="h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        <Sidebar storeName={account.storeName} tier={account.tier} onLogout={logout} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-5 md:p-9 flex flex-col">
          <div className="flex-1 flex flex-col gap-5 md:gap-6">
            {locked ? <UnderConstruction /> : children}
          </div>
        </main>
      </div>
      <TabBar />
    </section>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <BizSessionProvider>
      <ShellFrame>{children}</ShellFrame>
    </BizSessionProvider>
  );
}
