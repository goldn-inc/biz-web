"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BizSessionProvider, useBizSession } from "@/components/shell/BizSessionProvider";

/**
 * GP 매장 프로그램 전용 서브셸(확정 4안 — 밀착형 다듬기).
 * 골드펜의 정보 구조(좌측 상시 트리 2단 + 본문 격자)는 유지하고 질감만 현대화:
 * 세로 격자선 없음, 흰 헤더, 13px, biz-web 디자인 토큰 위에서.
 * (shell) 레이아웃과 별개의 풀스크린 프레임 — biz 사이드바와 이중 내비를 만들지 않는다.
 * 세션 가드는 동일하게 BizSessionProvider.
 */

type TreeLeaf = { href: string; label: string; planned?: boolean; external?: boolean };
type TreeGroup = { label: string; children: TreeLeaf[] };

const GP_TREE: TreeGroup[] = [
  {
    label: "재고관리",
    children: [
      { href: "/gp/inventory", label: "재고 목록" },
      { href: "/gp/stocktake", label: "재고조사" },
    ],
  },
  {
    label: "판매관리",
    children: [
      { href: "/gp/sales/new", label: "판매 등록" },
      { href: "/gp/sales", label: "판매 내역", planned: true },
    ],
  },
  {
    label: "금·현금 시재",
    children: [{ href: "/gp/ledger", label: "시재 원장" }],
  },
  {
    label: "발주관리",
    children: [
      { href: "/gp/receiving", label: "발주·입고" },
      { href: "/wholesale", label: "도매 발주 바로가기", external: true },
    ],
  },
  {
    label: "카다로그",
    children: [{ href: "/gp/catalog", label: "모델 관리", planned: true }],
  },
  {
    label: "거래처관리",
    children: [{ href: "/gp/suppliers", label: "거래처", planned: true }],
  },
  {
    label: "기초관리",
    children: [{ href: "/gp/settings", label: "개시 잔액" }],
  },
];

function GpShell({ children }: { children: React.ReactNode }) {
  const { account, logout } = useBizSession();
  const pathname = usePathname();

  return (
    <div className="h-screen flex flex-col bg-white text-ink text-[13px]">
      {/* 상단 띠 — 흰 헤더 + 강한 위계(파랑 그라데이션 타이틀바 금지) */}
      <header className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-white">
        <Link href="/gp/inventory" className="font-extrabold text-[14px] tracking-tight">
          GP <span className="text-primary">매장 프로그램</span>
        </Link>
        <span className="text-caption">|</span>
        <span className="font-semibold">{account.storeName}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/dashboard"
            className="h-7 px-3 inline-flex items-center rounded-md border border-line text-body hover:bg-surface"
          >
            biz-web 홈
          </Link>
          <button
            type="button"
            onClick={logout}
            className="h-7 px-3 inline-flex items-center rounded-md border border-line text-body hover:bg-surface"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* 좌측 상시 트리(2단) — 접히지 않는다. 골드펜 정보 구조 유지 */}
        <nav className="w-44 shrink-0 border-r border-line overflow-y-auto py-2 bg-white">
          {GP_TREE.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 py-1.5 text-[11px] font-bold text-caption select-none">
                {group.label}
              </div>
              {group.children.map((leaf) => {
                const active = !leaf.external && pathname.startsWith(leaf.href);
                if (leaf.planned) {
                  return (
                    <div
                      key={leaf.href}
                      className="px-5 py-1.5 text-caption/70 cursor-default select-none"
                      title="2차 화면 — 준비 중"
                    >
                      {leaf.label}
                      <span className="ml-1 text-[10px] border border-line rounded px-1">2차</span>
                    </div>
                  );
                }
                return (
                  <Link
                    key={leaf.href}
                    href={leaf.href}
                    className={`block px-5 py-1.5 hover:bg-surface ${
                      active ? "bg-surface font-bold text-primary" : "text-body"
                    }`}
                  >
                    {leaf.label}
                    {leaf.external ? <span className="ml-1 text-caption text-[11px]">↗</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

export default function GpLayout({ children }: { children: React.ReactNode }) {
  return (
    <BizSessionProvider>
      <GpShell>{children}</GpShell>
    </BizSessionProvider>
  );
}
