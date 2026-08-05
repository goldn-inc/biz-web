"use client";

import Link from "next/link";
import { CatalogIcon, ChevronRightIcon, StoreIcon, WholesaleIcon } from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { isWholesaleTier } from "@/lib/session";

/** 하단 탭바 "더보기" — 사이드바에서는 상시 노출되지만 탭바 4슬롯엔 못 들어가는 메뉴 모음. */
export default function MorePage() {
  const { account: session, logout } = useBizSession();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-extrabold tracking-tight m-0">더보기</h1>
      <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
        <Link
          href="/catalog"
          className="flex items-center gap-3.5 px-4 md:px-5 py-3.5 border-t border-slate-100 first:border-t-0 hover:bg-slate-50"
        >
          <CatalogIcon className="w-5 h-5 text-body" />
          <div className="flex-1 text-sm font-semibold">카탈로그 신청</div>
          <ChevronRightIcon className="w-4 h-4 text-caption" />
        </Link>
        {isWholesaleTier(session.tier) && (
          <Link
            href="/wholesale"
            className="flex items-center gap-3.5 px-4 md:px-5 py-3.5 border-t border-slate-100 hover:bg-slate-50"
          >
            <WholesaleIcon className="w-5 h-5 text-body" />
            <div className="flex-1 text-sm font-semibold">도매 주문</div>
            <ChevronRightIcon className="w-4 h-4 text-caption" />
          </Link>
        )}
        <Link
          href="/store-info"
          className="flex items-center gap-3.5 px-4 md:px-5 py-3.5 border-t border-slate-100 hover:bg-slate-50"
        >
          <StoreIcon className="w-5 h-5 text-body" />
          <div className="flex-1 text-sm font-semibold">매장 정보</div>
          <ChevronRightIcon className="w-4 h-4 text-caption" />
        </Link>
      </div>
      <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3.5 px-4 md:px-5 py-3.5 hover:bg-slate-50 text-left"
        >
          <div className="flex-1 text-sm font-semibold text-red-600">로그아웃</div>
          <ChevronRightIcon className="w-4 h-4 text-caption" />
        </button>
      </div>
    </div>
  );
}
