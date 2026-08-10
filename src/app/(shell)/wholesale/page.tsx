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

/** 가격 산출 방식 — 상품 속성(백엔드 미러). SPOT_LINKED 는 금액이 시세로 만들어진다. */
type PricingMode = "FIXED" | "SPOT_LINKED";

/** GET /biz/wholesale/products 항목 — unitPrice 는 내 등급 전용 단가(서버가 등급 필터). */
type ApiProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string;
  weightGram: number | null;
  purityCode: string;
  unitPrice: number;
  pricingMode: PricingMode;
  metalType: "GOLD" | "SILVER";
  /** 1개 순중량(g) — 순금/순은 환산. 시세가 바뀌어도 이 값은 안 움직인다. */
  pureGram: number | null;
  laborFee: number | null;
  /** 값이 있으면 주문할 수 없다(공임 미설정·순도 미상·시세 없음). */
  priceUnavailableReason: string | null;
};

/** 카탈로그 상단 시세 띠 — 잠금이 아니라 현재값. 주문 시각에 다시 잠긴다. */
type ApiSpotBand = {
  gold24kKrwPerGram: number | null;
  gold18kKrwPerGram: number | null;
  gold14kKrwPerGram: number | null;
  silverKrwPerGram: number | null;
  asOf: string | null;
};

type OrderStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELED";

/** 주문 라인 — 수량·금액의 SSOT. 헤더 필드는 첫 라인 기준 대표값이다. */
type ApiOrderLine = {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  pricingMode: PricingMode;
  pureGram: number | null;
  laborFee: number | null;
  unitPrice: number;
  lineAmount: number;
};

/** 주문 시각에 잠근 시세. 고정가 품목만 담긴 주문은 잠금이 없다(null). */
type ApiPriceLock = {
  id: string;
  gold24kKrwPerGram: number;
  silverKrwPerGram: number | null;
  lockedAt: string;
  /** 입금 기한 — 넘기면 본사 재잠금이 필요하다. */
  expiresAt: string | null;
  isExpired: boolean;
};

/**
 * GET/POST /biz/wholesale/orders 항목.
 * productName/unitPrice 는 첫 라인 대표값이고 quantity 는 라인 수량 합이다 —
 * 다품목 주문의 금액은 lines 로 본다.
 */
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
  lines: ApiOrderLine[];
  lineCount: number;
  metalType: "GOLD" | "SILVER" | null;
  totalPureGram: number | null;
  totalLaborFee: number | null;
  priceLock: ApiPriceLock | null;
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

