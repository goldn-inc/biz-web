"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon, ChevronRightIcon, PlusIcon, TicketIcon, CalendarIcon, WholesaleIcon, AlertCircleIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch } from "@/lib/api";
import { isWholesaleTier, tierLabel } from "@/lib/session";

type ReservationStatus = "PENDING" | "WAITLISTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

/** GET /biz/reservations 항목(기본 = KST 오늘). customerName 은 서버 마스킹 완료값. */
type ApiReservation = {
  id: string;
  visitSlot: string | null;
  purpose: string | null;
  status: ReservationStatus;
  customerName: string;
};

type TxStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELED";

/** GET /biz/transactions 항목(기본 = KST 오늘). */
type ApiTransaction = {
  id: string;
  status: TxStatus;
  customerName: string;
  finalPrice: number | null;
  createdAt: string;
};

type OrderStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELED";

/** GET /biz/wholesale/orders 항목. */
type ApiOrder = {
  id: string;
  productName: string;
  quantity: number;
  status: OrderStatus;
  createdAt: string;
};

const RESERVATION_BADGE: Partial<Record<ReservationStatus, { label: string; tone: "green" | "amber" | "slate" | "violet" }>> = {
  PENDING: { label: "대기중", tone: "amber" },
  WAITLISTED: { label: "대기목록", tone: "violet" },
  CONFIRMED: { label: "확정", tone: "green" },
  COMPLETED: { label: "방문완료", tone: "slate" },
};

const ORDER_BADGE: Record<OrderStatus, { label: string; tone: "slate" | "blue" | "green" }> = {
  REQUESTED: { label: "요청됨", tone: "slate" },
  CONFIRMED: { label: "확인됨", tone: "blue" },
  COMPLETED: { label: "완료", tone: "green" },
  CANCELED: { label: "취소", tone: "slate" },
};

const TX_BADGE: Record<TxStatus, { label: string; cls: string }> = {
  IN_PROGRESS: { label: "진행중", cls: "text-blue-600 bg-blue-50 border-blue-200" },
  COMPLETED: { label: "매입", cls: "text-primary bg-orange-50 border-orange-100" },
  CANCELED: { label: "취소", cls: "text-slate-500 bg-slate-50 border-slate-200" },
};

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { account: session, token } = useBizSession();
  const wholesale = isWholesaleTier(session.tier);

  const [reservations, setReservations] = useState<ApiReservation[] | null>(null);
  const [transactions, setTransactions] = useState<ApiTransaction[] | null>(null);
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        const [resv, tx, ord] = await Promise.all([
          bizApiFetch<{ reservations: ApiReservation[] }>("/biz/reservations", { token }),
          bizApiFetch<{ transactions: ApiTransaction[] }>("/biz/transactions", { token }),
          wholesale
            ? bizApiFetch<{ orders: ApiOrder[] }>("/biz/wholesale/orders", { token })
            : Promise.resolve({ orders: [] as ApiOrder[] }),
        ]);
        if (!alive) return;
        setReservations(resv.reservations);
        setTransactions(tx.transactions);
        setOrders(ord.orders);
        setError(null);
      } catch {
        if (!alive) return;
        setError("대시보드 데이터를 불러오지 못했습니다. 새로고침 해주세요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, wholesale]);

  // 종결(취소·노쇼) 예약은 오늘 카드에서 제외 — 현장 응대 대상만.
  const todayReservations = (reservations ?? []).filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW",
  );
  const activeTx = (transactions ?? []).filter((t) => t.status !== "CANCELED");
  const recentOrders = (orders ?? []).slice(0, 3);

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
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex gap-2 items-center text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : null}

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
                {todayReservations.filter((r) => r.status === "PENDING" || r.status === "WAITLISTED").length}
                <span className="text-sm font-semibold">건</span>
              </div>
            </div>
            <div className="flex-1 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
              <div className="text-xs font-semibold text-green-800">확정</div>
              <div className="text-2xl font-extrabold text-green-600">
                {todayReservations.filter((r) => r.status === "CONFIRMED").length}
                <span className="text-sm font-semibold">건</span>
              </div>
            </div>
          </div>
          {reservations === null ? (
            <LoadingRows />
          ) : todayReservations.length === 0 ? (
            <EmptyState icon={<CalendarIcon className="w-6 h-6" />} title="오늘 예약이 없습니다" desc="고객이 앱에서 예약하면 실시간으로 표시됩니다." />
          ) : (
            <div className="flex flex-col">
              {todayReservations.map((r) => {
                const badge = RESERVATION_BADGE[r.status] ?? { label: r.status, tone: "slate" as const };
                return (
                  <div key={r.id} className="flex items-center gap-3.5 py-3 border-t border-slate-100">
                    <div className="text-sm font-extrabold w-12 shrink-0">{r.visitSlot ?? "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.customerName}</div>
                      <div className="text-xs text-caption truncate">{r.purpose ?? "방문 예약"}</div>
                    </div>
                    <Badge tone={badge.tone} className="shrink-0">
                      {badge.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold m-0">오늘의 거래</h2>
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
              {activeTx.length}
              <span className="text-sm font-semibold">건</span>
            </div>
          </div>
          {transactions === null ? (
            <LoadingRows />
          ) : activeTx.length === 0 ? (
            <EmptyState icon={<PlusIcon className="w-6 h-6" />} title="오늘 거래가 없습니다" desc="현장 매입 등록으로 첫 거래를 시작하세요." />
          ) : (
            <div className="flex flex-col">
              {activeTx.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-3 border-t border-slate-100">
                  <span className={`shrink-0 text-xs font-bold rounded-lg px-2 py-1 border ${TX_BADGE[t.status].cls}`}>
                    {TX_BADGE[t.status].label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{t.customerName}</div>
                    <div className="text-xs text-caption">오늘 {timeLabel(t.createdAt)}</div>
                  </div>
                  <div className="shrink-0 text-sm font-extrabold tabular-nums">
                    {t.finalPrice !== null ? won(t.finalPrice) : "진행중"}
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {orders === null ? (
              <LoadingRows />
            ) : recentOrders.length === 0 ? (
              <EmptyState icon={<WholesaleIcon className="w-6 h-6" />} title="도매 주문이 없습니다" desc="도매 주문에서 카탈로그를 확인해보세요." />
            ) : (
              <div className="flex flex-col">
                {recentOrders.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-3 border-t border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {o.productName} · {o.quantity}점
                      </div>
                      <div className="text-xs text-caption">
                        {new Date(o.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 주문
                      </div>
                    </div>
                    <Badge tone={ORDER_BADGE[o.status].tone} className="shrink-0">
                      {ORDER_BADGE[o.status].label}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

/** 로딩 스켈레톤 — 카드 형태 유지용 3행. */
function LoadingRows() {
  return (
    <div className="flex flex-col gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />
      ))}
    </div>
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
