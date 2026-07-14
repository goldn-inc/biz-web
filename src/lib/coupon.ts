/**
 * 쿠폰 공용 타입·표시 헬퍼 — coupons 페이지(검증/적용)와 transactions 페이지(상세/완료 미리보기)가 공유.
 * 혜택 방향은 고객 가산: 거래 완료 시 최종가 = 입력 매입가 + 혜택.
 */

export type CouponDiscountType = "FIXED" | "PERCENT";
export type CouponStatus = "ACTIVE" | "APPLIED" | "USED" | "REVOKED";

/** 백엔드 CouponSummaryDto — 발급 고객은 마스킹되어 온다. */
export type ApiCouponSummary = {
  id: string;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxBenefitKrw: number | null;
  minTransactionKrw: number | null;
  storeId: string | null;
  issuedCustomerName: string | null;
  issuedCustomerPhone: string | null;
  validFrom: string;
  validUntil: string;
  status: CouponStatus;
};

export type CouponVerifyReason =
  | "VALID"
  | "NOT_FOUND"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "ALREADY_USED"
  | "ALREADY_APPLIED"
  | "REVOKED"
  | "STORE_MISMATCH"
  | "MIN_AMOUNT_NOT_MET"
  | "TRANSACTION_HAS_COUPON";

/** 실패 사유 표준 문구(스펙 4.2.2) — 백엔드 사유 코드와 1:1. */
export const COUPON_REASON_LABELS: Record<Exclude<CouponVerifyReason, "VALID">, string> = {
  NOT_FOUND: "존재하지 않는 쿠폰 코드입니다",
  NOT_YET_VALID: "아직 사용 기간이 시작되지 않은 쿠폰입니다",
  EXPIRED: "유효기간이 만료된 쿠폰입니다",
  ALREADY_USED: "이미 사용된 쿠폰입니다",
  ALREADY_APPLIED: "다른 거래에 적용 중인 쿠폰입니다",
  REVOKED: "회수(취소)된 쿠폰입니다",
  STORE_MISMATCH: "이 매장에서는 사용할 수 없는 쿠폰입니다",
  MIN_AMOUNT_NOT_MET: "최소 거래금액 조건을 충족하지 않습니다",
  TRANSACTION_HAS_COUPON: "이미 쿠폰이 적용된 거래입니다",
};

export function krwLabel(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

/** 혜택 요약 라벨 — 예: "30,000원 가산", "10% 가산(최대 50,000원)" */
export function couponDiscountLabel(coupon: ApiCouponSummary): string {
  if (coupon.discountType === "FIXED") return `${krwLabel(coupon.discountValue)} 가산`;
  const cap = coupon.maxBenefitKrw != null ? `(최대 ${krwLabel(coupon.maxBenefitKrw)})` : "";
  return `${coupon.discountValue}% 가산${cap}`;
}

/** 조건·기한 보조 라벨 — 예: "정액 · 2026-07-31까지 · 최소 50만원" */
export function couponConditionLabel(coupon: ApiCouponSummary): string {
  const parts: string[] = [coupon.discountType === "FIXED" ? "정액" : "정률"];
  parts.push(`${coupon.validUntil.slice(0, 10)}까지`);
  if (coupon.minTransactionKrw != null) {
    parts.push(`최소 ${krwLabel(coupon.minTransactionKrw)}`);
  }
  return parts.join(" · ");
}

/** 혜택액 계산 — 백엔드 computeBenefit 과 동일 규칙(미리보기 전용, 확정은 서버). */
export function couponBenefitOf(coupon: ApiCouponSummary, baseAmountKrw: number): number {
  if (coupon.discountType === "FIXED") return coupon.discountValue;
  const raw = Math.floor((baseAmountKrw * coupon.discountValue) / 100);
  return coupon.maxBenefitKrw != null ? Math.min(raw, coupon.maxBenefitKrw) : raw;
}

/** 마스킹 전화(010-****-5678)와 원본 전화의 앞3+뒤4 일치 여부 — 발급 고객/거래 고객 매칭 표시용. */
export function maskedPhoneMatches(masked: string | null, raw: string | null): boolean {
  if (!masked || !raw) return false;
  const m = masked.replace(/[^0-9*]/g, "");
  const r = raw.replace(/\D/g, "");
  if (m.length < 7 || r.length < 7) return false;
  return m.slice(0, 3) === r.slice(0, 3) && m.slice(-4) === r.slice(-4);
}
