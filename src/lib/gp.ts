/**
 * GP 매장 프로그램 공용 타입·라벨·헬퍼.
 * 백엔드 back_end/src/modules/gp/dto/gp-inventory.dto.ts 와 필드명을 맞춘다
 * (공유 패키지가 없어 도메인별 중복 정의 — 모노레포 관례).
 */

export type GpItemStatus = "IN_STOCK" | "RENTED" | "SOLD" | "ADJUSTED_OUT" | "VOID";
export type GpItemSource = "WHOLESALE" | "DIRECT" | "IMPORT";
export type GpMetalType = "GOLD" | "SILVER";
export type GpCategory = "RING" | "NECKLACE" | "BRACELET" | "GOLD_BAR" | "MATERIAL" | "ETC";

export const GP_STATUS_LABEL: Record<GpItemStatus, string> = {
  IN_STOCK: "재고",
  RENTED: "대여중",
  SOLD: "판매됨",
  ADJUSTED_OUT: "조정출고",
  VOID: "무효",
};

export const GP_SOURCE_LABEL: Record<GpItemSource, string> = {
  WHOLESALE: "도매입고",
  DIRECT: "직접등록",
  IMPORT: "이관",
};

export const GP_CATEGORY_LABEL: Record<GpCategory, string> = {
  RING: "반지",
  NECKLACE: "목걸이",
  BRACELET: "팔찌",
  GOLD_BAR: "골드바",
  MATERIAL: "자재",
  ETC: "기타",
};

export const GP_METAL_LABEL: Record<GpMetalType, string> = {
  GOLD: "금",
  SILVER: "은",
};

export const GP_PURITY_CODES = [
  "24K",
  "22K",
  "18K",
  "14K",
  "10K",
  "999",
  "925",
  "900",
  "UNKNOWN",
] as const;

/** 재질별 선택 가능한 순도(백엔드 assertMetalPurity 와 동일 조합). */
export const GP_PURITIES_BY_METAL: Record<GpMetalType, string[]> = {
  GOLD: ["24K", "22K", "18K", "14K", "10K", "UNKNOWN"],
  SILVER: ["999", "925", "900", "UNKNOWN"],
};

export type GpItem = {
  id: string;
  serial: string;
  externalBarcode: string | null;
  productName: string;
  gpProductId: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  weightG: number | null;
  pureGram: number | null;
  acquiredUnitCost: number | null;
  acquiredLaborFee: number | null;
  /** 모델의 소비자가(TAG가, §8.4) — 판매가 프리필. */
  tagPrice: number | null;
  /** 매입구분(§9.3) — 사입/고금매입. NULL=구분 없음(도매 유래·과거). */
  acquireType: GpAcquireType | null;
  /** 모델 파생 스톤명(§9.1). */
  mainStoneName: string | null;
  subStoneName: string | null;
  supplierName: string | null;
  source: GpItemSource;
  status: GpItemStatus;
  receivedAt: string | null;
  soldAt: string | null;
};

export type GpItemGroup = {
  gpProductId: string;
  productName: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  count: number;
  weightSum: number;
  pureGramSum: number;
};

export type GpInventorySummary = {
  inStockCount: number;
  rentedCount: number;
  soldThisMonthCount: number;
  goldPureGramSum: number;
  silverPureGramSum: number;
  unconvertibleCount: number;
};

export type GpItemListResponse = {
  items: GpItem[];
  groups: GpItemGroup[];
  summary: GpInventorySummary;
};