/** ISO → KST M/D HH:MM 라벨(입금 기한처럼 시각까지 필요한 자리). */
function kstDateTimeLabel(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 중량 표기(소수 3자리까지). */
function gram(n: number): string {
  return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}g`;
}

/** 상품 스펙 요약 — 순도코드 · 중량. */
function specOf(p: ApiProduct): string {
  const parts = [p.purityCode, p.weightGram != null ? `${p.weightGram}g` : null];
  return parts.filter(Boolean).join(" · ");
}

/** 순중량 라벨 — 금이면 "순금", 은이면 "순은". */
function pureLabel(metal: "GOLD" | "SILVER" | null): string {
  return metal === "SILVER" ? "순은" : "순금";
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

type View = { kind: "list" } | { kind: "cart" } | { kind: "complete"; order: ApiOrder };

/** 장바구니 = 상품 id → 수량. 한 번에 여러 종을 한 발주로 보내는 자리다. */
type Cart = Record<string, number>;

function WholesaleOrdering({ tier }: { tier: WholesaleTierValue }) {
  const { token } = useBizSession();
  const meta = TIER_META[tier];
  const [tab, setTab] = useState<"catalog" | "history">("catalog");
  const [category, setCategory] = useState<string>("전체");
  const [view, setView] = useState<View>({ kind: "list" });
  const [cart, setCart] = useState<Cart>({});

  // 로딩은 "요청 키 ↔ 결과 키 불일치"로 파생(set-state-in-effect 회피, 거래 화면과 동일 패턴)
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `wholesale:${reloadCount}`;
  const [result, setResult] = useState<{
    key: string;
    products?: ApiProduct[];
    orders?: ApiOrder[];
    spot?: ApiSpotBand;
    error?: string;
  } | null>(null);
  const loading = result?.key !== requestKey;
  const products = useMemo(
    () => (!loading ? (result?.products ?? []) : []),
    [loading, result],
  );
  const orders = (!loading && result?.orders) || [];
  const spot = (!loading && result?.spot) || null;
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [productsRes, ordersRes] = await Promise.all([
          bizApiFetch<{ products: ApiProduct[]; spot: ApiSpotBand }>("/biz/wholesale/products", {
            token,
          }),
          bizApiFetch<{ orders: ApiOrder[] }>("/biz/wholesale/orders", { token }),
        ]);
        if (!cancelled) {
          setResult({
            key: requestKey,
            products: productsRes.products,
            spot: productsRes.spot,
            orders: ordersRes.orders,
          });
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

  /** 담기 — 같은 상품을 또 담으면 수량을 더한다. */
  function addToCart(productId: string, qty: number) {
    setCart((prev) => ({ ...prev, [productId]: Math.min(9999, (prev[productId] ?? 0) + qty) }));
  }

  /** 장바구니 수량 지정(0 이하면 제거). */
  function setCartQty(productId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[productId];
      else next[productId] = Math.min(9999, qty);
      return next;
    });
  }

  /** 담긴 상품을 카탈로그 순서대로 편다 — 담긴 뒤 판매가 끊긴 상품은 자동으로 빠진다. */
  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => ({ product: p, quantity: cart[p.id] })),
    [products, cart],
  );
  const cartTotal = cartLines.reduce((sum, l) => sum + l.product.unitPrice * l.quantity, 0);

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

  if (view.kind === "cart") {
    return (
      <CartView
        tier={tier}
        token={token}
        lines={cartLines}
        spot={spot}
        onBack={() => setView({ kind: "list" })}
        onQty={setCartQty}
        onCreated={(order) => {
          setCart({});
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
          <SpotBandStrip spot={spot} />

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
                  inCart={cart[product.id] ?? 0}
                  onAdd={(qty) => addToCart(product.id, qty)}
                />
              ))}
            </div>
          )}

          <CartBar
            lineCount={cartLines.length}
            quantity={cartLines.reduce((sum, l) => sum + l.quantity, 0)}
            total={cartTotal}
            onOpen={() => setView({ kind: "cart" })}
            onClear={() => setCart({})}
          />
        </>
      ) : (
        <OrderHistory orders={orders} token={token} onChanged={refresh} />
      )}
    </>
  );
}

/**
 * 상단 시세 띠 — 24K·18K·14K·은의 현재 시세(원/g).
 * **잠금이 아니다.** 시세 연동 상품 금액은 발주 시각에 다시 잠기고 그때부터 기한이 걸린다.
 */
function SpotBandStrip({ spot }: { spot: ApiSpotBand | null }) {
  const items = [
    { label: "24K", value: spot?.gold24kKrwPerGram ?? null },
    { label: "18K", value: spot?.gold18kKrwPerGram ?? null },
    { label: "14K", value: spot?.gold14kKrwPerGram ?? null },
    { label: "은", value: spot?.silverKrwPerGram ?? null },
  ];
  return (
    <div className="bg-white border border-line rounded-2xl shadow-sm px-4 md:px-5 py-3 flex items-center gap-x-6 gap-y-2 flex-wrap">
      <span className="text-[11px] font-extrabold text-caption shrink-0">오늘 시세 (원/g)</span>
      {items.map((it) => (
        <span key={it.label} className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-extrabold text-primary">{it.label}</span>
          <span className="text-base font-extrabold tabular-nums">
            {it.value != null ? it.value.toLocaleString("ko-KR") : "—"}
          </span>
        </span>
      ))}
      <span className="text-[11px] text-caption ml-auto">
        시세 연동 상품 금액은 발주하는 순간 잠깁니다
        {spot?.asOf ? ` · ${kstDateTimeLabel(spot.asOf)} 기준` : ""}
      </span>
    </div>
  );
}

/**
 * 담긴 품목 요약 바 — 카탈로그 하단에 붙어 여러 종을 한 발주로 보내는 진입점.
 * 담긴 게 없으면 아무것도 안 그린다(빈 바가 자리만 차지하지 않게).
 */
function CartBar({
  lineCount,
  quantity,
  total,
  onOpen,
  onClear,
}: {
  lineCount: number;
  quantity: number;
  total: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  if (lineCount === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 bg-white border-2 border-orange-100 rounded-2xl shadow-lg shadow-primary/10 px-4 md:px-5 py-3 flex items-center gap-4 flex-wrap">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-extrabold">담은 품목 {lineCount}종</span>
        <span className="text-xs text-caption tabular-nums">총 {quantity}개</span>
      </div>
      <div className="ml-auto flex items-center gap-2.5 flex-wrap">
        <span className="text-lg font-extrabold text-primary tabular-nums">{won(total)}</span>
        <button
          onClick={onClear}
          className="h-10 px-3.5 rounded-xl border border-line bg-white text-caption text-xs font-bold hover:text-body transition"
        >
          비우기
        </button>
        <Button className="h-10 px-5 rounded-xl text-xs" onClick={onOpen}>
          발주서 작성
        </Button>
      </div>
    </div>
  );
}

/**
 * 카탈로그 카드 — 수량을 정해 장바구니에 담는다.
 * 시세 연동 상품은 확정된 값(순중량·공임)과 시세로 만든 금액을 갈라 보여준다.
 */
function ProductCard({
  product,
  priceLabel,
  inCart,
  onAdd,
}: {
  product: ApiProduct;
  priceLabel: string;
  inCart: number;
  onAdd: (qty: number) => void;
}) {
  const [qty, setQty] = useState(1);
  const spotLinked = product.pricingMode === "SPOT_LINKED";
  const blocked = product.priceUnavailableReason;

  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-amber-100/60 grid place-items-center text-amber-600/50 overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지, 크기 미고정
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <GemIcon className="w-11 h-11" />
        )}
        {inCart > 0 && (
          <span className="absolute top-2.5 right-2.5 bg-primary text-white text-[11px] font-extrabold rounded-full px-2.5 py-1 shadow-md tabular-nums">
            담김 {inCart}개
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <div className="text-sm font-extrabold leading-snug">{product.name}</div>
          <div className="text-xs text-caption mt-0.5">
            {(CATEGORY_LABEL[product.category] ?? product.category) + " · " + specOf(product)}
          </div>
        </div>

        {/* 시세 연동 상품은 "안 바뀌는 값"을 먼저 보여준다 — 금액은 시세를 대입한 결과일 뿐이다. */}
        {spotLinked && (
          <div className="bg-surface border border-line rounded-xl px-3 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span className="text-[11px] text-caption">
              {pureLabel(product.metalType)}{" "}
              <strong className="text-body tabular-nums">
                {product.pureGram != null ? gram(product.pureGram) : "—"}
              </strong>
            </span>
            <span className="text-[11px] text-caption">
              공임{" "}
              <strong className="text-body tabular-nums">
                {product.laborFee != null ? won(product.laborFee) : "—"}
              </strong>
            </span>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2.5">
          <div>
            <div className="text-[11px] font-bold text-primary">
              {priceLabel}
              {spotLinked ? " · 시세 반영" : ""}
            </div>
            <div className="text-lg font-extrabold tabular-nums">
              {blocked ? (
                <span className="text-sm font-bold text-caption">가격 산출 불가</span>
              ) : (
                <>
                  {product.unitPrice.toLocaleString("ko-KR")}
                  <span className="text-xs font-semibold text-caption">원</span>
                </>
              )}
            </div>
          </div>

          {blocked ? (
            <p className="text-[11px] leading-relaxed text-red-600 font-medium m-0">{blocked}</p>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 shrink-0">
                <button
                  aria-label="수량 줄이기"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  className="w-9 h-10 rounded-l-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition disabled:opacity-40"
                >
                  <MinusIcon className="w-4 h-4" />
                </button>
                <div className="w-11 h-10 border-y border-line bg-white grid place-items-center text-sm font-extrabold tabular-nums">
                  {qty}
                </div>
                <button
                  aria-label="수량 늘리기"
                  onClick={() => setQty((q) => Math.min(9999, q + 1))}
                  className="w-9 h-10 rounded-r-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => onAdd(qty)}
                className="flex-1 h-10 px-4 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold transition"
              >
                담기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 발주서 라인 — 카탈로그 상품 + 담은 수량. */
type CartLine = { product: ApiProduct; quantity: number };

/**
 * 발주서 — 담은 여러 종을 **한 건**으로 보낸다.
 *
 * 이전에는 상품 하나가 곧 주문 하나여서 3종을 담으면 주문이 3건으로 쪼개졌다.
 * 서버에 { lines: [...] } 로 보내면 헤더 1건 + 라인 N개가 만들어진다.
 */
function CartView({
  tier,
  token,
  lines,
  spot,
  onBack,
  onQty,
  onCreated,
}: {
  tier: WholesaleTierValue;
  token: string | null;
  lines: CartLine[];
  spot: ApiSpotBand | null;
  onBack: () => void;
  onQty: (productId: string, qty: number) => void;
  onCreated: (order: ApiOrder) => void;
}) {
  const meta = TIER_META[tier];
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((sum, l) => sum + l.product.unitPrice * l.quantity, 0);
  const spotLines = lines.filter((l) => l.product.pricingMode === "SPOT_LINKED");
  const metals = new Set(spotLines.map((l) => l.product.metalType));
  const totalPureGram = spotLines.reduce(
    (sum, l) => sum + (l.product.pureGram ?? 0) * l.quantity,
    0,
  );
  const totalLaborFee = spotLines.reduce((sum, l) => sum + (l.product.laborFee ?? 0) * l.quantity, 0);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const order = await bizApiFetch<ApiOrder>("/biz/wholesale/orders", {
        method: "POST",
        body: {
          lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
        token,
      });
      onCreated(order);
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "발주를 접수하지 못했습니다.");
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
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">발주서 작성</h1>
        <TierBadge tier={tier} />
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <section className="flex-[1.6] min-w-80 bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-[18px]">
          <h2 className="text-base font-extrabold m-0">담은 품목 {lines.length}종</h2>

          {lines.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl px-5 py-8 text-center text-xs text-caption leading-relaxed">
              담은 품목이 없습니다 — 카탈로그에서 담아 주세요.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lines.map((l) => (
                <CartLineRow
                  key={l.product.id}
                  line={l}
                  priceLabel={meta.priceLabel}
                  onQty={(q) => onQty(l.product.id, q)}
                />
              ))}
            </div>
          )}

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
          <h3 className="text-sm font-extrabold m-0">발주 요약</h3>

          {/* 확정되는 값과 시세로 만들어지는 값을 갈라 보여준다 — 재잠금 때 뭐가 안 바뀌는지가 여기서 갈린다. */}
          {spotLines.length > 0 && (
            <div className="bg-surface border border-line rounded-2xl px-3.5 py-3 flex flex-col gap-1.5">
              <div className="text-[11px] font-extrabold text-caption">발주로 확정되는 값</div>
              {metals.size === 1 ? (
                <div className="flex justify-between">
                  <span className="text-xs text-caption">{pureLabel([...metals][0])} 환산 중량</span>
                  <span className="text-sm font-bold tabular-nums">{gram(totalPureGram)}</span>
                </div>
              ) : (
                <div className="text-[11px] text-caption leading-relaxed">
                  금·은이 섞여 있어 순중량 합은 품목별로 봅니다.
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-xs text-caption">공임 합계</span>
                <span className="text-sm font-bold tabular-nums">{won(totalLaborFee)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-xs text-caption">품목 / 수량</span>
            <span className="text-sm font-bold tabular-nums">
              {lines.length}종 / {lines.reduce((sum, l) => sum + l.quantity, 0)}개
            </span>
          </div>
          <div className="border-t border-dashed border-orange-300 pt-3 flex justify-between items-baseline">
            <span className="text-sm font-bold text-body">총 발주 금액</span>
            <span className="text-xl font-extrabold text-primary tabular-nums">{won(total)}</span>
          </div>

          {spotLines.length > 0 && (
            <p className="text-[11px] leading-relaxed text-caption m-0 bg-surface border border-line rounded-xl px-3 py-2.5">
              시세 연동 품목이 있어 <strong className="text-body">발주하는 순간 시세가 잠기고</strong>{" "}
              입금 기한이 걸립니다. 기한을 넘기면 본사가 시세를 다시 잠급니다.
              {spot?.gold24kKrwPerGram != null
                ? ` 현재 24K ${spot.gold24kKrwPerGram.toLocaleString("ko-KR")}원/g.`
                : ""}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
              <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-red-700 m-0 font-medium">{error}</p>
            </div>
          )}
          <Button
            className="h-14 rounded-2xl text-base shadow-primary/25"
            onClick={() => void handleConfirm()}
            disabled={submitting || lines.length === 0}
          >
            {submitting ? "접수 중..." : "발주 확정"}
          </Button>
          <p className="text-xs leading-relaxed text-caption m-0">
            발주 확정 후 본사 확인을 거쳐 출고됩니다. 결제·정산 조건은 계약 조건을 따릅니다.
          </p>
        </section>
      </div>
    </>
  );
}

/**
 * 발주서의 품목 한 줄 — 수량 조절·삭제.
 * 시세 연동 품목은 순중량·공임을 함께 적어 금액이 어디서 나왔는지 드러낸다.
 */
function CartLineRow({
  line,
  priceLabel,
  onQty,
}: {
  line: CartLine;
  priceLabel: string;
  onQty: (qty: number) => void;
}) {
  const { product, quantity } = line;
  return (
    <div className="flex gap-3.5 items-center bg-surface border border-line rounded-2xl p-3.5 flex-wrap">
      <div className="w-[60px] h-[60px] rounded-xl bg-amber-100/60 grid place-items-center text-amber-600/50 shrink-0 overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(R2) 이미지
          <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <GemIcon className="w-6 h-6" />
        )}
      </div>
      <div className="flex-1 min-w-40">
        <div className="text-sm font-extrabold leading-snug">{product.name}</div>
        <div className="text-xs text-caption">
          {product.pricingMode === "SPOT_LINKED"
            ? `${pureLabel(product.metalType)} ${product.pureGram != null ? gram(product.pureGram) : "—"} · 공임 ${product.laborFee != null ? won(product.laborFee) : "—"}`
            : specOf(product)}
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-[11px] font-bold text-primary">{priceLabel}</span>
          <span className="text-sm font-extrabold tabular-nums">{won(product.unitPrice)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1">
          <button
            aria-label={`${product.name} 수량 줄이기`}
            onClick={() => onQty(quantity - 1)}
            className="w-9 h-10 rounded-l-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition"
          >
            <MinusIcon className="w-4 h-4" />
          </button>
          <div className="w-12 h-10 border-y border-line bg-white grid place-items-center text-sm font-extrabold tabular-nums">
            {quantity}
          </div>
          <button
            aria-label={`${product.name} 수량 늘리기`}
            onClick={() => onQty(quantity + 1)}
            className="w-9 h-10 rounded-r-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="w-28 text-right">
          <div className="text-sm font-extrabold tabular-nums">
            {won(product.unitPrice * quantity)}
          </div>
          <button
            onClick={() => onQty(0)}
            className="text-[11px] font-bold text-caption hover:text-red-600 transition"
          >
            빼기
          </button>
        </div>
      </div>
    </div>
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
                    {/* 다품목은 단가가 첫 라인 대표값이라 합계와 안 맞는다 — 종수만 밝힌다. */}
                    {o.lineCount > 1
                      ? `${o.lineCount}종 · 총 ${o.quantity}개`
                      : `${o.quantity}개 × ${won(o.unitPrice)}`}
                    {o.memo ? ` · ${o.memo}` : ""}
                  </div>
                </div>
                <div className="flex-1 min-w-28 text-right text-sm font-extrabold tabular-nums">
                  {o.status === "CANCELED" ? "—" : won(o.totalAmount)}
                </div>
                {/* 기한이 지난 시세 잠금은 재잠금 전까지 금액이 확정이 아니다 — 목록에서 바로 보여야 한다. */}
                {o.priceLock?.isExpired && o.status !== "CANCELED" && (
                  <Badge tone="slate" className="shrink-0">
                    시세 기한 지남
                  </Badge>
                )}
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
                <SpecCell label="품목" value={`${detail.lineCount}종`} sub={tierLabel} />
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

              {/* 확정된 값(순중량·공임)과 미확정(시세)을 갈라 보여준다 — 재잠금 시 무엇이 안 움직이는지. */}
              {detail.priceLock && (
                <PriceLockNotice order={detail} />
              )}

              {detail.memo && (
                <div className="bg-surface border border-line rounded-xl px-3.5 py-2.5 text-xs text-body leading-relaxed">
                  <span className="font-extrabold text-caption mr-1.5">요청사항</span>
                  {detail.memo}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-56 bg-white border-2 border-orange-100 rounded-2xl shadow-lg shadow-primary/5 p-5 flex flex-col justify-center gap-2.5">
              <div className="text-[11px] font-extrabold text-primary">{tierLabel}</div>
              {detail.totalPureGram != null && (
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-caption">{pureLabel(detail.metalType)} 환산</span>
                  <span className="font-bold tabular-nums">{gram(detail.totalPureGram)}</span>
                </div>
              )}
              {detail.totalLaborFee != null && (
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-caption">공임 합계</span>
                  <span className="font-bold tabular-nums">{won(detail.totalLaborFee)}</span>
                </div>
              )}
              <div className="border-t border-dashed border-orange-200 pt-2.5">
                <div className="text-xs font-bold text-body">총 주문 금액</div>
                <div className="text-2xl font-extrabold text-primary tabular-nums leading-tight">
                  {won(detail.totalAmount)}
                </div>
              </div>
            </div>
          </div>

          {/* ── 주문 내역(라인) — 다품목 발주의 수량·금액 SSOT ────────────── */}
          <OrderLineList lines={detail.lines} />

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

/**
 * 시세 잠금 안내 — 잠긴 시세와 입금 기한.
 * 기한이 지나면 금액이 확정이 아니라는 사실을 매장이 먼저 알아야 한다(본사가 재잠금한다).
 */
function PriceLockNotice({ order }: { order: ApiOrder }) {
  const lock = order.priceLock;
  if (!lock) return null;
  const perGram = order.metalType === "SILVER" ? lock.silverKrwPerGram : lock.gold24kKrwPerGram;
  const expired = lock.isExpired;
  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap border ${
        expired ? "bg-red-50 border-red-200" : "bg-surface border-line"
      }`}
    >
      <span className={`text-[11px] font-extrabold ${expired ? "text-red-700" : "text-primary"}`}>
        {expired ? "시세 기한 지남" : "시세 잠금 중"}
      </span>
      <span className="text-xs text-caption tabular-nums">
        잠긴 시세{" "}
        <strong className="text-body">
          {perGram != null ? `${perGram.toLocaleString("ko-KR")}원/g` : "—"}
        </strong>
      </span>
      <span className="text-xs text-caption tabular-nums">
        입금 기한{" "}
        <strong className="text-body">
          {lock.expiresAt ? kstDateTimeLabel(lock.expiresAt) : "없음"}
        </strong>
      </span>
      <span className="text-[11px] text-caption">
        {expired
          ? "본사가 시세를 다시 잠근 뒤 금액이 확정됩니다 — 순중량·공임은 그대로입니다."
          : "기한을 넘기면 본사가 시세를 다시 잠급니다 — 순중량·공임은 그대로입니다."}
      </span>
    </div>
  );
}

