"use client";

/**
 * 현장 매입 플로우 공용 컴포넌트 — 거래 페이지와 대시보드(원페이지 매입 모달)가 함께 쓴다.
 * RegistrationForm(접수) → DetailPanel(상세·감정 입력·완료/취소) 순서로 조합한다.
 * transactions/page.tsx 에서 추출(2026-07-23) — 마크업·동작은 원본 그대로.
 */

import { useEffect, useState } from "react";
import {
  PlusIcon,
  ShieldIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  ScaleIcon,
  XIcon,
  PhoneIcon,
  MinusIcon,
} from "@/components/icons";
import { AnimatePresence } from "motion/react";
import { Badge, Card, Dialog, Input, SidePanel } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  type ApiCouponSummary,
  couponBenefitOf,
  couponConditionLabel,
  couponDiscountLabel,
} from "@/lib/coupon";

export type TxStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELED";
type IdType = "주민등록증" | "운전면허증" | "여권";
type Metal = "GOLD" | "SILVER";

/** GET /biz/transactions 응답 항목 — 회원 이름은 마스킹, 현장고객은 매장 입력 원본. */
export type ApiTransaction = {
  id: string;
  status: TxStatus;
  customerName: string;
  customerPhone: string | null;
  finalPrice: number | null;
  memo: string | null;
  hasReservation: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiAppraisalLine = {
  lineNo: number;
  metal: string;
  purity: string;
  grossWeightGram: number;
  purityPercent: number;
  netPureGram: number;
  note: string | null;
};

type ApiTransactionDetail = ApiTransaction & {
  walkinCustomerId: string | null;
  userId: string | null;
  reservationId: string | null;
  estimatedPrice: number | null;
  settlementMemo: string | null;
  appraisalLines: ApiAppraisalLine[];
  appliedCoupon: ApiCouponSummary | null;
};

/** GET /biz/transactions/customers/lookup 응답 — 회원은 마스킹·생년월일 미노출. */
type ApiLookup = {
  matchType: "USER" | "WALKIN" | "NONE";
  customer: {
    id: string;
    realName: string | null;
    birthDate: string | null;
    phone: string;
  } | null;
};

export const STATUS_META: Record<TxStatus, { label: string; tone: BadgeTone }> = {
  IN_PROGRESS: { label: "진행중", tone: "amber" },
  COMPLETED: { label: "완료", tone: "green" },
  CANCELED: { label: "취소", tone: "slate" },
};

const ID_TYPES: IdType[] = ["주민등록증", "운전면허증", "여권"];

/** 순도 라벨 프리셋 — 선택 시 순도(%) 기본값 자동 입력(수정 가능, 실측은 XRF). */
const PURITY_PRESETS: Record<Metal, { label: string; percent: number }[]> = {
  GOLD: [
    { label: "24K", percent: 99.9 },
    { label: "22K", percent: 91.6 },
    { label: "18K", percent: 75 },
    { label: "14K", percent: 58.5 },
    { label: "10K", percent: 41.7 },
  ],
  SILVER: [
    { label: "SILVER_999", percent: 99.9 },
    { label: "SILVER_925", percent: 92.5 },
    { label: "SILVER_900", percent: 90 },
  ],
};

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** KST(UTC+9) 오늘 — 서버 kstTodayString 과 동일 규약 */
export function kstToday(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** createdAt(UTC ISO) → KST 라벨: 오늘이면 HH:MM, 아니면 M/D HH:MM */
export function timeLabelOf(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const hhmm = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  if (toDateString(kst) === toDateString(kstToday())) return hhmm;
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${hhmm}`;
}

export function krw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

/** 거래 상세 슬라이드오버 — 진행중이면 감정·완료 입력과 취소, 완료면 감정 행 열람. */
export function DetailPanel({
  token,
  id,
  onClose,
  onChanged,
}: {
  token: string | null;
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detailResult, setDetailResult] = useState<{
    key: string;
    detail?: ApiTransactionDetail;
    error?: string;
  } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${id}:${reloadCount}`;
  const loading = detailResult?.key !== requestKey;
  const detail = !loading ? detailResult?.detail : undefined;
  const loadError = !loading ? (detailResult?.error ?? null) : null;

  const [showComplete, setShowComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await bizApiFetch<ApiTransactionDetail>(`/biz/transactions/${id}`, { token });
        if (!cancelled) setDetailResult({ key: requestKey, detail: res });
      } catch (error) {
        if (!cancelled) {
          setDetailResult({
            key: requestKey,
            error:
              error instanceof BizApiError ? error.message : "거래 정보를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, requestKey, token]);

  async function handleCancelTransaction() {
    setSubmitting(true);
    setActionError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/transactions/${id}/cancel`, {
        method: "POST",
        body: {},
        token,
      });
      setConfirmCancel(false);
      onChanged();
      onClose();
    } catch (error) {
      setConfirmCancel(false);
      setActionError(error instanceof BizApiError ? error.message : "취소하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  /** 완료 전 쿠폰 적용 해제 — 쿠폰은 ACTIVE 로 복귀해 고객이 재사용할 수 있다. */
  async function handleReleaseCoupon() {
    setSubmitting(true);
    setActionError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/transactions/${id}/coupon`, {
        method: "DELETE",
        token,
      });
      setReloadCount((n) => n + 1);
    } catch (error) {
      setActionError(error instanceof BizApiError ? error.message : "쿠폰을 해제하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <SidePanel
      onClose={onClose}
      label="거래 상세"
      className="relative w-full lg:w-[520px] lg:h-full mt-auto lg:mt-0 bg-white lg:border-l border-line rounded-t-3xl lg:rounded-none shadow-2xl overflow-y-auto max-h-[88%] lg:max-h-full flex flex-col"
    >
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <div>
            <div className="text-xs font-semibold text-caption uppercase">{id.slice(0, 8)}</div>
            <h2 className="text-lg font-extrabold m-0">거래 상세</h2>
          </div>
          <button
            aria-label="닫기"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-line grid place-items-center text-body"
          >
            <XIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {loading ? (
            <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
          ) : loadError || !detail ? (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">
                {loadError ?? "거래 정보를 불러오지 못했습니다."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Badge tone={STATUS_META[detail.status].tone} className="px-3.5 py-1.5">
                  {STATUS_META[detail.status].label}
                </Badge>
                <div className="text-xs text-caption">접수 {timeLabelOf(detail.createdAt)} KST</div>
              </div>

              <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl px-[18px] py-4">
                <div className="w-11 h-11 rounded-full bg-orange-50 border border-orange-100 grid place-items-center text-base font-extrabold text-primary shrink-0">
                  {detail.customerName.charAt(0) || "고"}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold">{detail.customerName}</div>
                  <div className="text-xs text-caption tabular-nums">
                    {detail.customerPhone ?? "-"}
                    {detail.userId ? " · 앱 회원" : " · 현장 고객"}
                  </div>
                </div>
                {detail.customerPhone && (
                  <a
                    href={`tel:${detail.customerPhone}`}
                    className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    전화
                  </a>
                )}
              </div>

              <div className="bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-3">
                <DetailRow label="접수 메모" value={detail.memo ?? "-"} />
                {detail.settlementMemo && (
                  <DetailRow label="정산 메모" value={detail.settlementMemo} />
                )}
                <DetailRow label="연결 예약" value={detail.reservationId ? "있음" : "없음"} />
                {detail.estimatedPrice != null && (
                  <DetailRow label="견적(참고)" value={krw(detail.estimatedPrice)} />
                )}
                {detail.finalPrice != null && (
                  <DetailRow label="최종 매입가" value={krw(detail.finalPrice)} strong />
                )}
              </div>

              {detail.appliedCoupon && (
                <div className="bg-white border-2 border-orange-100 rounded-2xl px-[18px] py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{detail.appliedCoupon.name}</div>
                    <div className="text-xs text-caption">
                      {couponDiscountLabel(detail.appliedCoupon)} ·{" "}
                      {couponConditionLabel(detail.appliedCoupon)}
                      {detail.appliedCoupon.status === "USED" ? " · 사용 완료" : " · 적용 중"}
                    </div>
                  </div>
                  {detail.status === "IN_PROGRESS" && detail.appliedCoupon.status === "APPLIED" && (
                    <button
                      disabled={submitting}
                      onClick={() => void handleReleaseCoupon()}
                      className="h-9 px-3.5 rounded-xl bg-white border border-line hover:border-red-200 hover:text-red-600 text-caption text-xs font-semibold shrink-0 disabled:opacity-60"
                    >
                      쿠폰 해제
                    </button>
                  )}
                </div>
              )}

              {detail.appraisalLines.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-sm font-extrabold text-body m-0">감정 내역</h3>
                  <div className="bg-white border border-line rounded-2xl overflow-hidden">
                    {detail.appraisalLines.map((l) => (
                      <div
                        key={l.lineNo}
                        className="flex items-center gap-3 px-[18px] py-3 border-t border-line first:border-t-0"
                      >
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-[11px] font-extrabold grid place-items-center text-caption shrink-0">
                          {l.lineNo}
                        </span>
                        <div className="flex-1 text-sm font-bold">
                          {l.metal === "SILVER" ? "은" : "금"} {l.purity}
                          {l.note ? <span className="text-xs text-caption font-medium"> · {l.note}</span> : null}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold tabular-nums">{l.grossWeightGram}g</div>
                          <div className="text-xs text-caption tabular-nums">
                            {l.purityPercent}% · 순 {l.netPureGram}g
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">{actionError}</p>
                </div>
              )}

              {detail.status === "IN_PROGRESS" &&
                (showComplete ? (
                  <AppraisalForm
                    token={token}
                    id={id}
                    appliedCoupon={
                      detail.appliedCoupon?.status === "APPLIED" ? detail.appliedCoupon : null
                    }
                    submitting={submitting}
                    setSubmitting={setSubmitting}
                    onDone={() => {
                      setShowComplete(false);
                      setReloadCount((n) => n + 1);
                      onChanged();
                    }}
                    onError={setActionError}
                    onCancel={() => setShowComplete(false)}
                  />
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <h3 className="text-sm font-extrabold text-body m-0">거래 처리</h3>
                    <button
                      onClick={() => setShowComplete(true)}
                      className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 transition"
                    >
                      감정 입력 · 거래 완료
                    </button>
                    <button
                      onClick={() => setConfirmCancel(true)}
                      className="h-12 rounded-2xl bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold"
                    >
                      거래 취소
                    </button>
                    <div className="text-xs text-caption leading-relaxed">
                      완료 처리 후에는 감정 내역과 금액을 수정할 수 없습니다(정정은 본사 문의).
                    </div>
                  </div>
                ))}

              {detail.status === "COMPLETED" && (
                <div className="bg-surface border border-line rounded-2xl px-[18px] py-4 text-xs text-caption leading-relaxed">
                  완료된 거래입니다. 내역 정정이 필요하면 본사(관리자)에 요청해주세요.
                </div>
              )}
            </>
          )}
        </div>
    </SidePanel>

    {/* 패널 바깥에 둔다 — 패널은 transform 이 걸리고 overflow-y-auto 라,
        안에 두면 position:fixed 확인창이 뷰포트가 아닌 패널 기준으로 잡히고 잘린다. */}
      <AnimatePresence>
      {confirmCancel && detail && (
        <Dialog
          key="cancel-confirm"
          role="alertdialog"
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 flex flex-col gap-4"
        >
            <div className="w-12 h-12 rounded-2xl grid place-items-center border bg-red-50 border-red-200 text-red-600">
              <AlertTriangleIcon className="w-[22px] h-[22px]" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold m-0">거래를 취소할까요?</h3>
              <p className="text-sm leading-relaxed text-body mt-2 m-0">
                {detail.customerName} 고객의 진행중 거래를 취소합니다. 처리 후에는 되돌릴 수
                없습니다.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold"
              >
                돌아가기
              </button>
              <button
                disabled={submitting}
                onClick={() => void handleCancelTransaction()}
                className="flex-1 h-12 rounded-2xl text-white text-sm font-bold bg-red-600 hover:bg-red-500 disabled:opacity-60"
              >
                거래 취소
              </button>
            </div>
        </Dialog>
      )}
      </AnimatePresence>
    </>
  );
}

type LineDraft = {
  metal: Metal;
  purity: string;
  weightGram: string;
  purityPercent: string;
  note: string;
};

function emptyLine(): LineDraft {
  return { metal: "GOLD", purity: "24K", weightGram: "", purityPercent: "99.9", note: "" };
}

/** 감정 행 + 최종 매입가 입력 → POST /biz/transactions/:id/complete (쿠폰 APPLIED 시 혜택 미리보기 표시) */
function AppraisalForm({
  token,
  id,
  appliedCoupon,
  submitting,
  setSubmitting,
  onDone,
  onError,
  onCancel,
}: {
  token: string | null;
  id: string;
  appliedCoupon: ApiCouponSummary | null;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onDone: () => void;
  onError: (message: string | null) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [finalPrice, setFinalPrice] = useState("");
  const [memo, setMemo] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function applyPreset(index: number, metal: Metal, label: string) {
    const preset = PURITY_PRESETS[metal].find((p) => p.label === label);
    updateLine(index, {
      metal,
      purity: label,
      purityPercent: preset ? String(preset.percent) : "",
    });
  }

  function lineInvalid(l: LineDraft): boolean {
    const w = Number(l.weightGram);
    const p = Number(l.purityPercent);
    return !(w > 0) || !(p > 0 && p <= 100) || l.purity.trim() === "";
  }

  const priceInvalid = !(Number(onlyDigits(finalPrice)) > 0);

  async function handleSubmit() {
    if (lines.some(lineInvalid) || priceInvalid) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    onError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/transactions/${id}/complete`, {
        method: "POST",
        body: {
          lines: lines.map((l) => ({
            metal: l.metal,
            purity: l.purity.trim(),
            weightGram: Number(l.weightGram),
            purityPercent: Number(l.purityPercent),
            ...(l.note.trim() ? { note: l.note.trim() } : {}),
          })),
          finalPrice: Number(onlyDigits(finalPrice)),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
        token,
      });
      onDone();
    } catch (error) {
      onError(error instanceof BizApiError ? error.message : "완료 처리하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 border-2 border-orange-100 rounded-2xl p-4 bg-orange-50/40">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-body m-0 inline-flex items-center gap-2">
          <ScaleIcon className="w-4 h-4 text-primary" />
          감정 입력
        </h3>
        <button onClick={onCancel} className="text-xs font-semibold text-caption hover:text-body">
          접기
        </button>
      </div>

      {lines.map((l, i) => (
        <div key={i} className="bg-white border border-line rounded-2xl p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-caption">품목 {i + 1}</span>
            {lines.length > 1 && (
              <button
                aria-label="행 삭제"
                onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-600 grid place-items-center text-caption"
              >
                <MinusIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["GOLD", "SILVER"] as Metal[]).map((m) => (
              <button
                key={m}
                onClick={() => applyPreset(i, m, PURITY_PRESETS[m][0].label)}
                className={`h-9 px-3.5 rounded-xl text-xs transition ${
                  l.metal === m
                    ? "border-2 border-primary bg-orange-50 text-primary font-bold"
                    : "border border-line bg-white text-body font-semibold"
                }`}
              >
                {m === "GOLD" ? "금" : "은"}
              </button>
            ))}
            <span className="w-px h-9 bg-line mx-1" />
            {PURITY_PRESETS[l.metal].map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(i, l.metal, p.label)}
                className={`h-9 px-3 rounded-xl text-xs transition ${
                  l.purity === p.label
                    ? "border-2 border-primary bg-orange-50 text-primary font-bold"
                    : "border border-line bg-white text-body font-semibold"
                }`}
              >
                {p.label.replace("SILVER_", "")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="중량(g)"
              required
              error={showErrors && !(Number(l.weightGram) > 0)}
              errorText="0보다 큰 중량을 입력해주세요"
            >
              <Input
                inputMode="decimal"
                placeholder="예: 18.75"
                value={l.weightGram}
                error={showErrors && !(Number(l.weightGram) > 0)}
                className="tabular-nums"
                onChange={(e) => updateLine(i, { weightGram: e.target.value })}
              />
            </Field>
            <Field
              label="순도(%)"
              required
              error={
                showErrors &&
                !(Number(l.purityPercent) > 0 && Number(l.purityPercent) <= 100)
              }
              errorText="0~100 사이로 입력해주세요"
            >
              <Input
                inputMode="decimal"
                placeholder="예: 99.9"
                value={l.purityPercent}
                error={
                  showErrors &&
                  !(Number(l.purityPercent) > 0 && Number(l.purityPercent) <= 100)
                }
                className="tabular-nums"
                onChange={(e) => updateLine(i, { purityPercent: e.target.value })}
              />
            </Field>
          </div>
          <Input
            placeholder="행 메모 (예: 목걸이 1점, 유색석 제외)"
            value={l.note}
            onChange={(e) => updateLine(i, { note: e.target.value })}
          />
        </div>
      ))}

      <button
        onClick={() => setLines((prev) => [...prev, emptyLine()])}
        className="h-11 rounded-xl border border-dashed border-slate-300 bg-white hover:border-primary-light hover:text-primary text-caption text-xs font-bold inline-flex items-center justify-center gap-1.5"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        품목 추가
      </button>

      <Field
        label={appliedCoupon ? "매입 금액(원) — 쿠폰 가산 전" : "최종 매입 금액(원)"}
        required
        error={showErrors && priceInvalid}
        errorText="최종 금액을 입력해주세요"
      >
        <Input
          inputMode="numeric"
          placeholder="예: 1500000"
          value={finalPrice}
          error={showErrors && priceInvalid}
          className="tabular-nums"
          onChange={(e) => setFinalPrice(e.target.value)}
        />
      </Field>

      {appliedCoupon && (
        <div className="bg-white border border-orange-100 rounded-2xl px-4 py-3.5 flex flex-col gap-1.5">
          <div className="text-xs font-extrabold text-primary">
            쿠폰 적용 미리보기 — {appliedCoupon.name}
          </div>
          {(() => {
            const base = Number(onlyDigits(finalPrice));
            if (!(base > 0)) {
              return (
                <div className="text-xs text-caption leading-relaxed">
                  매입 금액을 입력하면 쿠폰 가산 후 최종 지급액을 미리 보여드립니다.
                </div>
              );
            }
            if (appliedCoupon.minTransactionKrw != null && base < appliedCoupon.minTransactionKrw) {
              return (
                <div className="text-xs text-red-600 leading-relaxed">
                  최소 거래금액 {krw(appliedCoupon.minTransactionKrw)} 미달 — 이대로 확정하면
                  실패합니다. 쿠폰을 해제하거나 금액을 확인하세요.
                </div>
              );
            }
            const benefit = couponBenefitOf(appliedCoupon, base);
            return (
              <div className="text-sm tabular-nums">
                {krw(base)} <span className="text-caption">+</span>{" "}
                <span className="text-primary font-bold">{krw(benefit)}</span>{" "}
                <span className="text-caption">=</span>{" "}
                <span className="font-extrabold">최종 지급 {krw(base + benefit)}</span>
              </div>
            );
          })()}
        </div>
      )}
      <Input
        placeholder="정산 메모 (선택)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <button
        disabled={submitting}
        onClick={() => void handleSubmit()}
        className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 transition disabled:opacity-60"
      >
        {submitting ? "처리 중..." : "거래 완료 확정"}
      </button>
      <div className="text-xs text-caption leading-relaxed">
        확정 후에는 감정 내역과 금액을 수정할 수 없습니다. 최종 금액은 수동 확정값이며 자동
        계산은 참고용입니다.
      </div>
    </div>
  );
}

type Receipt = { id: string; name: string; phone: string };

/** 현장 매입 등록 — 전화 조회(회원/재방문/신규) → 신원정보 → 접수. */
export function RegistrationForm({
  token,
  reservationId,
  initialPhone,
  cancelLabel = "목록으로",
  onCancel,
  onCreated,
}: {
  token: string | null;
  reservationId: string | null;
  initialPhone: string | null;
  /** 취소 버튼 문구 — 거래 페이지는 "목록으로", 대시보드 모달은 "닫기". */
  cancelLabel?: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [lookupPhone, setLookupPhone] = useState(initialPhone ?? "");
  const [lookup, setLookup] = useState<ApiLookup | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [birth, setBirth] = useState("");
  const [idType, setIdType] = useState<IdType | null>(null);
  const [visualChecked, setVisualChecked] = useState(true);
  const [memo, setMemo] = useState("");

  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const nameError = showErrors && name.trim() === "";
  const phoneError = showErrors && onlyDigits(phone).length < 8;
  const idVerifyError = showErrors && !visualChecked;

  async function handleLookup() {
    const digits = onlyDigits(lookupPhone);
    if (digits.length < 8) {
      setLookupError("전화번호를 8자리 이상 입력해주세요.");
      return;
    }
    setLookupError(null);
    // 새 번호를 조회하는 순간 직전 고객의 신원을 지운다. 남겨 두면 미등록 고객(NONE)이나
    // 조회 실패에서 「새로 입력해주세요」 배너 아래에 앞 고객의 실명·생년월일이 그대로 남아,
    // 특금법 실명확인 기록이 '앞 고객 신원 + 새 고객 전화번호'로 만들어진다.
    setName("");
    setBirth("");
    setIdType(null);
    try {
      const res = await bizApiFetch<ApiLookup>(
        `/biz/transactions/customers/lookup?phone=${encodeURIComponent(digits)}`,
        { token },
      );
      setLookupDone(true);
      setLookup(res);
      setPhone(digits);
      if (res.customer) {
        setName(res.customer.realName ?? "");
        setBirth(res.customer.birthDate ?? "");
      }
    } catch (error) {
      setLookupDone(false);
      setLookup(null);
      setLookupError(
        error instanceof BizApiError ? error.message : "고객 조회에 실패했습니다.",
      );
    }
  }

  async function handleSubmit() {
    // 특금법 실명확인 — 신분증 육안 확인 체크 없이는 접수 불가(백엔드도 동일 게이트).
    if (name.trim() === "" || onlyDigits(phone).length < 8 || !visualChecked) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await bizApiFetch<{ sellRequestId: string }>(`/biz/transactions`, {
        method: "POST",
        body: {
          customer: {
            realName: name.trim(),
            phone: onlyDigits(phone),
            ...(/^\d{4}-\d{2}-\d{2}$/.test(birth.trim()) ? { birthDate: birth.trim() } : {}),
            ...(idType ? { idDocType: idType } : {}),
            idVerified: visualChecked,
          },
          ...(reservationId ? { reservationId } : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
        token,
      });
      setReceipt({ id: res.sellRequestId, name: name.trim(), phone });
    } catch (error) {
      setSubmitError(
        error instanceof BizApiError ? error.message : "접수를 등록하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return <SuccessCard receipt={receipt} onOpenDetail={onCreated} onBackToList={onCancel} />;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">현장 매입 등록</h1>
          <div className="text-sm text-caption mt-1.5">
            고객 신원 확인 후 접수합니다 · KST
            {reservationId ? " · 예약에서 연결됨" : ""}
          </div>
        </div>
        <button
          onClick={onCancel}
          className="h-12 px-5 rounded-2xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold transition"
        >
          {cancelLabel}
        </button>
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <div className="flex-[1.7] min-w-80 flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StepBadge n={1} active />
              <h2 className="text-base font-extrabold m-0">고객 확인</h2>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                전화번호 조회
              </span>
            </div>

            <div className="flex gap-2.5 flex-wrap">
              <input
                type="tel"
                inputMode="tel"
                placeholder="010-0000-0000"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                className="flex-1 min-w-0 h-[52px] px-4 rounded-2xl border border-line bg-white text-sm outline-none focus:border-primary tabular-nums"
              />
              <button
                onClick={() => void handleLookup()}
                className="shrink-0 h-[52px] px-6 rounded-2xl bg-ink hover:bg-body text-white text-sm font-bold transition"
              >
                조회
              </button>
            </div>

            {lookupError && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
                <AlertCircleIcon className="w-3.5 h-3.5" />
                {lookupError}
              </div>
            )}
            {lookupDone && !lookupError && <LookupBanner lookup={lookup} />}
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StepBadge n={2} active />
              <h2 className="text-base font-extrabold m-0">신원정보</h2>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                특금법 실명확인
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <Field label="실명" required error={nameError} errorText="실명을 입력해주세요">
                <Input
                  placeholder="고객 실명"
                  value={name}
                  error={nameError}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field
                label="전화번호"
                required
                error={phoneError}
                errorText="전화번호를 8자리 이상 입력해주세요"
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  error={phoneError}
                  className="tabular-nums"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="생년월일" optional>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={birth}
                  className="tabular-nums"
                  onChange={(e) => setBirth(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-body">
                신분증 종류 <span className="text-caption font-medium">(선택)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {ID_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setIdType(idType === t ? null : t)}
                    className={`h-11 px-[18px] rounded-xl text-sm transition ${
                      idType === t
                        ? "border-2 border-primary bg-orange-50 text-primary font-bold"
                        : "border border-line bg-white hover:border-primary-light text-body font-semibold"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <label
              className={`flex items-start gap-2.5 bg-surface border rounded-2xl px-4 py-3.5 cursor-pointer ${
                idVerifyError ? "border-red-300 bg-red-50/40" : "border-line"
              }`}
            >
              <input
                type="checkbox"
                checked={visualChecked}
                onChange={(e) => setVisualChecked(e.target.checked)}
                className="w-5 h-5 accent-primary mt-0.5"
              />
              <span className="text-sm leading-relaxed text-body">
                <span className="font-bold text-ink">
                  신분증 육안 확인 완료 <span className="text-primary">*</span>
                </span>
                <br />
                실물 신분증과 고객 실명이 일치함을 확인했습니다.{" "}
                <span className="text-caption">
                  주민등록번호 전체와 신분증 사본은 수집하지 않습니다.
                </span>
              </span>
            </label>
            {idVerifyError && (
              <div className="flex items-center gap-1 text-xs font-semibold text-red-600">
                <AlertCircleIcon className="w-3.5 h-3.5" />
                신분증 육안 확인을 완료해야 접수할 수 있습니다.
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <StepBadge n={3} active />
              <h2 className="text-base font-extrabold m-0">메모 · 접수 확인</h2>
            </div>
            <textarea
              rows={3}
              placeholder="접수 메모 (예: 14K 추정 목걸이 1점, 골드바 지참)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
            {submitError && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">{submitError}</p>
              </div>
            )}
            <button
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition disabled:opacity-60"
            >
              {submitting ? "접수 중..." : "접수하기"}
            </button>
          </Card>
        </div>

        <div className="flex-1 min-w-72 flex flex-col gap-4">
          <section className="bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3.5">
            <h3 className="text-sm font-extrabold m-0">다음 단계 안내</h3>
            <StageStep n={1} active title="접수" desc="신원확인 후 접수 — 지금 단계" showLine />
            <StageStep n={2} title="실물 감정" desc="품목·순도·중량 입력 후 금액 확정" showLine />
            <StageStep n={3} title="정산" desc="고객 동의 후 매입 대금 지급" />
          </section>

          <section className="bg-blue-50 border border-blue-200 rounded-3xl p-5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-extrabold text-blue-700 m-0">특금법 안내</h3>
            </div>
            <p className="text-xs leading-relaxed text-blue-800 m-0">
              특정금융거래법에 따라 귀금속 매입 시 고객 실명확인이 필요합니다. 실명·전화번호만
              필수이며,{" "}
              <strong>주민등록번호 전체와 신분증 사본 이미지는 수집·저장하지 않습니다.</strong>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function LookupBanner({ lookup }: { lookup: ApiLookup | null }) {
  if (!lookup || lookup.matchType === "NONE" || !lookup.customer) {
    return (
      <div className="flex items-center gap-3 bg-surface border border-dashed border-slate-300 rounded-2xl px-4 py-3.5">
        <Badge tone="slate" className="shrink-0">
          신규 고객
        </Badge>
        <div className="text-sm text-body leading-relaxed">
          조회 결과가 없습니다. 아래 신원정보를 새로 입력해주세요.
        </div>
      </div>
    );
  }

  const name = lookup.customer.realName ?? "고객";

  if (lookup.matchType === "USER") {
    return (
      <div className="flex items-center gap-3.5 bg-orange-50 border-2 border-orange-100 rounded-2xl px-4 py-3.5 flex-wrap">
        <div className="w-10 h-10 rounded-full bg-white border border-orange-100 grid place-items-center text-sm font-extrabold text-primary shrink-0">
          {name.charAt(0)}
        </div>
        <div className="flex-1 min-w-36">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold">{name}</span>
            <span className="text-[11px] font-bold text-white bg-primary rounded-full px-2.5 py-0.5">
              회원 연결
            </span>
          </div>
          <div className="text-xs text-caption mt-0.5">
            금은마켓 앱 회원 · 거래는 회원 명의로 기록됩니다 · 실명은 신분증으로 확인해주세요
          </div>
        </div>
        <CheckCircleIcon className="w-5 h-5 shrink-0 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3.5 bg-violet-50 border-2 border-violet-200 rounded-2xl px-4 py-3.5 flex-wrap">
      <div className="w-10 h-10 rounded-full bg-white border border-violet-200 grid place-items-center text-sm font-extrabold text-violet-600 shrink-0">
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-36">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold">{name}</span>
          <span className="text-[11px] font-bold text-white bg-violet-600 rounded-full px-2.5 py-0.5">
            재방문
          </span>
        </div>
        <div className="text-xs text-caption mt-0.5">
          과거 현장거래 고객 · 기존 신원정보가 자동 입력되었습니다
        </div>
      </div>
    </div>
  );
}

function SuccessCard({
  receipt,
  onOpenDetail,
  onBackToList,
}: {
  receipt: Receipt;
  onOpenDetail: (id: string) => void;
  onBackToList: () => void;
}) {
  return (
    <div className="grid place-items-center py-4">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-11 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-green-50 border-2 border-green-200 grid place-items-center">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">접수가 완료되었습니다</h2>
          <div className="text-sm text-caption mt-2">거래가 진행중 상태로 등록되었습니다</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between">
            <span className="text-xs text-caption">접수번호</span>
            <span className="text-sm font-extrabold text-primary tabular-nums uppercase">
              {receipt.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">고객</span>
            <span className="text-sm font-bold">
              {receipt.name} · {receipt.phone}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">다음 단계</span>
            <span className="text-sm font-bold">실물 감정 · 금액 확정</span>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={() => onOpenDetail(receipt.id)}
            className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition"
          >
            감정 입력으로 이동
          </button>
          <button
            onClick={onBackToList}
            className="h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold transition"
          >
            목록으로 돌아가기
          </button>
        </div>
        <div className="text-xs text-caption leading-relaxed">
          품목·중량·매입 금액은 감정 단계에서 확정됩니다.
        </div>
      </div>
    </div>
  );
}

function StepBadge({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={`w-6 h-6 rounded-full text-xs font-extrabold grid place-items-center shrink-0 ${
        active ? "bg-primary text-white" : "bg-slate-100 border border-line text-caption"
      }`}
    >
      {n}
    </span>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  errorText,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: boolean;
  errorText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-body">
        {label} {required && <span className="text-primary">*</span>}
        {optional && <span className="text-caption font-medium">(선택)</span>}
      </label>
      {children}
      {error && errorText && (
        <div className="flex items-center gap-1 text-xs font-semibold text-red-600">
          <AlertCircleIcon className="w-3.5 h-3.5" />
          {errorText}
        </div>
      )}
    </div>
  );
}

function StageStep({
  n,
  title,
  desc,
  active,
  showLine,
}: {
  n: number;
  title: string;
  desc: string;
  active?: boolean;
  showLine?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${n > 1 ? "-mt-3.5" : ""}`}>
      <div className="flex flex-col items-center shrink-0">
        <span
          className={`w-6 h-6 rounded-full text-[11px] font-extrabold grid place-items-center ${
            active ? "bg-primary text-white" : "bg-slate-100 border border-line text-caption"
          }`}
        >
          {n}
        </span>
        {showLine && <span className="w-0.5 flex-1 min-h-5 bg-line" />}
      </div>
      <div className="pb-4">
        <div className={`text-sm font-bold ${active ? "" : "text-body"}`}>{title}</div>
        <div className="text-xs text-caption leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-caption">{label}</span>
      <span className={`text-sm text-right ${strong ? "font-extrabold text-primary" : "font-bold"}`}>
        {value}
      </span>
    </div>
  );
}
