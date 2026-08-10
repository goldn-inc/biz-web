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
