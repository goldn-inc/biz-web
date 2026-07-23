"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  GemIcon,
  MinusIcon,
  PlusIcon,
  WholesaleIcon,
  CheckIcon,
  AlertCircleIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { Badge, Button, FilterChip } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { isWholesaleTier, type BizTier } from "@/lib/session";
import { bizApiFetch, BizApiError } from "@/lib/api";

type WholesaleTierValue = Exclude<BizTier, "NONE">;

/** GET /biz/wholesale/products 항목 — unitPrice 는 내 등급 전용 단가(서버가 등급 필터). */
type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string;
  weightGram: number | null;
  purityCode: string;
  unitPrice: number;
};

type OrderStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELED";

/** GET/POST /biz/wholesale/orders 항목. */
type ApiOrder = {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  tierAtOrder: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  status: OrderStatus;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

/** GET /biz/wholesale/orders/:id — 진행 스테퍼용 개체(시리얼) 상태 + 협력공장(supplierRef) 포함. */
type ApiOrderDetail = ApiOrder & {
  items: { serial: string; status: string; receivedAt: string | null; supplierRef: string | null }[];
};

/** products.category → 한국어 라벨. */
const CATEGORY_LABEL: Record<string, string> = {
  PURE_GOLD_BAR: "순금 골드바",
  ALLOY_GOLD_BAR: "합금 골드바",
  SILVER_BAR: "실버바",
  JEWELRY: "주얼리",
  MIXED: "혼합",
  OTHER: "기타",
};

const STATUS_META: Record<OrderStatus, { label: string; tone: "slate" | "blue" | "green" }> = {
  REQUESTED: { label: "접수됨", tone: "slate" },
  CONFIRMED: { label: "진행 중", tone: "blue" },
  COMPLETED: { label: "완료", tone: "green" },
  CANCELED: { label: "취소", tone: "slate" },
};

/** 원화 표기(1,234,000원). */
function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** ISO → KST M/D 라벨. */
function kstDateLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 상품 스펙 요약 — 순도코드 · 중량. */
function specOf(p: ApiProduct): string {
  const parts = [p.purityCode, p.weightGram != null ? `${p.weightGram}g` : null];
  return parts.filter(Boolean).join(" · ");
}

export default function WholesalePage() {
  const { account: session } = useBizSession();

  // 등급 게이팅: 도매/도도매가 아니면 접근 안내만 렌더. 서버도 tier 를 재검증한다(프론트는 UX용).
  if (!isWholesaleTier(session.tier)) {
    return <AccessNotice />;
  }

  // 이 지점부터 tier는 WHOLESALE | SUPER_WHOLESALE 로 확정된다.
  return <WholesaleOrdering tier={session.tier as WholesaleTierValue} />;
}

/** 도매/도도매가 아닌 계정에 노출되는 접근 제한 안내. */
function AccessNotice() {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="w-full max-w-md bg-white border border-line rounded-3xl shadow-sm p-8 md:p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 grid place-items-center text-primary">
          <WholesaleIcon className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-extrabold m-0">도매/도도매 등급 전용 화면입니다</h1>
        <p className="text-sm text-caption leading-relaxed m-0">
          도매 주문은 도매·도도매 등급 계정에서만 이용할 수 있습니다.
          <br />
          등급 전환은 담당 관리자에게 문의해 주세요.
        </p>
      </div>
    </div>
  );
}

type TierMeta = { badgeClass: string; label: string; priceLabel: string };

const TIER_META: Record<WholesaleTierValue, TierMeta> = {
  WHOLESALE: { badgeClass: "bg-primary", label: "도매 계정 · WHOLESALE", priceLabel: "도매 단가" },
  SUPER_WHOLESALE: {
    badgeClass: "bg-orange-800",
    label: "도도매 계정 · SUPER_WHOLESALE",
    priceLabel: "도도매 단가",
  },
};

