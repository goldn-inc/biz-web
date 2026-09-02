/**
 * GP 매장 프로그램 공용 타입·라벨·헬퍼.
 * 백엔드 back_end/src/modules/gp/dto/gp-inventory.dto.ts 와 필드명을 맞춘다
 * (공유 패키지가 없어 도메인별 중복 정의 — 모노레포 관례).
 */

export type GpItemStatus = "IN_STOCK" | "RENTED" | "SOLD" | "ADJUSTED_OUT" | "VOID";
export type GpItemSource = "WHOLESALE" | "DIRECT" | "IMPORT";
export type GpMetalType = "GOLD" | "SILVER";
export type GpCategory =
  | "RING"
  | "NECKLACE"
  | "BRACELET"
  | "EARRING"
  | "PENDANT"
  | "ANKLET"
  | "GOLD_BAR"
  | "MATERIAL"
  | "ETC";

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
  EARRING: "귀걸이",
  PENDANT: "펜던트",
  ANKLET: "발찌",
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

/** TAG가 출처 — 시세연동가가 서면 SPOT, 못 서면 고정가(FIXED), 둘 다 없으면 NONE. */
export type GpTagPriceSource = "SPOT" | "FIXED" | "NONE";

/** 재질(순도) 기준 한 줄 — 해리 설정의 SSOT. */
export type GpMaterialStandard = {
  purityCode: string;
  /** 가격 계수(읽기 전용 상수). */
  pricingFactor: number;
  hallmarkFactor: number;
  applyHallmark: boolean;
  /** 매장이 저장한 값인지 — false 면 코드 기본값을 보고 있는 것. */
  isCustom: boolean;
};

export type GpPurchaseLineKind = "PURCHASE" | "PAYMENT" | "RETURN";

export const GP_PURCHASE_KIND_LABEL: Record<GpPurchaseLineKind, string> = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  RETURN: "반품",
};

/** 요약 한 칸 — 순금중량과 금액을 같이 본다. */
export type GpPurchaseAmount = { pureGram: number; amount: number };

export type GpPurchaseSummary = {
  before: GpPurchaseAmount;
  purchase: GpPurchaseAmount;
  settled: GpPurchaseAmount;
  after: GpPurchaseAmount;
};

export type GpPurchaseLine = {
  id: string;
  lineNo: number;
  kind: GpPurchaseLineKind;
  note: string | null;
  purityCode: string | null;
  purityCoefficient: number | null;
  actualWeightG: number | null;
  hallmarkFactor: number | null;
  pureGram: number | null;
  quantity: number;
  unitPrice: number | null;
  supplyAmount: number;
  taxRate: number | null;
  taxAmount: number;
  totalAmount: number;
  /** 이 라인에서 만들어진 재고 개체 수(0=아직 안 만듦). */
  itemCount: number;
};

export type GpPurchaseRow = {
  id: string;
  purchaseNo: string;
  purchaseDate: string;
  supplierId: string;
  supplierName: string | null;
  materialGroup: string | null;
  defaultHallmark: number | null;
  defaultTaxRate: number | null;
  memo: string | null;
  purchaseAmount: number;
  settledAmount: number;
  createdAt: string;
};

export type GpPurchaseDetail = GpPurchaseRow & {
  lines: GpPurchaseLine[];
  summary: GpPurchaseSummary;
};

export type GpPurchaseOutstanding = {
  supplierId: string;
  supplierName: string | null;
  outstanding: GpPurchaseAmount;
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
  /** 시세연동 TAG가 — 개체 실측 중량 기준. 중량·공임이 없으면 null. */
  linkedTagPrice: number | null;
  /** 화면이 실제로 보여줄 TAG가의 출처. */
  tagPriceSource: GpTagPriceSource;
  /** 계산에 쓰인 해리 — 상품값 ?? 재질기준. */
  effectiveHallmark: number;
  /** 원가 — IMPORT 는 시세로 재계산, 나머지는 매입 시점 스냅샷. */
  spotCost: number | null;
  /** spotCost 가 시세로 재계산된 값인지(화면 구분 표기용). */
  isSpotLinkedCost: boolean;
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
  /** 보유 금속가치 = 순금(순은) 총량 × 시세. 해리·공임·알값이 빠진 "갖고 있는 금속의 값". */
  goldValueKrw: number | null;
  silverValueKrw: number | null;
  metalValueKrw: number | null;
  goldSpotKrwPerGram: number | null;
  silverSpotKrwPerGram: number | null;
  spotAsOf: string | null;
};