/** 주문 라인 목록 — 다품목 발주의 품목별 수량·단가·금액. */
function OrderLineList({ lines }: { lines: ApiOrderLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-sm font-extrabold text-body m-0">주문 내역 {lines.length}종</h3>
      <div className="bg-white border border-line rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[minmax(0,2fr)_72px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-5 py-2.5 bg-surface border-b border-line text-[11px] font-extrabold text-caption">
          <span>품목</span>
          <span className="text-right">수량</span>
          <span className="text-right">단가</span>
          <span className="text-right">금액</span>
        </div>
        {lines.map((l) => (
          <div
            key={l.productId}
            className="grid grid-cols-[minmax(0,2fr)_72px_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center px-5 py-3 border-t border-slate-100 first:border-t-0"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-bold truncate">{l.productName}</div>
              <div className="text-[11px] text-caption tabular-nums">
                {l.pricingMode === "SPOT_LINKED"
                  ? `순중량 ${l.pureGram != null ? gram(l.pureGram) : "—"} · 공임 ${l.laborFee != null ? won(l.laborFee) : "—"}`
                  : "고정가"}
              </div>
            </div>
            <span className="text-right text-[13px] font-semibold tabular-nums">{l.quantity}</span>
            <span className="text-right text-[13px] text-caption tabular-nums">
              {won(l.unitPrice)}
            </span>
            <span className="text-right text-[13px] font-extrabold tabular-nums">
              {won(l.lineAmount)}
            </span>
          </div>
        ))}
      </div>
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
          <h2 className="text-2xl font-extrabold m-0">발주가 접수되었습니다</h2>
          <div className="text-sm text-caption mt-2">본사 확인 후 출고 일정이 확정됩니다</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">주문번호</span>
            <span className="text-sm font-extrabold text-primary uppercase">{order.id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">품목</span>
            <span className="text-sm font-bold text-right">{order.productName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">품목 / 수량</span>
            <span className="text-sm font-bold tabular-nums">
              {order.lineCount}종 / {order.quantity}개
            </span>
          </div>
          {order.totalPureGram != null && (
            <div className="flex justify-between gap-3">
              <span className="text-xs text-caption">{pureLabel(order.metalType)} 환산 중량</span>
              <span className="text-sm font-bold tabular-nums">{gram(order.totalPureGram)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">총액 ({meta.priceLabel})</span>
            <span className="text-sm font-extrabold text-primary tabular-nums">
              {won(order.totalAmount)}
            </span>
          </div>
          {order.priceLock?.expiresAt && (
            <div className="flex justify-between gap-3">
              <span className="text-xs text-caption">입금 기한</span>
              <span className="text-sm font-extrabold tabular-nums">
                {kstDateTimeLabel(order.priceLock.expiresAt)}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-3 items-center">
            <span className="text-xs text-caption">상태</span>
            <Badge tone={STATUS_META[order.status].tone}>{STATUS_META[order.status].label}</Badge>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-body m-0">
          {order.priceLock?.expiresAt
            ? "잠긴 시세는 입금 기한까지 유효합니다. 기한을 넘기면 본사가 시세를 다시 잠급니다 — 순중량과 공임은 그대로입니다."
            : "본사 확인 후 출고 일정이 확정되면 안내드립니다."}
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
