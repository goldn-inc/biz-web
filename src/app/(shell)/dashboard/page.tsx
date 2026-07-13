"use client";

import Link from "next/link";
import { BellIcon, ChevronRightIcon, PlusIcon, TicketIcon, CalendarIcon, WholesaleIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { isWholesaleTier, tierLabel } from "@/lib/session";

const TODAY_RESERVATIONS = [
  { time: "11:00", name: "김민지", memo: "예물 반지 상담 · 방문 예약", status: "CONFIRMED" as const },
  { time: "14:30", name: "박성호", memo: "금 시세 매입 문의", status: "PENDING" as const },
  { time: "16:00", name: "이수연", memo: "돌반지 3.75g 구매 예약", status: "CONFIRMED" as const },
];

const RECENT_TRANSACTIONS = [
  { type: "매입" as const, title: "14K 목걸이 18.2g 매입", time: "오늘 14:20", amount: "1,243,000원" },
  { type: "감정" as const, title: "18K 반지 감정 (2점)", time: "오늘 11:05", amount: "30,000원" },
  { type: "매입" as const, title: "순금 골드바 10g 매입", time: "오늘 10:12", amount: "983,000원" },
];

const RECENT_WHOLESALE_ORDERS = [
  { code: "WO-2607", title: "순금 골드바 37.5g 외 2건", date: "7월 9일 주문", status: "배송중", tone: "blue" as const },
  { code: "WO-2601", title: "14K 체인 목걸이 10점", date: "7월 7일 주문", status: "승인 대기", tone: "amber" as const },
];

export default function DashboardPage() {
  const { account: session } = useBizSession();
  const wholesale = isWholesaleTier(session.tier);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">{session.storeName}</h1>
            <Badge tone={wholesale ? "primary" : "slate"}>{tierLabel(session.tier)}</Badge>
          </div>
          <div className="text-sm text-caption">오늘 · KST</div>
        </div>
        <button
          aria-label="알림"
          className="relative w-11 h-11 rounded-2xl bg-white border border-line grid place-items-center text-body hover:text-primary hover:border-primary-light shrink-0"
        >
          <BellIcon className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white" />
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap">
        <Link
          href="/transactions"
          className="h-12 px-5 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 inline-flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          현장 매입 등록
        </Link>
        <Link
          href="/coupons"
          className="h-12 px-5 rounded-2xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold inline-flex items-center gap-2"
        >
          <TicketIcon className="w-4 h-4" />
          쿠폰 적용
        </Link>
        <Link
          href="/reservations"
          className="h-12 px-5 rounded-2xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold inline-flex items-center gap-2"
        >
          <CalendarIcon className="w-4 h-4" />
          예약 확인
        </Link>
        {wholesale && (
          <Link
            href="/wholesale"
            className="h-12 px-5 rounded-2xl bg-orange-50 border border-orange-100 hover:border-primary-light text-primary text-sm font-bold inline-flex items-center gap-2"
          >
            <WholesaleIcon className="w-4 h-4" />
            도매 주문
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 items-start">
        <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold m-0">오늘의 예약</h2>
            <Link
              href="/reservations"
              className="inline-flex items-center gap-1 text-primary text-sm font-semibold px-2 py-1.5 rounded-lg hover:bg-orange-50"
            >
              전체보기
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex gap-2.5">
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <div className="text-xs font-semibold text-amber-800">대기중</div>
              <div className="text-2xl font-extrabold text-amber-700">
                {TODAY_RESERVATIONS.filter((r) => r.status === "PENDING").length}
                <span className="text-sm font-semibold">건</span>
              </div>
            </div>
            <div className="flex-1 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
              <div className="text-xs font-semibold text-green-800">확정</div>
              <div className="text-2xl font-extrabold text-green-600">
                {TODAY_RESERVATIONS.filter((r) => r.status === "CONFIRMED").length}
                <span className="text-sm font-semibold">건</span>
              </div>
            </div>
          </div>
          {TODAY_RESERVATIONS.length === 0 ? (
            <EmptyState icon={<CalendarIcon className="w-6 h-6" />} title="오늘 예약이 없습니다" desc="고객이 앱에서 예약하면 실시간으로 표시됩니다." />
          ) : (
            <div className="flex flex-col">
              {TODAY_RESERVATIONS.map((r) => (
                <div key={r.time + r.name} className="flex items-center gap-3.5 py-3 border-t border-slate-100">
                  <div className="text-sm font-extrabold w-12 shrink-0">{r.time}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-xs text-caption truncate">{r.memo}</div>
                  </div>
                  <Badge tone={r.status === "CONFIRMED" ? "green" : "amber"} className="shrink-0">
                    {r.status === "CONFIRMED" ? "확정" : "대기중"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold m-0">최근 거래</h2>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 text-primary text-sm font-semibold px-2 py-1.5 rounded-lg hover:bg-orange-50"
            >
              전체보기
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="bg-surface border border-line rounded-2xl px-4 py-3 flex items-baseline gap-2">
            <div className="text-xs font-semibold text-caption">오늘 처리</div>
            <div className="text-2xl font-extrabold">
              {RECENT_TRANSACTIONS.length}
              <span className="text-sm font-semibold">건</span>
            </div>
          </div>
          <div className="flex flex-col">
            {RECENT_TRANSACTIONS.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-t border-slate-100">
                <span
                  className={`shrink-0 text-xs font-bold rounded-lg px-2 py-1 border ${
                    t.type === "매입"
                      ? "text-primary bg-orange-50 border-orange-100"
                      : "text-blue-600 bg-blue-50 border-blue-200"
                  }`}
                >
                  {t.type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="text-xs text-caption">{t.time}</div>
                </div>
                <div className="shrink-0 text-sm font-extrabold tabular-nums">{t.amount}</div>
              </div>
            ))}
          </div>
        </section>

        {wholesale && (
          <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold m-0">최근 도매 주문</h2>
                <span className="text-[11px] font-bold text-primary bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
                  도매 전용
                </span>
              </div>
              <Link
                href="/wholesale"
                className="inline-flex items-center gap-1 text-primary text-sm font-semibold px-2 py-1.5 rounded-lg hover:bg-orange-50"
              >
                전체보기
                <ChevronRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="flex flex-col">
              {RECENT_WHOLESALE_ORDERS.map((o) => (
                <div key={o.code} className="flex items-center gap-3 py-3 border-t border-slate-100">
                  <div className="shrink-0 text-sm font-bold text-caption tabular-nums">{o.code}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{o.title}</div>
                    <div className="text-xs text-caption">{o.date}</div>
                  </div>
                  <Badge tone={o.tone} className="shrink-0">
                    {o.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center py-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">{icon}</div>
      <div className="text-sm font-bold">{title}</div>
      <p className="text-xs text-caption leading-relaxed m-0">{desc}</p>
    </div>
  );
}
