"use client";

import { useMemo, useState } from "react";
import { GemIcon, MinusIcon, PlusIcon, WholesaleIcon, CheckIcon } from "@/components/icons";
import { Badge, Button, FilterChip } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { isWholesaleTier, type BizTier } from "@/lib/session";

/** 카탈로그 카테고리 필터 값. "전체"는 필터 미적용을 뜻한다. */
type Category = "전체" | "골드바" | "목걸이" | "반지" | "돌·답례";

const CATEGORIES: Category[] = ["전체", "골드바", "목걸이", "반지", "돌·답례"];

type Product = {
  id: string;
  name: string;
  category: Exclude<Category, "전체">;
  spec: string;
  /** 등급별 전용 단가(원). 해당 등급 값이 null이면 그 계정에는 주문 불가 상품. */
  prices: Record<Exclude<BizTier, "NONE">, number | null>;
};

const PRODUCTS: Product[] = [
  {
    id: "GS-N1402",
    name: "14K 데일리 체인 목걸이",
    category: "목걸이",
    spec: "14K(585) · 4.2g · 42cm · GS-N1402",
    prices: { WHOLESALE: 184000, SUPER_WHOLESALE: 168000 },
  },
  {
    id: "GS-B0010",
    name: "순금 골드바 10g (자체 각인)",
    category: "골드바",
    spec: "24K(999) · 10g · GS-B0010",
    prices: { WHOLESALE: 978000, SUPER_WHOLESALE: 972000 },
  },
  {
    id: "GS-R1808",
    name: "18K 트위스트 반지",
    category: "반지",
    spec: "18K(750) · 3.1g · GS-R1808",
    prices: { WHOLESALE: 256000, SUPER_WHOLESALE: 241000 },
  },
  {
    id: "GS-S3000",
    name: "은수저 답례 세트",
    category: "돌·답례",
    spec: "은(925) · 2점 구성 · GS-S3000",
    prices: { WHOLESALE: 146000, SUPER_WHOLESALE: 140000 },
  },
  {
    id: "GS-F1875",
    name: "순금 카네이션 브로치",
    category: "돌·답례",
    // 이 계정 등급에는 단가 미설정 → "현재 주문 불가"
    spec: "24K(999) · 1.875g · GS-F1875",
    prices: { WHOLESALE: null, SUPER_WHOLESALE: null },
  },
];

/**
 * 주문 상태 라벨(잠정). 백엔드 정책 확정 시 값·색 매핑 갱신 예정.
 * 요청됨=slate / 확인됨=blue / 완료=green / 취소=slate(중립)
 */
type OrderStatus = "요청됨" | "확인됨" | "완료" | "취소";

type WholesaleOrder = {
  code: string;
  date: string;
  title: string;
  sub: string;
  total: number | null;
  status: OrderStatus;
};

const INITIAL_ORDERS: WholesaleOrder[] = [
  {
    code: "WO-2607",
    date: "7/9",
    title: "순금 골드바 10g 외 2건",
    sub: "12개 · 3개 품목",
    total: 11736000,
    status: "확인됨",
  },
  {
    code: "WO-2594",
    date: "7/4",
    title: "은수저 답례 세트",
    sub: "30개 × 146,000원",
    total: 4380000,
    status: "완료",
  },
  {
    code: "WO-2586",
    date: "6/30",
    title: "18K 트위스트 반지",
    sub: "5개 · 발주 취소",
    total: null,
    status: "취소",
  },
];

const STATUS_TONE: Record<OrderStatus, "slate" | "blue" | "green"> = {
  요청됨: "slate",
  확인됨: "blue",
  완료: "green",
  취소: "slate",
};

const QTY_MIN = 5;
const QTY_STEP = 5;

/** 원화 표기(1,234,000원). */
function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 이 계정 등급의 전용 단가. 미설정이면 null → 주문 불가 상품. */
function unitPriceFor(product: Product, tier: Exclude<BizTier, "NONE">): number | null {
  return product.prices[tier];
}