export type GpItemListResponse = {
  items: GpItem[];
  groups: GpItemGroup[];
  /** 필터에 걸린 전체 개체 수 — 페이지 크기와 무관. */
  total: number;
  hasMore: boolean;
  summary: GpInventorySummary;
};

// ── 초기 재고 이관(CSV) ────────────────────────────────────────────

export type GpImportRowError = {
  /** CSV 행 번호(헤더=1) — 엑셀 행 번호와 같아서 매장이 바로 찾아간다. */
  line: number;
  column: string;
  message: string;
};

export type GpImportRowPreview = {
  line: number;
  productName: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  weightG: number | null;
  pureGram: number | null;
  acquiredUnitCost: number | null;
  tagPrice: number | null;
  supplierName: string | null;
  externalBarcode: string | null;
};

export type GpImportSummary = {
  newProducts: number;
  newSuppliers: number;
  goldPureGram: number;
  silverPureGram: number;
  unconvertibleCount: number;
  acquiredCostTotal: number;
};

export type GpImportResult = {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: GpImportRowError[];
  preview: GpImportRowPreview[];
  summary: GpImportSummary;
  notices: string[];
  committed: boolean;
  importId: string | null;
  reportUrl: string | null;
};

/** 카다로그 xlsx 이관(골드펜 기본정보) 결과. */
export type GpCatalogImportRowError = {
  line: number;
  column: string;
  message: string;
};

export type GpCatalogImportRowPreview = {
  line: number;
  code: string | null;
  name: string;
  category: string;
  metalType: GpMetalType;
  purityCode: string;
  weightGram: number | null;
  laborFee: number | null;
  mainStoneFee: number | null;
  subStoneFee: number | null;
  supplierName: string | null;
  hasMemo: boolean;
};

export type GpCatalogImportSummary = {
  newProducts: number;
  newSuppliers: number;
  withMemo: number;
  withoutWeight: number;
  byPurity: Record<string, number>;
};

export type GpCatalogImportResult = {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: GpCatalogImportRowError[];
  preview: GpCatalogImportRowPreview[];
  summary: GpCatalogImportSummary;
  notices: string[];
  committed: boolean;
  importId: string | null;
  reportUrl: string | null;
};

export type GpImportHistoryRow = {
  id: string;
  fileName: string;
  totalRows: number;
  createdItems: number;
  createdAt: string;
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
  /** 매장 품번(GD14-0001…). */
  code: string | null;
  /** 상품 단위 해리 덮어쓰기(비면 재질 기준). */
  hallmarkFactor: number | null;
  effectiveHallmark: number;
  linkedTagPrice: number | null;
  tagPriceSource: GpTagPriceSource;
  supplierId: string | null;
  supplierName: string | null;
  mainStoneId: string | null;
  mainStoneName: string | null;
  mainStoneFee: number | null;
  subStoneId: string | null;
  subStoneName: string | null;
  subStoneFee: number | null;
  /** 등록 순서(=노출 순서), 첫 장이 대표 사진. */
  imageKeys: string[];
  imageUrls: string[];
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
  /** 기간 전체 기준 — 목록이 페이지로 잘려도 이 숫자는 흔들리지 않는다. */
  summary: GpSalesPeriodSummary;
  total: number;
  hasMore: boolean;
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
  // 서버 GpItemEventType 과 짝을 맞춘다 — 라벨이 없으면 이력에 영문 코드가 그대로 찍힌다.
  IMPORTED: "이관 등록",
  PURCHASE_REGISTERED: "매입 전표 등록",
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