export type GpItemEvent = {
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type GpItemDetail = GpItem & { events: GpItemEvent[] };

export type GpProductLite = {
  id: string;
  name: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  defaultWeightGram: number | null;
};

export type GpSupplier = {
  id: string;
  name: string;
  type: "PURCHASE" | "REFERRER" | "ETC";
};

// ── 3차(§9) — 스톤·통계·고금 매입 ─────────────────────────────────

export type GpAcquireType = "NEW" | "USED_BUY";

export const GP_ACQUIRE_LABEL: Record<GpAcquireType, string> = {
  NEW: "사입",
  USED_BUY: "고금매입",
};

/** 스톤 사전 행(§9.1) — 골드펜 스톤관리 대응. */
export type GpStoneRow = {
  id: string;
  name: string;
  memo: string | null;
  isActive: boolean;
  productCount: number;
};

/** 기간×차원 판매 집계 행(§9.2) — 반품 제외, COMPLETED 만. */
export type GpStatsSalesRow = {
  key: string;
  lineCount: number;
  pureGramSum: number;
  salesTotal: number;
  costTotal: number;
  marginTotal: number;
};

export type GpStatsSalesResponse = {
  saleCount: number;
  salesTotal: number;
  costTotal: number;
  marginTotal: number;
  purchaseTotal: number;
  rows: GpStatsSalesRow[];
};

export type GpStatsStaleItem = {
  serial: string;
  productName: string;
  metalType: GpMetalType;
  purityCode: string;
  weightG: number | null;
  pureGram: number | null;
  acquiredCost: number | null;
  receivedAt: string | null;
  daysInStock: number;
};

export type GpStatsStaleResponse = {
  days: number;
  items: GpStatsStaleItem[];
  subtotals: {
    metalType: GpMetalType;
    purityCode: string;
    count: number;
    pureGramSum: number;
    costSum: number;
  }[];
};

// ── 2차(§8) — 카다로그·거래처·판매 내역·반품·재고조사 통계 ─────────────

export type GpSupplierType = "PURCHASE" | "REFERRER" | "ETC";

export const GP_SUPPLIER_TYPE_LABEL: Record<GpSupplierType, string> = {
  PURCHASE: "매입처",
  REFERRER: "소개처",
  ETC: "기타",
};

/** 거래처 전체 행(§8.6) — 골드펜 등록 폼에서 추린 실무 필드. */
export type GpSupplierRow = {
  id: string;
  name: string;
  type: GpSupplierType;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  businessName: string | null;
  businessNo: string | null;
  ceoName: string | null;
  managerName: string | null;
  managerPhone: string | null;
  hallmarkFactor: number | null;
  orderLeadDays: number | null;
  memo: string | null;
  isActive: boolean;
};

/** 카다로그 목록 행(§8.4) — 카드 그리드의 축. */
export type GpCatalogProduct = {
  id: string;
  name: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  defaultWeightGram: number | null;
  defaultLaborFeeKrw: number | null;
  defaultTagPrice: number | null;
  supplierId: string | null;
  supplierName: string | null;
  mainStoneId: string | null;
  mainStoneName: string | null;
  mainStoneFee: number | null;
  subStoneId: string | null;
  subStoneName: string | null;
  subStoneFee: number | null;
  imageKey: string | null;
  imageUrl: string | null;
  memo: string | null;
  isActive: boolean;
  inStockCount: number;
};

export type GpCatalogProductDetail = GpCatalogProduct & {
  rentedCount: number;
  soldCount: number;
  totalItemCount: number;
  createdAt: string;
};

export type GpSaleLine = {
  id: string;
  gpItemId: string | null;
  serial: string | null;
  name: string;
  pureGram: number | null;
  salePrice: number;
  metalType: GpMetalType | null;
  purityCode: string | null;
  weightG: number | null;
  acquiredCost: number | null;
  returned: boolean;
};

export type GpSaleReturn = {
  id: string;
  returnedAt: string;
  refundCash: number;
  refundTransfer: number;
  refundCard: number;
  memo: string | null;
};

export type GpSale = {
  id: string;
  saleNo: number;
  soldAt: string;
  status: "COMPLETED" | "CANCELED";
  totalAmount: number;
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  buyerMemo: string | null;
  memo: string | null;
  lines: GpSaleLine[];
  returns: GpSaleReturn[];
};

/** 기간 합계(§8.2) — COMPLETED 기준, 반품 라인 제외, 결제 합은 환불 차감 후. */
export type GpSalesPeriodSummary = {
  count: number;
  lineCount: number;
  salesTotal: number;
  cashTotal: number;
  transferTotal: number;
  cardTotal: number;
  costTotal: number;
  marginTotal: number;
};

export type GpSaleListResponse = {
  sales: GpSale[];
  summary: GpSalesPeriodSummary;
};

/** 재질(순도)별 통계 한 줄 — 골드펜 재고조사 통계 2표 대응(§8.0 #4). */
export type GpStocktakeMaterialStat = {
  metalType: GpMetalType;
  purityCode: string;
  count: number;
  weightSum: number;
  pureGramSum: number;
  costSum: number;
};

export const GP_EVENT_LABEL: Record<string, string> = {
  RECEIVED: "도매 입고",
  DIRECT_REGISTERED: "직접등록",
  SOLD: "판매",
  SALE_CANCELED: "판매취소",
  RENTED: "대여",
  RENT_RETURNED: "대여반납",
  ADJUSTED_OUT: "조정출고",
  READJUSTED_IN: "재발견 입고",
  VOIDED: "무효처리",
  UPDATED: "정보 수정",
  LABEL_QUEUED: "라벨 인쇄",
};

export const GP_CASH_TYPE_LABEL: Record<string, string> = {
  OPENING: "개시",
  SALE: "판매",
  SALE_CANCEL: "판매취소",
  MANUAL_IN: "수동입금",
  MANUAL_OUT: "수동출금",
  ADJUSTMENT: "조정",
};

export const GP_METAL_TYPE_ENTRY_LABEL: Record<string, string> = {
  OPENING: "개시",
  RECEIVE_WHOLESALE: "도매입고",
  RECEIVE_DIRECT: "직접입고",
  SALE_OUT: "판매출고",
  SALE_CANCEL_IN: "판매취소",
  STOCKTAKE_ADJUST: "재고조사 조정",
  MANUAL: "수동",
};

export function krw(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function gram(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("ko-KR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function kstDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function kstDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