export default function WholesalePage() {
  const { account: session } = useBizSession();

  // 등급 게이팅: 도매/도도매가 아니면 접근 안내만 렌더. 서버도 tier 를 재검증한다(프론트는 UX용).
  if (!isWholesaleTier(session.tier)) {
    return <AccessNotice />;
  }

  // 이 지점부터 tier는 WHOLESALE | SUPER_WHOLESALE 로 확정된다.
  return <WholesaleOrdering tier={session.tier as Exclude<BizTier, "NONE">} />;
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

const TIER_META: Record<Exclude<BizTier, "NONE">, TierMeta> = {
  WHOLESALE: { badgeClass: "bg-primary", label: "도매 계정 · WHOLESALE", priceLabel: "도매 단가" },
  SUPER_WHOLESALE: {
    badgeClass: "bg-orange-800",
    label: "도도매 계정 · SUPER_WHOLESALE",
    priceLabel: "도도매 단가",
  },
};

/** 상시 노출되는 등급 배지(도매=primary / 도도매=진한 오렌지). */
function TierBadge({ tier }: { tier: Exclude<BizTier, "NONE"> }) {
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
  | { kind: "order"; product: Product; unitPrice: number }
  | { kind: "complete"; order: WholesaleOrder };

function WholesaleOrdering({ tier }: { tier: Exclude<BizTier, "NONE"> }) {
  const meta = TIER_META[tier];
  const [tab, setTab] = useState<"catalog" | "history">("catalog");
  const [category, setCategory] = useState<Category>("전체");
  const [view, setView] = useState<View>({ kind: "list" });
  const [orders, setOrders] = useState<WholesaleOrder[]>(INITIAL_ORDERS);

  const visibleProducts = useMemo(
    () => (category === "전체" ? PRODUCTS : PRODUCTS.filter((p) => p.category === category)),
    [category],
  );

  function startOrder(product: Product) {
    const unitPrice = unitPriceFor(product, tier);
    if (unitPrice === null) return;
    setView({ kind: "order", product, unitPrice });
  }

  function confirmOrder(product: Product, unitPrice: number, qty: number) {
    // TODO(API 연동): POST 도매 주문 생성. 지금은 로컬 상태로 접수 확정만 반영.
    const seq = 2611 + orders.length;
    const order: WholesaleOrder = {
      code: `WO-${seq}`,
      date: "오늘",
      title: product.name,
      sub: `${qty}개 × ${won(unitPrice)}`,
      total: unitPrice * qty,
      status: "요청됨",
    };
    setOrders((prev) => [order, ...prev]);
    setView({ kind: "complete", order });
  }

  if (view.kind === "order") {
    return (
      <OrderForm
        tier={tier}
        product={view.product}
        unitPrice={view.unitPrice}
        onBack={() => setView({ kind: "list" })}
        onConfirm={(qty) => confirmOrder(view.product, view.unitPrice, qty)}
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
            표시되는 모든 단가는 <strong className="text-primary">{meta.priceLabel.replace(" 단가", " 등급 전용가")}</strong>
            입니다 · 2026년 7월 10일 (금) KST
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
            주문 내역
          </button>
        </div>
      </div>

      {tab === "catalog" ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </FilterChip>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                unitPrice={unitPriceFor(product, tier)}
                priceLabel={meta.priceLabel}
                onOrder={() => startOrder(product)}
              />
            ))}
          </div>
        </>
      ) : (
        <OrderHistory orders={orders} />
      )}
    </>
  );
}

