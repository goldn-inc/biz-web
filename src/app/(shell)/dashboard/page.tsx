"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon, ChevronRightIcon, PlusIcon, TicketIcon, CalendarIcon, WholesaleIcon, AlertCircleIcon, XIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch } from "@/lib/api";
import { isWholesaleTier, tierLabel } from "@/lib/session";
import { DetailPanel, RegistrationForm } from "@/components/transactions/PurchaseFlow";
import {
  ReservationConfirmDialog,
  ReservationDetailPanel,
  toReservation,
  type ApiReservation,
  type DestructiveAction,
  type Reservation,
  type ReservationStatus,
} from "@/components/reservations/ReservationFlow";
import { CouponApplyWidget } from "@/components/coupons/CouponApplyWidget";

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

/** GET /biz/wholesale/products 항목(홈 레일용 최소 필드). orderCount 는 구백엔드 미배포 시 없음. */
type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  stock: number;
  orderCount?: number;
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
  const [newest, setNewest] = useState<ApiProduct[] | null>(null);
  const [popular, setPopular] = useState<ApiProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 원페이지 매입 — 대시보드 위 모달로 접수(RegistrationForm)→감정·완료(DetailPanel)까지 처리.
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseTxId, setPurchaseTxId] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  // 예약 바로 처리 — 오늘 예약 행 클릭 시 상세 패널(확정/방문완료/취소/노쇼)을 대시보드에서 연다.
  const [resvSelectedId, setResvSelectedId] = useState<string | null>(null);
  const [resvDialog, setResvDialog] = useState<{
    action: DestructiveAction;
    target: Reservation;
  } | null>(null);
  const [resvError, setResvError] = useState<string | null>(null);

  // 쿠폰 적용 — 조회·검증·거래 적용을 대시보드 모달에서 처리.
  const [couponOpen, setCouponOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        const emptyProducts = { products: [] as ApiProduct[] };
        const [resv, tx, ord, newestRes, popularRes] = await Promise.all([
          bizApiFetch<{ reservations: ApiReservation[] }>("/biz/reservations", { token }),
          bizApiFetch<{ transactions: ApiTransaction[] }>("/biz/transactions", { token }),
          wholesale
            ? bizApiFetch<{ orders: ApiOrder[] }>("/biz/wholesale/orders", { token })
            : Promise.resolve({ orders: [] as ApiOrder[] }),
          wholesale
            ? bizApiFetch<{ products: ApiProduct[] }>("/biz/wholesale/products?sort=newest&limit=5", { token })
            : Promise.resolve(emptyProducts),
          wholesale
            ? bizApiFetch<{ products: ApiProduct[] }>("/biz/wholesale/products?sort=popular&limit=5", { token })
            : Promise.resolve(emptyProducts),
        ]);
        if (!alive) return;
        setReservations(resv.reservations);
        setTransactions(tx.transactions);
        setOrders(ord.orders);
        // 구백엔드는 limit 파라미터를 무시하므로 클라이언트에서도 5개 상한(레일 끝은 더 보러가기 카드).
        setNewest(newestRes.products.slice(0, 5));
        setPopular(popularRes.products.slice(0, 5));
        setError(null);
      } catch {
        if (!alive) return;
        setError("대시보드 데이터를 불러오지 못했습니다. 새로고침 해주세요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, wholesale, reloadCount]);

  // 종결(취소·노쇼) 예약은 오늘 카드에서 제외 — 현장 응대 대상만.
  const todayReservations = (reservations ?? []).filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW",
  );

  const resvSelectedApi = (reservations ?? []).find((r) => r.id === resvSelectedId) ?? null;
  const resvSelected = resvSelectedApi ? toReservation(resvSelectedApi) : null;

  async function applyResvStatus(id: string, status: ReservationStatus) {
    setResvError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/reservations/${id}/status`, {
        method: "PATCH",
        body: { status },
        token,
      });
      setReservations((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, status } : r)) : prev,
      );
      return true;
    } catch (err) {
      setResvError(err instanceof Error ? err.message : "상태를 변경하지 못했습니다.");
      return false;
    }
  }

  async function confirmResvDialog() {
    if (!resvDialog) return;
    const ok = await applyResvStatus(resvDialog.target.id, resvDialog.action);
    setResvDialog(null);
    if (ok) setResvSelectedId(null);
  }
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
        <button
          onClick={() => setPurchaseOpen(true)}
          className="h-12 px-5 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 inline-flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          현장 매입 등록
        </button>
        <button
          onClick={() => setCouponOpen(true)}
          className="h-12 px-5 rounded-2xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold inline-flex items-center gap-2"
        >
          <TicketIcon className="w-4 h-4" />
          쿠폰 적용
        </button>
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

      {/* items-start 제거 — 같은 행의 카드(예약↔거래)가 같은 높이로 늘어나도록 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
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
                  <button
                    key={r.id}
                    onClick={() => setResvSelectedId(r.id)}
                    className="flex items-center gap-3.5 py-3 border-t border-slate-100 w-full text-left hover:bg-orange-50/40 transition rounded-lg px-1 -mx-1"
                  >
                    <div className="text-sm font-extrabold w-12 shrink-0">{r.visitSlot ?? "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.customerName}</div>
                      <div className="text-xs text-caption truncate">{r.purpose ?? "방문 예약"}</div>
                    </div>
                    <Badge tone={badge.tone} className="shrink-0">
                      {badge.label}
                    </Badge>
                  </button>
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
              {activeTx.slice(0, 7).map((t) => (
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

        {/* 신상품·잘 팔리는 제품 탭 카드 — 스크롤 없이 보이도록 그리드 빈칸(오늘의 거래 아래)에 배치 */}
        {wholesale && <ProductTabsCard newest={newest} popular={popular} />}
      </div>

      {/* 원페이지 매입 모달 — 접수 완료 시 이어서 감정·완료(DetailPanel)까지 대시보드에서 처리 */}
      {purchaseOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/45">
          <div className="min-h-full p-4 md:p-8 grid place-items-start justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="현장 매입 등록"
              className="w-full max-w-5xl bg-surface rounded-3xl shadow-2xl p-5 md:p-7 flex flex-col gap-5 relative"
            >
              {/* 닫기는 RegistrationForm 헤더의 cancelLabel("닫기") 버튼 하나만 사용 — X 중복 제거 */}
              <RegistrationForm
                token={token}
                reservationId={null}
                initialPhone={null}
                cancelLabel="닫기"
                onCancel={() => setPurchaseOpen(false)}
                onCreated={(id) => {
                  setPurchaseOpen(false);
                  setPurchaseTxId(id);
                  setReloadCount((n) => n + 1);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {purchaseTxId && (
        <DetailPanel
          token={token}
          id={purchaseTxId}
          onClose={() => setPurchaseTxId(null)}
          onChanged={() => setReloadCount((n) => n + 1)}
        />
      )}

      {/* 예약 바로 처리 — 오늘 예약 행 클릭 시 */}
      {resvSelected && (
        <ReservationDetailPanel
          reservation={resvSelected}
          onClose={() => {
            setResvSelectedId(null);
            setResvError(null);
          }}
          onConfirm={() => {
            void applyResvStatus(resvSelected.id, "CONFIRMED").then((ok) => {
              if (ok) setResvSelectedId(null);
            });
          }}
          onComplete={() => {
            void applyResvStatus(resvSelected.id, "COMPLETED").then((ok) => {
              if (ok) setResvSelectedId(null);
            });
          }}
          onNoShow={() => setResvDialog({ action: "NO_SHOW", target: resvSelected })}
          onCancel={() => setResvDialog({ action: "CANCELLED", target: resvSelected })}
        />
      )}
      {resvError && resvSelected && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium shadow-lg">
          {resvError}
        </div>
      )}
      {resvDialog && (
        <ReservationConfirmDialog
          action={resvDialog.action}
          target={resvDialog.target}
          onClose={() => setResvDialog(null)}
          onConfirm={() => void confirmResvDialog()}
        />
      )}

      {/* 쿠폰 적용 모달 — 조회·검증·거래 적용 */}
      {couponOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/45">
          <div className="min-h-full p-4 md:p-8 grid place-items-start justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="쿠폰 적용"
              className="w-full max-w-3xl bg-surface rounded-3xl shadow-2xl p-6 md:p-9 flex flex-col gap-6 relative"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold m-0">쿠폰 적용</h2>
                <button
                  aria-label="닫기"
                  onClick={() => setCouponOpen(false)}
                  className="w-10 h-10 rounded-xl bg-white border border-line hover:bg-slate-100 grid place-items-center text-body"
                >
                  <XIcon className="w-[18px] h-[18px]" />
                </button>
              </div>
              <CouponApplyWidget token={token} onApplied={() => setReloadCount((n) => n + 1)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 신상품 · 잘 팔리는 제품 탭 카드 — 각 5개 가로 레일, 카드 클릭 시 도매 카탈로그로 이동. */
function ProductTabsCard({
  newest,
  popular,
}: {
  newest: ApiProduct[] | null;
  popular: ApiProduct[] | null;
}) {
  const [tab, setTab] = useState<"newest" | "popular">("newest");
  const railRef = useRef<HTMLDivElement | null>(null);
  // 끝단 도달 시 해당 방향 화살표 숨김 — scroll 이벤트와 마운트/탭 전환 시점에 측정.
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const products = tab === "newest" ? newest : popular;
  const showOrderCount = tab === "popular";
  const emptyDesc =
    tab === "newest"
      ? "새로 등록된 상품이 없습니다."
      : "발주 데이터가 쌓이면 인기 상품이 표시됩니다.";

  function updateArrows(el: HTMLDivElement | null) {
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  /** 탭 전환 시 레일을 처음으로 되돌리고 화살표를 재측정. ref 콜백이 마운트 측정을 담당. */
  function handleTabChange(next: "newest" | "popular") {
    setTab(next);
    const el = railRef.current;
    if (el) {
      el.scrollTo({ left: 0 });
      updateArrows(el);
    }
  }

  /** 좌우 화살표 버튼 — 카드 2장 폭만큼 부드럽게 이동 */
  function scrollRail(dir: 1 | -1) {
    railRef.current?.scrollBy({ left: dir * 324, behavior: "smooth" });
  }

  return (
    <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex bg-surface border border-line rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => handleTabChange("newest")}
            className={`h-9 px-3.5 rounded-[10px] text-sm transition ${
              tab === "newest" ? "bg-white shadow-sm font-bold" : "text-caption font-semibold hover:text-body"
            }`}
          >
            신상품
          </button>
          <button
            onClick={() => handleTabChange("popular")}
            className={`h-9 px-3.5 rounded-[10px] text-sm transition ${
              tab === "popular" ? "bg-white shadow-sm font-bold" : "text-caption font-semibold hover:text-body"
            }`}
          >
            잘 팔리는 제품
          </button>
        </div>
        <Link
          href="/wholesale"
          className="inline-flex items-center gap-1 text-primary text-sm font-semibold px-2 py-1.5 rounded-lg hover:bg-orange-50 shrink-0"
        >
          전체보기
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
      {products === null ? (
        <LoadingRows />
      ) : products.length === 0 ? (
        <EmptyState icon={<WholesaleIcon className="w-6 h-6" />} title="상품이 없습니다" desc={emptyDesc} />
      ) : (
        <div className="relative">
          <div
            ref={(node) => {
              railRef.current = node;
              updateArrows(node);
            }}
            onScroll={(e) => updateArrows(e.currentTarget)}
            className="no-scrollbar flex gap-3.5 overflow-x-auto pb-1 -mx-1 px-1"
          >
          {products.map((p) => (
            <Link
              key={p.id}
              href="/wholesale"
              className="w-[148px] shrink-0 flex flex-col gap-2 group"
            >
              <div className="relative w-full aspect-[4/3] rounded-2xl bg-amber-100/60 grid place-items-center text-amber-600/50 overflow-hidden border border-line">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지, 크기 미고정
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <WholesaleIcon className="w-8 h-8" />
                )}
                {showOrderCount && (p.orderCount ?? 0) > 0 ? (
                  <span className="absolute top-2 right-2 text-[11px] font-bold text-white bg-primary/90 rounded-lg px-2 py-0.5">
                    발주 {p.orderCount}
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-semibold truncate group-hover:text-primary">{p.name}</div>
              <div className="flex items-center justify-between -mt-1">
                <span className="text-sm font-extrabold tabular-nums">{won(p.unitPrice)}</span>
                <span className="text-[11px] font-semibold text-caption">
                  {p.stock > 0 ? `재고 ${p.stock}` : "발주 가능"}
                </span>
              </div>
            </Link>
          ))}
          {/* 레일 끝 — 더 보러가기 카드 */}
          <Link
            href="/wholesale"
            className="w-[148px] shrink-0 aspect-[4/3] self-start rounded-2xl border border-line bg-surface hover:border-primary-light flex flex-col items-center justify-center gap-2 group"
          >
            <span className="w-9 h-9 rounded-full bg-orange-50 grid place-items-center text-primary">
              <ChevronRightIcon className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-body group-hover:text-primary">더 보러가기</span>
          </Link>
          </div>

          {/* 좌우 이동 화살표 — 스크롤바 대신 사용, 끝단에서는 해당 방향 숨김 */}
          {canLeft && (
            <button
              aria-label="이전 상품"
              onClick={() => scrollRail(-1)}
              className="absolute -left-2 top-[34%] w-9 h-9 rounded-full bg-white border border-line shadow-md grid place-items-center text-body hover:text-primary hover:border-primary-light"
            >
              <ChevronRightIcon className="w-4 h-4 rotate-180" />
            </button>
          )}
          {canRight && (
            <button
              aria-label="다음 상품"
              onClick={() => scrollRail(1)}
              className="absolute -right-2 top-[34%] w-9 h-9 rounded-full bg-white border border-line shadow-md grid place-items-center text-body hover:text-primary hover:border-primary-light"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </section>
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