/** 상시 노출되는 등급 배지(도매=primary / 도도매=진한 오렌지). */
function TierBadge({ tier }: { tier: WholesaleTierValue }) {
  const meta = TIER_META[tier];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-extrabold text-white ${meta.badgeClass} rounded-full px-3.5 py-1.5 shadow-md shadow-primary/25`}
    >
      <WholesaleIcon className="w-3 h-3" strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}

type View =
  | { kind: "list" }
  | { kind: "order"; product: ApiProduct }
  | { kind: "complete"; order: ApiOrder };

function WholesaleOrdering({ tier }: { tier: WholesaleTierValue }) {
  const { token } = useBizSession();
  const meta = TIER_META[tier];
  const [tab, setTab] = useState<"catalog" | "history">("catalog");
  const [category, setCategory] = useState<string>("전체");
  const [view, setView] = useState<View>({ kind: "list" });

  // 로딩은 "요청 키 ↔ 결과 키 불일치"로 파생(set-state-in-effect 회피, 거래 화면과 동일 패턴)
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `wholesale:${reloadCount}`;
  const [result, setResult] = useState<{
    key: string;
    products?: ApiProduct[];
    orders?: ApiOrder[];
    error?: string;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const products = useMemo(
    () => (!loading ? (result?.products ?? []) : []),
    [loading, result],
  );
  const orders = (!loading && result?.orders) || [];
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [productsRes, ordersRes] = await Promise.all([
          bizApiFetch<{ products: ApiProduct[] }>("/biz/wholesale/products", { token }),
          bizApiFetch<{ orders: ApiOrder[] }>("/biz/wholesale/orders", { token }),
        ]);
        if (!cancelled) {
          setResult({ key: requestKey, products: productsRes.products, orders: ordersRes.orders });
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error:
              error instanceof BizApiError ? error.message : "도매 정보를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, token]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["전체", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo(
    () => (category === "전체" ? products : products.filter((p) => p.category === category)),
    [category, products],
  );

  function refresh() {
    setReloadCount((n) => n + 1);
  }

  if (view.kind === "order") {
    return (
      <OrderForm
        tier={tier}
        token={token}
        product={view.product}
        onBack={() => setView({ kind: "list" })}
        onCreated={(order) => {
          refresh();
          setView({ kind: "complete", order });
        }}
      />
    );
  }

  if (view.kind === "complete") {
    return (
      <OrderComplete
        tier={tier}
        order={view.order}
        onViewHistory={() => {
          setTab("history");
          setView({ kind: "list" });
        }}
        onBackToCatalog={() => {
          setTab("catalog");
          setView({ kind: "list" });
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">도매 주문</h1>
            <TierBadge tier={tier} />
          </div>
          <div className="text-sm text-caption mt-1.5">
            표시되는 모든 단가는{" "}
            <strong className="text-primary">{meta.priceLabel.replace(" 단가", " 등급 전용가")}</strong>
            입니다 · KST
          </div>
        </div>
        <div className="flex bg-white border border-line rounded-xl p-0.5 gap-0.5 shrink-0">
          <button
            onClick={() => setTab("catalog")}
            className={`h-9 px-4 rounded-lg text-xs font-bold transition ${
              tab === "catalog" ? "bg-primary text-white" : "text-caption hover:text-primary"
            }`}
          >
            카탈로그
          </button>
          <button
            onClick={() => setTab("history")}
            className={`h-9 px-4 rounded-lg text-xs font-bold transition ${
              tab === "history" ? "bg-primary text-white" : "text-caption hover:text-primary"
            }`}
          >
            주문 내역 {orders.length > 0 ? orders.length : ""}
          </button>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : tab === "catalog" ? (
        <>
          {/* 카테고리가 1종뿐이면 전체/단일 필터는 군더더기 — 2종 이상일 때만 노출 */}
          {categories.length > 2 ? (
            <div className="flex gap-2 flex-wrap">
              {categories.map((c) => (
                <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c === "전체" ? "전체" : (CATEGORY_LABEL[c] ?? c)}
                </FilterChip>
              ))}
            </div>
          ) : null}

          {visibleProducts.length === 0 ? (
            <div className="bg-white border border-line rounded-3xl shadow-sm p-10 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
                <GemIcon className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold">주문 가능한 상품이 없습니다</div>
              <p className="text-xs text-caption leading-relaxed m-0">
                내 등급에 단가가 설정된 상품이 여기에 표시됩니다. 본사에 문의해 주세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  priceLabel={meta.priceLabel}
                  onOrder={() => setView({ kind: "order", product })}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <OrderHistory orders={orders} token={token} onChanged={refresh} />
      )}
    </>
  );
}

function ProductCard({
  product,
  priceLabel,
  onOrder,
}: {
  product: ApiProduct;
  priceLabel: string;
  onOrder: () => void;
}) {
  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-amber-100/60 grid place-items-center text-amber-600/50 overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지, 크기 미고정
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <GemIcon className="w-11 h-11" />
        )}
      </div>
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <div className="text-sm font-extrabold leading-snug">{product.name}</div>
          <div className="text-xs text-caption mt-0.5">
            {(CATEGORY_LABEL[product.category] ?? product.category) + " · " + specOf(product)}
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2.5">
          <div>
            <div className="text-[11px] font-bold text-primary">{priceLabel}</div>
            <div className="text-lg font-extrabold tabular-nums">
              {product.unitPrice.toLocaleString("ko-KR")}
              <span className="text-xs font-semibold text-caption">원</span>
            </div>
          </div>
          <button
            onClick={onOrder}
            className="shrink-0 h-10 px-4 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold transition"
          >
            주문하기
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderForm({
  tier,
  token,
  product,
  onBack,
  onCreated,
}: {
  tier: WholesaleTierValue;
  token: string | null;
  product: ApiProduct;
  onBack: () => void;
  onCreated: (order: ApiOrder) => void;
}) {
  const meta = TIER_META[tier];
  const [qty, setQty] = useState(1);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = product.unitPrice * qty;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const order = await bizApiFetch<ApiOrder>("/biz/wholesale/orders", {
        method: "POST",
        body: {
          productId: product.id,
          quantity: qty,
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
        token,
      });
      onCreated(order);
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "주문을 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          onClick={onBack}
          className="h-9 px-3.5 rounded-full border border-line bg-white text-body text-xs font-bold hover:border-primary-light hover:text-primary transition"
        >
          ← 카탈로그
        </button>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">주문서 작성</h1>
        <TierBadge tier={tier} />
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <section className="flex-[1.6] min-w-80 bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-[18px]">
          <h2 className="text-base font-extrabold m-0">상품 정보</h2>
          <div className="flex gap-3.5 items-center bg-surface border border-line rounded-2xl p-3.5">
            <div className="w-[72px] h-[72px] rounded-xl bg-amber-100/60 grid place-items-center text-amber-600/50 shrink-0 overflow-hidden">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지
                <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <GemIcon className="w-7 h-7" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-extrabold">{product.name}</div>
              <div className="text-xs text-caption">{specOf(product)}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[11px] font-bold text-primary">{meta.priceLabel}</span>
                <span className="text-sm font-extrabold tabular-nums">{won(product.unitPrice)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">수량</label>
            <div className="flex items-center gap-2.5">
              <button
                aria-label="수량 줄이기"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="w-12 h-12 rounded-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-body"
              >
                <MinusIcon className="w-5 h-5" />
              </button>
              <div className="w-24 h-12 rounded-xl border border-line bg-white grid place-items-center text-base font-extrabold tabular-nums">
                {qty}
              </div>
              <button
                aria-label="수량 늘리기"
                onClick={() => setQty((q) => Math.min(9999, q + 1))}
                className="w-12 h-12 rounded-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              <span className="text-sm text-caption">개</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              요청사항 <span className="text-caption font-medium">(선택)</span>
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 개별 포장, 택배 발송 희망"
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
          </div>
        </section>

        <section className="flex-1 min-w-72 bg-white border-2 border-orange-100 rounded-3xl shadow-lg shadow-primary/5 p-5 md:p-6 flex flex-col gap-3.5">
          <h3 className="text-sm font-extrabold m-0">주문 요약</h3>
          <div className="flex justify-between">
            <span className="text-xs text-caption">단가 ({meta.priceLabel.replace(" 단가", "")})</span>
            <span className="text-sm font-bold tabular-nums">{won(product.unitPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">수량</span>
            <span className="text-sm font-bold tabular-nums">{qty}개</span>
          </div>
          <div className="border-t border-dashed border-orange-300 pt-3 flex justify-between items-baseline">
            <span className="text-sm font-bold text-body">총 주문 금액</span>
            <span className="text-xl font-extrabold text-primary tabular-nums">{won(total)}</span>
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
              <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-red-700 m-0 font-medium">{error}</p>
            </div>
          )}
          <Button
            className="h-14 rounded-2xl text-base shadow-primary/25"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting ? "접수 중..." : "주문 확정"}
          </Button>
          <p className="text-xs leading-relaxed text-caption m-0">
            주문 확정 후 본사 확인을 거쳐 출고됩니다. 결제·정산 조건은 계약 조건을 따릅니다.
          </p>
        </section>
      </div>
    </>
  );
}

function OrderHistory({
  orders,
  token,
  onChanged,
}: {
  orders: ApiOrder[];
  token: string | null;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function cancelOrder(order: ApiOrder) {
    setBusyId(order.id);
    setError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/wholesale/orders/${order.id}/cancel`, {
        method: "POST",
        body: {},
        token,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "주문을 취소하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-line rounded-3xl shadow-sm p-10 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
          <WholesaleIcon className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold">도매 주문 내역이 없습니다</div>
        <p className="text-xs text-caption leading-relaxed m-0">
          카탈로그에서 상품을 주문하면 이곳에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">{error}</p>
        </div>
      )}
      <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
        {orders.map((o) => {
          const expanded = expandedId === o.id;
          return (
            <div key={o.id} className="border-t border-slate-100 first:border-t-0">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : o.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedId(expanded ? null : o.id);
                  }
                }}
                className={`flex items-center gap-4 flex-wrap px-4 md:px-5 py-3.5 w-full text-left cursor-pointer transition ${
                  expanded ? "bg-orange-50/50" : "hover:bg-orange-50/30"
                }`}
              >
                <ChevronRightIcon
                  className={`w-4 h-4 shrink-0 text-caption transition-transform ${expanded ? "rotate-90 text-primary" : ""}`}
                />
                <div className="w-24 shrink-0">
                  <div className="text-sm font-extrabold tabular-nums uppercase">{o.id.slice(0, 8)}</div>
                  <div className="text-xs text-caption">{kstDateLabel(o.createdAt)}</div>
                </div>
                <div className="flex-[2] min-w-40">
                  <div className="text-sm font-bold truncate">{o.productName}</div>
                  <div className="text-xs text-caption tabular-nums">
                    {o.quantity}개 × {won(o.unitPrice)}
                    {o.memo ? ` · ${o.memo}` : ""}
                  </div>
                </div>
                <div className="flex-1 min-w-28 text-right text-sm font-extrabold tabular-nums">
                  {o.status === "CANCELED" ? "—" : won(o.totalAmount)}
                </div>
                <Badge tone={STATUS_META[o.status].tone} className="shrink-0">
                  {STATUS_META[o.status].label}
                </Badge>
                {o.status === "REQUESTED" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void cancelOrder(o);
                    }}
                    disabled={busyId === o.id}
                    className="shrink-0 h-9 px-3.5 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold disabled:opacity-50"
                  >
                    취소
                  </button>
                )}
              </div>
              {expanded && <OrderExpandedDetail order={o} token={token} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** 개체 상태 → 진행 라벨. 바인딩 전 개체는 존재하지 않으므로 목록 자체가 출고 준비의 신호다. */
const ITEM_STATUS_META: Record<string, { label: string; tone: "slate" | "blue" | "green" }> = {
  RESERVED: { label: "출고 준비", tone: "slate" },
  SHIPPED: { label: "배송중", tone: "blue" },
  DELIVERED: { label: "입고 확인", tone: "green" },
  RETURNED: { label: "반송", tone: "slate" },
  VOID: { label: "폐기", tone: "slate" },
};

/**
 * 주문 행 아래 인라인 상세(아코디언) — 상품 이미지·단가/총액·협력공장·진행 스테퍼·
 * 개체(시리얼) 목록을 한 번에 보여준다. 상세는 처음 펼칠 때 1회 조회.
 */
function OrderExpandedDetail({ order, token }: { order: ApiOrder; token: string | null }) {
  const [result, setResult] = useState<{ key: string; detail?: ApiOrderDetail; error?: string } | null>(null);
  const loading = result?.key !== order.id;
  const detail = !loading ? result?.detail : undefined;
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await bizApiFetch<ApiOrderDetail>(`/biz/wholesale/orders/${order.id}`, { token });
        if (!cancelled) setResult({ key: order.id, detail: res });
      } catch (e) {
        if (!cancelled) {
          setResult({
            key: order.id,
            error: e instanceof BizApiError ? e.message : "주문 정보를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, token]);

  // 진행 단계: 접수(발주 즉시 완료) → 제작 중 → 배송중 → 입고 완료.
  // 제작완료(개체 배정=RESERVED)는 제작 중 단계의 카운트로 보여준다.
  const reservedCount = detail?.items.filter((i) => i.status === "RESERVED").length ?? 0;
  const shippedCount = detail?.items.filter((i) => i.status === "SHIPPED").length ?? 0;
  const deliveredCount = detail?.items.filter((i) => i.status === "DELIVERED").length ?? 0;
  const currentStep = !detail
    ? 1
    : detail.status === "COMPLETED"
      ? 4
      : shippedCount + deliveredCount > 0
        ? 2
        : 1;
  const canceled = detail?.status === "CANCELED";

  // 협력공장 요약 — supplierRef 별 개수(미지정은 집계에서 제외)
  const factoryCounts = new Map<string, number>();
  for (const it of detail?.items ?? []) {
    if (it.supplierRef) factoryCounts.set(it.supplierRef, (factoryCounts.get(it.supplierRef) ?? 0) + 1);
  }
  const factorySummary = Array.from(factoryCounts.entries())
    .map(([name, count]) => `${name} ${count}개`)
    .join(" · ");

  const tierLabel = detail?.tierAtOrder === "SUPER_WHOLESALE" ? "도도매 등급가" : "도매 등급가";

  const STEPS = [
    { title: "주문 접수", desc: "발주 접수됨", count: null as string | null },
    {
      title: "제작 중",
      desc: detail?.status === "REQUESTED" ? "본사 확인 대기" : "제작·조달 진행",
      count: reservedCount > 0 ? `출고 준비 ${reservedCount}개` : null,
    },
    {
      title: "배송중",
      desc: "매장으로 이동",
      count: shippedCount > 0 ? `배송중 ${shippedCount}개` : null,
    },
    {
      title: "입고 완료",
      desc: "바코드 스캔 확인",
      count: deliveredCount > 0 ? `입고 ${deliveredCount}개` : null,
    },
  ];

  return (
    <div className="border-t border-orange-100 bg-gradient-to-b from-orange-50/70 via-orange-50/20 to-white px-4 md:px-6 py-5 md:py-6">
      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      ) : loadError || !detail ? (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">
            {loadError ?? "주문 정보를 불러오지 못했습니다."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:gap-5">
          {/* ── 상단: 이미지 · 주문 스펙 · 금액 요약 ─────────────────────── */}
          <div className="flex gap-4 md:gap-5 flex-wrap items-stretch">
            <div className="w-44 md:w-52 shrink-0">
              <div className="h-full min-h-44 rounded-2xl bg-amber-100/60 grid place-items-center text-amber-600/50 overflow-hidden border border-line shadow-sm">
                {detail.productImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지, 크기 미고정
                  <img
                    src={detail.productImageUrl}
                    alt={detail.productName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <GemIcon className="w-12 h-12" />
                )}
              </div>
            </div>

            <div className="flex-[2.2] min-w-80 bg-white border border-line rounded-2xl shadow-sm p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-base font-extrabold leading-snug">{detail.productName}</div>
                  <div className="text-xs text-caption mt-1 tabular-nums">
                    주문번호 <span className="font-bold text-body uppercase">{detail.id.slice(0, 8)}</span>
                    {" · "}
                    {kstDateLabel(detail.createdAt)} 주문
                  </div>
                </div>
                <Badge tone={STATUS_META[detail.status].tone} className="shrink-0 px-3 py-1">
                  {STATUS_META[detail.status].label}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <SpecCell label="단가" value={won(detail.unitPrice)} sub={tierLabel} />
                <SpecCell label="수량" value={`${detail.quantity}개`} />
                <SpecCell
                  label="입고 진행"
                  value={`${deliveredCount} / ${detail.quantity}개`}
                  sub={detail.items.length > 0 ? `개체 ${detail.items.length}개 배정` : "배정 전"}
                />
                <SpecCell
                  label="협력공장"
                  value={factorySummary || "—"}
                  sub={factorySummary ? undefined : "개체 배정 후 표시"}
                />
              </div>

              {detail.memo && (
                <div className="bg-surface border border-line rounded-xl px-3.5 py-2.5 text-xs text-body leading-relaxed">
                  <span className="font-extrabold text-caption mr-1.5">요청사항</span>
                  {detail.memo}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-56 bg-white border-2 border-orange-100 rounded-2xl shadow-lg shadow-primary/5 p-5 flex flex-col justify-center gap-2.5">
              <div className="text-[11px] font-extrabold text-primary">{tierLabel}</div>
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-caption tabular-nums">
                  {won(detail.unitPrice)} × {detail.quantity}개
                </span>
              </div>
              <div className="border-t border-dashed border-orange-200 pt-2.5">
                <div className="text-xs font-bold text-body">총 주문 금액</div>
                <div className="text-2xl font-extrabold text-primary tabular-nums leading-tight">
                  {won(detail.totalAmount)}
                </div>
              </div>
            </div>
          </div>

          {/* ── 진행 스테퍼(가로) ────────────────────────────────────────── */}
          {canceled ? (
            <div className="bg-slate-50 border border-line rounded-2xl px-5 py-4 text-sm text-body leading-relaxed">
              취소된 주문입니다. 다시 필요하면 카탈로그에서 새로 주문해주세요.
            </div>
          ) : (
            <div className="bg-white border border-line rounded-2xl shadow-sm px-5 md:px-8 py-5">
              <div className="flex items-start">
                {STEPS.map((s, i) => {
                  const done = i < currentStep;
                  const active = i === currentStep;
                  return (
                    <Fragment key={s.title}>
                      {i > 0 && (
                        <div
                          className={`flex-1 h-[3px] rounded-full mt-[15px] mx-1.5 md:mx-3 ${
                            i <= currentStep ? "bg-green-400" : "bg-line"
                          }`}
                        />
                      )}
                      <div className="flex flex-col items-center gap-1.5 w-20 md:w-28 shrink-0 text-center">
                        <span
                          className={`w-8 h-8 rounded-full grid place-items-center text-xs font-extrabold ${
                            done
                              ? "bg-green-500 text-white"
                              : active
                                ? "bg-primary text-white ring-4 ring-orange-100"
                                : "bg-slate-100 border border-line text-caption"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <div
                          className={`text-xs font-extrabold leading-tight ${
                            active ? "text-primary" : done ? "text-body" : "text-caption"
                          }`}
                        >
                          {s.title}
                        </div>
                        <div className="text-[10.5px] text-caption leading-tight hidden md:block">{s.desc}</div>
                        {s.count && (
                          <span className="text-[10.5px] font-extrabold text-primary bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 tabular-nums">
                            {s.count}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 개체(시리얼) 테이블 — 공장·수령일·상태 ──────────────────── */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm font-extrabold text-body m-0">배정된 개체 (시리얼)</h3>
              {detail.items.length > 0 && (
                <span className="text-[11px] font-bold text-caption bg-slate-100 rounded-full px-2.5 py-0.5 tabular-nums">
                  {detail.items.length}개 배정 / 주문 {detail.quantity}개
                </span>
              )}
            </div>
            {detail.items.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl px-5 py-6 text-xs text-caption leading-relaxed text-center">
                아직 배정된 개체가 없습니다 — 본사 출고 준비가 시작되면 시리얼·공장별 진행 상태가
                여기에 표시됩니다.
              </div>
            ) : (
              <div className="bg-white border border-line rounded-2xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_92px] gap-3 px-5 py-2.5 bg-surface border-b border-line text-[11px] font-extrabold text-caption">
                  <span>시리얼</span>
                  <span>협력공장</span>
                  <span>수령일</span>
                  <span className="text-right">상태</span>
                </div>
                {detail.items.map((it) => (
                  <div
                    key={it.serial}
                    className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_92px] gap-3 items-center px-5 py-3 border-t border-slate-100 first:border-t-0 hover:bg-orange-50/30 transition"
                  >
                    <span className="text-[13px] font-bold tabular-nums truncate">{it.serial}</span>
                    <span className={`text-xs truncate ${it.supplierRef ? "font-semibold text-body" : "text-caption"}`}>
                      {it.supplierRef ?? "미지정"}
                    </span>
                    <span className="text-xs text-caption tabular-nums">
                      {it.receivedAt ? `${kstDateLabel(it.receivedAt)} 수령` : "—"}
                    </span>
                    <span className="text-right">
                      <Badge tone={(ITEM_STATUS_META[it.status] ?? { tone: "slate" as const }).tone}>
                        {ITEM_STATUS_META[it.status]?.label ?? it.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 인라인 상세의 스펙 셀 — 라벨·값·보조설명 한 칸. */
function SpecCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-line rounded-xl px-3.5 py-2.5 min-w-0">
      <div className="text-[10.5px] font-extrabold text-caption">{label}</div>
      <div className="text-[13px] font-extrabold tabular-nums truncate mt-0.5">{value}</div>
      {sub && <div className="text-[10.5px] text-caption truncate mt-0.5">{sub}</div>}
    </div>
  );
}

function OrderComplete({
  tier,
  order,
  onViewHistory,
  onBackToCatalog,
}: {
  tier: WholesaleTierValue;
  order: ApiOrder;
  onViewHistory: () => void;
  onBackToCatalog: () => void;
}) {
  const meta = TIER_META[tier];

  return (
    <div className="flex-1 grid place-items-center">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-10 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-green-50 border-2 border-green-200 grid place-items-center text-green-600">
          <CheckIcon className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">주문이 접수되었습니다</h2>
          <div className="text-sm text-caption mt-2">본사 확인 후 출고 일정이 확정됩니다</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">주문번호</span>
            <span className="text-sm font-extrabold text-primary uppercase">{order.id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">상품</span>
            <span className="text-sm font-bold">{order.productName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">수량·단가</span>
            <span className="text-sm font-bold tabular-nums">
              {order.quantity}개 × {won(order.unitPrice)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">총액 ({meta.priceLabel})</span>
            <span className="text-sm font-extrabold text-primary tabular-nums">
              {won(order.totalAmount)}
            </span>
          </div>
          <div className="flex justify-between gap-3 items-center">
            <span className="text-xs text-caption">상태</span>
            <Badge tone={STATUS_META[order.status].tone}>{STATUS_META[order.status].label}</Badge>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-body m-0">
          본사 확인 후 출고 일정이 확정되면 안내드립니다.
        </p>
        <div className="w-full flex flex-col gap-2.5">
          <Button className="h-[52px] rounded-2xl text-sm shadow-primary/25" onClick={onViewHistory}>
            주문 내역 보기
          </Button>
          <Button variant="secondary" className="h-12 rounded-2xl text-sm" onClick={onBackToCatalog}>
            카탈로그로 돌아가기
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 카탈로그/내역 로딩 스켈레톤. */
function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
      <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
      <div className="h-64 rounded-3xl bg-slate-100 animate-pulse" />
    </div>
  );
}

/** 로드 실패 상태 + 재시도. */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-50 grid place-items-center text-red-500">
        <AlertCircleIcon className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold">도매 정보를 불러오지 못했습니다</div>
      <p className="text-xs text-caption leading-relaxed m-0">{message}</p>
      <button
        onClick={onRetry}
        className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold"
      >
        다시 시도
      </button>
    </div>
  );
}