function ProductCard({
  product,
  unitPrice,
  priceLabel,
  onOrder,
}: {
  product: Product;
  unitPrice: number | null;
  priceLabel: string;
  onOrder: () => void;
}) {
  const orderable = unitPrice !== null;

  return (
    <div
      className={`bg-white border border-line rounded-3xl shadow-sm overflow-hidden flex flex-col ${
        orderable ? "" : "opacity-70"
      }`}
    >
      <div className="relative aspect-[4/3] bg-amber-100/60 grid place-items-center text-amber-600/50">
        <GemIcon className="w-11 h-11" />
        {!orderable && (
          <span className="absolute top-2.5 left-2.5 text-[11px] font-bold text-slate-600 bg-white/95 border border-slate-300 rounded-full px-2.5 py-1">
            현재 주문 불가
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div>
          <div className="text-sm font-extrabold leading-snug">{product.name}</div>
          <div className="text-xs text-caption mt-0.5">{product.spec}</div>
        </div>
        {orderable ? (
          <div className="mt-auto flex items-end justify-between gap-2.5">
            <div>
              <div className="text-[11px] font-bold text-primary">{priceLabel}</div>
              <div className="text-lg font-extrabold tabular-nums">
                {unitPrice.toLocaleString("ko-KR")}
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
        ) : (
          <div className="mt-auto text-sm font-semibold text-slate-400">{priceLabel} 미설정</div>
        )}
      </div>
    </div>
  );
}

function OrderForm({
  tier,
  product,
  unitPrice,
  onBack,
  onConfirm,
}: {
  tier: Exclude<BizTier, "NONE">;
  product: Product;
  unitPrice: number;
  onBack: () => void;
  onConfirm: (qty: number) => void;
}) {
  const meta = TIER_META[tier];
  const [qty, setQty] = useState(QTY_MIN);
  const total = unitPrice * qty;

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
            <div className="w-[72px] h-[72px] rounded-xl bg-amber-100/60 grid place-items-center text-amber-600/50 shrink-0">
              <GemIcon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-extrabold">{product.name}</div>
              <div className="text-xs text-caption">{product.spec}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[11px] font-bold text-primary">{meta.priceLabel}</span>
                <span className="text-sm font-extrabold tabular-nums">{won(unitPrice)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              수량 <span className="text-caption font-medium">(최소 {QTY_MIN}개, {QTY_STEP}개 단위)</span>
            </label>
            <div className="flex items-center gap-2.5">
              <button
                aria-label="수량 줄이기"
                onClick={() => setQty((q) => Math.max(QTY_MIN, q - QTY_STEP))}
                disabled={qty <= QTY_MIN}
                className="w-12 h-12 rounded-xl border border-line bg-white grid place-items-center text-body hover:border-primary-light hover:text-primary transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-body"
              >
                <MinusIcon className="w-5 h-5" />
              </button>
              <div className="w-24 h-12 rounded-xl border border-line bg-white grid place-items-center text-base font-extrabold tabular-nums">
                {qty}
              </div>
              <button
                aria-label="수량 늘리기"
                onClick={() => setQty((q) => q + QTY_STEP)}
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
              placeholder="예: 개별 포장, 택배 발송 희망"
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
          </div>
        </section>

        <section className="flex-1 min-w-72 bg-white border-2 border-orange-100 rounded-3xl shadow-lg shadow-primary/5 p-5 md:p-6 flex flex-col gap-3.5">
          <h3 className="text-sm font-extrabold m-0">주문 요약</h3>
          <div className="flex justify-between">
            <span className="text-xs text-caption">단가 ({meta.priceLabel.replace(" 단가", "")})</span>
            <span className="text-sm font-bold tabular-nums">{won(unitPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">수량</span>
            <span className="text-sm font-bold tabular-nums">{qty}개</span>
          </div>
          <div className="border-t border-dashed border-orange-300 pt-3 flex justify-between items-baseline">
            <span className="text-sm font-bold text-body">총 주문 금액</span>
            <span className="text-xl font-extrabold text-primary tabular-nums">{won(total)}</span>
          </div>
          <Button className="h-14 rounded-2xl text-base shadow-primary/25" onClick={() => onConfirm(qty)}>
            주문 확정
          </Button>
          <p className="text-xs leading-relaxed text-caption m-0">
            주문 확정 후 본사 확인을 거쳐 출고됩니다. 결제·정산 조건은 계약 조건을 따릅니다.
          </p>
        </section>
      </div>
    </>
  );
}

function OrderHistory({ orders }: { orders: WholesaleOrder[] }) {
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
    <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
      {orders.map((o) => (
        <div
          key={o.code}
          className="flex items-center gap-4 flex-wrap px-4 md:px-5 py-3.5 border-t border-slate-100 first:border-t-0"
        >
          <div className="w-24 shrink-0">
            <div className="text-sm font-extrabold tabular-nums">{o.code}</div>
            <div className="text-xs text-caption">{o.date}</div>
          </div>
          <div className="flex-[2] min-w-40">
            <div className="text-sm font-bold truncate">{o.title}</div>
            <div className="text-xs text-caption tabular-nums">{o.sub}</div>
          </div>
          <div className="flex-1 min-w-28 text-right text-sm font-extrabold tabular-nums">
            {o.total === null ? "—" : won(o.total)}
          </div>
          <Badge tone={STATUS_TONE[o.status]} className="shrink-0">
            {o.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function OrderComplete({
  tier,
  order,
  onViewHistory,
  onBackToCatalog,
}: {
  tier: Exclude<BizTier, "NONE">;
  order: WholesaleOrder;
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
          <div className="text-sm text-caption mt-2">2026년 7월 10일 (금) 16:40 KST</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">주문번호</span>
            <span className="text-sm font-extrabold text-primary">{order.code}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">상품</span>
            <span className="text-sm font-bold">{order.title}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">수량·단가</span>
            <span className="text-sm font-bold tabular-nums">{order.sub}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">총액 ({meta.priceLabel})</span>
            <span className="text-sm font-extrabold text-primary tabular-nums">
              {order.total === null ? "—" : won(order.total)}
            </span>
          </div>
          <div className="flex justify-between gap-3 items-center">
            <span className="text-xs text-caption">상태</span>
            <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-body m-0">
          본사 확인 후 출고 일정이 확정되면 알림으로 안내드립니다.
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
