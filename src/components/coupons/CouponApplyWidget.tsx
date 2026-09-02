"use client";

/**
 * 쿠폰 조회·검증·거래 적용 위젯 — 쿠폰 페이지와 대시보드(모달)가 함께 쓴다.
 * coupons/page.tsx 에서 추출(2026-07-23) — 마크업·동작은 원본 그대로.
 * 최근 적용 이력 섹션은 페이지 전용이라 포함하지 않는다.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CouponTagIcon,
  QrIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
} from "@/components/icons";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  type ApiCouponSummary,
  type CouponVerifyReason,
  COUPON_REASON_LABELS,
  couponConditionLabel,
  couponDiscountLabel,
  krwLabel,
  maskedPhoneMatches,
} from "@/lib/coupon";

/** POST /biz/coupons/verify 응답 */
type ApiVerifyResult = {
  result: CouponVerifyReason;
  coupon: ApiCouponSummary | null;
  usedInfo?: { usedAt: string; storeName: string | null; sellRequestId: string | null } | null;
};

/** GET /biz/transactions 응답 항목 중 쿠폰 적용에 필요한 필드만 */
type ApiOpenTransaction = {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  customerName: string;
  customerPhone: string | null;
  memo: string | null;
  createdAt: string;
};

type ViewState = "idle" | "loading" | "result" | "applied";

type AppliedReceipt = {
  couponName: string;
  discountLabel: string;
  trxLabel: string;
};

/** KST 기준 헤더 라벨 — 예: 2026년 7월 13일 (월) */
function kstDateLabel(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${weekdays[kst.getUTCDay()]})`;
}

/** UTC ISO → KST M/D HH:MM */
function kstTimeLabel(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 3600_000);
  const hhmm = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${hhmm}`;
}

/** 최근 7일 범위 — 진행중 거래 조회용(YYYY-MM-DD) */
function weekRange(): { from: string; to: string } {
  const kstNow = Date.now() + 9 * 3600_000;
  const to = new Date(kstNow).toISOString().slice(0, 10);
  const from = new Date(kstNow - 6 * 86400_000).toISOString().slice(0, 10);
  return { from, to };
}

/**
 * 쿠폰 코드 조회 폼 + 검증 결과 카드(유효/사용됨/실패) + 거래 적용 + 적용 완료 카드.
 * onApplied 는 적용 성공 시 호출 — 호스트가 이력/대시보드 숫자를 갱신하는 데 쓴다.
 */
export function CouponApplyWidget({
  token,
  onApplied,
}: {
  token: string | null;
  onApplied?: () => void;
}) {
  const [code, setCode] = useState("");
  const [view, setView] = useState<ViewState>("idle");
  const [verify, setVerify] = useState<ApiVerifyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<AppliedReceipt | null>(null);

  const [openTxs, setOpenTxs] = useState<ApiOpenTransaction[] | null>(null);
  /** 진행중 거래 목록 조회 실패 — 쿠폰 검증 결과와 별개다. */
  const [txLoadError, setTxLoadError] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  /** 쿠폰 검증 자체가 실패한 경우의 문구. 사유 코드를 지어내지 않는다. */
  const [lookupError, setLookupError] = useState<string | null>(null);

  /** 진행중 거래 목록만 따로 불러온다 — 이 조회의 실패가 쿠폰 검증 결과를 덮으면 안 된다. */
  const loadOpenTransactions = useCallback(async () => {
    setOpenTxs(null);
    setTxLoadError(false);
    try {
      const { from, to } = weekRange();
      const list = await bizApiFetch<{ transactions: ApiOpenTransaction[] }>(
        `/biz/transactions?from=${from}&to=${to}&status=IN_PROGRESS`,
        { token },
      );
      setOpenTxs(list.transactions);
      setSelectedTxId(list.transactions[0]?.id ?? null);
    } catch {
      setTxLoadError(true);
    }
  }, [token]);

  async function lookup(rawCode: string) {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) return;
    setView("loading");
    setApplyError(null);
    setLookupError(null);
    setOpenTxs(null);
    setTxLoadError(false);
    setSelectedTxId(null);
    try {
      const res = await bizApiFetch<ApiVerifyResult>("/biz/coupons/verify", {
        method: "POST",
        body: { code: normalized },
        token,
      });
      setVerify(res);
      setView("result");
      if (res.result === "VALID") {
        // 거래 목록은 검증 try 밖에서 자체 처리한다 — 여기서 던지면 서버가 준 VALID 를
        // NOT_FOUND(「존재하지 않는 쿠폰 코드입니다」)로 덮어써 멀쩡한 쿠폰을 가짜라고 말한다.
        await loadOpenTransactions();
      }
    } catch (error) {
      // 검증이 실패한 것이지 쿠폰이 없다고 밝혀진 게 아니다 — 사유 코드를 지어내지 않는다.
      setVerify(null);
      setLookupError(
        error instanceof BizApiError ? error.message : "쿠폰을 조회하지 못했습니다.",
      );
      setView("result");
    }
  }

  async function applyToTransaction() {
    if (!verify?.coupon || verify.result !== "VALID" || !selectedTxId) return;
    const coupon = verify.coupon;
    const tx = openTxs?.find((t) => t.id === selectedTxId);
    setApplying(true);
    setApplyError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/transactions/${selectedTxId}/coupon`, {
        method: "POST",
        body: { code: coupon.code },
        token,
      });
      setReceipt({
        couponName: coupon.name,
        discountLabel: couponDiscountLabel(coupon),
        trxLabel: tx ? `${tx.id.slice(0, 8)} · ${tx.customerName}` : selectedTxId.slice(0, 8),
      });
      setView("applied");
      onApplied?.();
    } catch (error) {
      setApplyError(
        error instanceof BizApiError ? error.message : "쿠폰을 적용하지 못했습니다.",
      );
    } finally {
      setApplying(false);
    }
  }

  function resetLookup() {
    setCode("");
    setVerify(null);
    setReceipt(null);
    setApplyError(null);
    setOpenTxs(null);
    setSelectedTxId(null);
    setView("idle");
  }

  if (view === "applied" && receipt) {
    return <AppliedCard receipt={receipt} onReset={resetLookup} />;
  }

  return (
    <>
      <section className="bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-3.5">
        <h2 className="text-base font-extrabold m-0">쿠폰 조회</h2>
        <form
          className="flex gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(code);
          }}
        >
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="쿠폰 코드 입력 (예: GS-XXXX-XXXX)"
            className="flex-1 min-w-0 h-[52px] px-4 rounded-2xl border border-line bg-white text-sm outline-none focus:border-primary tracking-wider"
          />
          <button
            type="submit"
            className="shrink-0 h-[52px] px-6 rounded-2xl bg-ink hover:bg-body text-white text-sm font-bold disabled:opacity-50"
            disabled={view === "loading" || code.trim().length === 0}
          >
            조회
          </button>
        </form>
        <div className="flex items-center gap-3">
          <span className="flex-1 h-px bg-line" />
          <span className="text-xs font-semibold text-caption">또는</span>
          <span className="flex-1 h-px bg-line" />
        </div>
        <div className="h-[52px] rounded-2xl border-2 border-dashed border-slate-300 bg-surface text-caption text-sm font-semibold inline-flex items-center justify-center gap-2.5">
          <QrIcon className="w-5 h-5" />
          QR 스캔은 준비 중 — 코드를 직접 입력해주세요
        </div>
      </section>

      {view === "loading" && (
        <div className="w-full max-w-xl bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3">
          <div className="h-[52px] rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      )}

      {view === "result" && verify && verify.result === "VALID" && verify.coupon && (
        <ValidCard
          coupon={verify.coupon}
          transactions={openTxs}
          transactionsError={txLoadError}
          onRetryTransactions={() => void loadOpenTransactions()}
          selectedTxId={selectedTxId}
          onSelectTx={setSelectedTxId}
          onApply={() => void applyToTransaction()}
          applying={applying}
          applyError={applyError}
        />
      )}

      {view === "result" && verify && verify.result === "ALREADY_USED" && verify.coupon && (
        <UsedCard coupon={verify.coupon} usedInfo={verify.usedInfo ?? null} />
      )}

      {view === "result" && lookupError && (
        <div className="w-full max-w-xl bg-white border-2 border-red-100 rounded-3xl shadow-sm p-5 flex flex-col items-start gap-2">
          <p className="text-sm font-extrabold text-red-600">쿠폰을 조회하지 못했습니다</p>
          <p className="text-xs text-caption">{lookupError}</p>
          <button
            type="button"
            onClick={() => void lookup(code)}
            className="h-8 px-3 rounded-md border border-line bg-white text-xs font-bold"
          >
            다시 시도
          </button>
        </div>
      )}

      {view === "result" &&
        verify &&
        verify.result !== "VALID" &&
        verify.result !== "ALREADY_USED" && (
          <FailureCard
            code={code}
            reason={verify.result}
            coupon={verify.coupon}
            fallbackMessage={applyError}
          />
        )}
    </>
  );
}

function ValidCard({
  coupon,
  transactions,
  transactionsError,
  onRetryTransactions,
  selectedTxId,
  onSelectTx,
  onApply,
  applying,
  applyError,
}: {
  coupon: ApiCouponSummary;
  transactions: ApiOpenTransaction[] | null;
  /** 진행중 거래 목록 조회 실패 — 「진행중인 거래가 없습니다」와 구분해서 그린다. */
  transactionsError: boolean;
  onRetryTransactions: () => void;
  selectedTxId: string | null;
  onSelectTx: (id: string) => void;
  onApply: () => void;
  applying: boolean;
  applyError: string | null;
}) {
  return (
    <div className="max-w-xl bg-white border-2 border-orange-100 rounded-3xl shadow-lg shadow-primary/5 overflow-hidden">
      <div className="flex items-center gap-2.5 bg-orange-50 px-5 py-3 border-b border-dashed border-orange-300">
        <CheckCircleIcon className="w-[18px] h-[18px] text-primary" />
        <span className="text-sm font-extrabold text-primary">유효한 쿠폰입니다</span>
        <span className="ml-auto text-xs text-orange-900/60 tabular-nums">{coupon.code}</span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-primary grid place-items-center text-white shrink-0 shadow-lg shadow-primary/30">
            <CouponTagIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-44">
            <div className="text-base font-extrabold">{coupon.name}</div>
            <div className="text-xs text-caption">
              발급 고객 {coupon.issuedCustomerName ?? "-"} · {coupon.issuedCustomerPhone ?? "-"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold text-primary">
              {couponDiscountLabel(coupon)}
            </div>
            <div className="text-xs text-caption">{couponConditionLabel(coupon)}</div>
          </div>
        </div>
        <div className="text-xs text-caption leading-relaxed bg-surface border border-line rounded-xl px-3.5 py-2.5">
          고객 혜택 가산 방식입니다 — 거래 완료 시 최종 지급액 = 매입 금액 + 쿠폰 혜택.
          {coupon.minTransactionKrw != null &&
            ` 최소 거래금액 ${krwLabel(coupon.minTransactionKrw)} 조건은 완료 시점에 검증됩니다.`}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-extrabold text-body">적용할 거래 선택 (진행중 · 최근 7일)</div>
          {transactionsError ? (
            <div className="flex flex-col items-start gap-2 bg-surface border border-line rounded-2xl px-4 py-3.5">
              <span className="text-sm font-semibold text-red-600">
                진행중 거래 목록을 불러오지 못했습니다.
              </span>
              <button
                type="button"
                onClick={onRetryTransactions}
                className="h-8 px-3 rounded-md border border-line bg-white text-xs font-bold"
              >
                다시 시도
              </button>
            </div>
          ) : transactions === null ? (
            <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
          ) : transactions.length === 0 ? (
            <div className="text-sm text-caption bg-surface border border-line rounded-2xl px-4 py-3.5 leading-relaxed">
              진행중인 거래가 없습니다. 거래 처리 화면에서 거래를 먼저 접수해주세요.
            </div>
          ) : (
            transactions.map((tx) => {
              const selected = tx.id === selectedTxId;
              const issuedMatch = maskedPhoneMatches(coupon.issuedCustomerPhone, tx.customerPhone);
              return (
                <label
                  key={tx.id}
                  className={`flex items-center gap-3 border-2 rounded-2xl px-4 py-3 cursor-pointer ${
                    selected ? "border-primary bg-orange-50" : "border-line bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="tx"
                    checked={selected}
                    onChange={() => onSelectTx(tx.id)}
                    className="w-[18px] h-[18px] accent-primary"
                  />
                  <div className="flex-1">
                    <div className={`text-sm font-bold ${selected ? "" : "text-body"}`}>
                      {tx.id.slice(0, 8)} · {tx.customerName}
                    </div>
                    <div className="text-xs text-caption">
                      {kstTimeLabel(tx.createdAt)}
                      {tx.memo ? ` · ${tx.memo}` : ""}
                    </div>
                  </div>
                  {issuedMatch && (
                    <span className="text-[11px] font-bold text-primary bg-white border border-orange-100 rounded-full px-2.5 py-0.5 shrink-0">
                      발급 고객 일치
                    </span>
                  )}
                </label>
              );
            })
          )}
        </div>
        {applyError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {applyError}
          </div>
        )}
        <button
          type="button"
          onClick={onApply}
          disabled={applying || !selectedTxId}
          className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 disabled:opacity-50"
        >
          {applying ? "적용 중..." : "거래에 적용"}
        </button>
      </div>
    </div>
  );
}

function UsedCard({
  coupon,
  usedInfo,
}: {
  coupon: ApiCouponSummary;
  usedInfo: { usedAt: string; storeName: string | null; sellRequestId: string | null } | null;
}) {
  return (
    <div className="max-w-xl bg-white border-2 border-red-200 rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-red-50 px-5 py-3 border-b border-dashed border-red-300">
        <XCircleIcon className="w-[18px] h-[18px] text-red-600" />
        <span className="text-sm font-extrabold text-red-600">이미 사용된 쿠폰입니다</span>
        <span className="ml-auto text-xs text-red-700 tabular-nums">{coupon.code}</span>
      </div>
      <div className="p-5 flex flex-col gap-3.5">
        <div className="flex gap-4 items-center flex-wrap opacity-75">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-line grid place-items-center text-caption shrink-0">
            <CouponTagIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-44">
            <div className="text-base font-extrabold line-through text-caption">{coupon.name}</div>
            <div className="text-xs text-caption">
              발급 고객 {coupon.issuedCustomerName ?? "-"} · {coupon.issuedCustomerPhone ?? "-"}
            </div>
          </div>
        </div>
        {usedInfo && (
          <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-xs text-caption">사용 일시</span>
              <span className="text-sm font-bold">
                {usedInfo.usedAt ? `${kstTimeLabel(usedInfo.usedAt)} KST` : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-caption">사용 매장</span>
              <span className="text-sm font-bold">{usedInfo.storeName ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-caption">적용 거래</span>
              <span className="text-sm font-bold tabular-nums">
                {usedInfo.sellRequestId ? usedInfo.sellRequestId.slice(0, 8) : "-"}
              </span>
            </div>
          </div>
        )}
        <div className="text-sm text-red-700 leading-relaxed">
          사용 완료된 쿠폰은 재사용할 수 없습니다. 고객에게 사용 이력을 안내해주세요.
        </div>
      </div>
    </div>
  );
}

function FailureCard({
  code,
  reason,
  coupon,
  fallbackMessage,
}: {
  code: string;
  reason: Exclude<CouponVerifyReason, "VALID">;
  coupon: ApiCouponSummary | null;
  fallbackMessage: string | null;
}) {
  const label = COUPON_REASON_LABELS[reason] ?? fallbackMessage ?? "적용할 수 없는 쿠폰입니다";
  return (
    <div className="max-w-xl bg-white border-2 border-amber-200 rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-amber-50 px-5 py-3 border-b border-dashed border-amber-300">
        <AlertTriangleIcon className="w-[18px] h-[18px] text-amber-700" />
        <span className="text-sm font-extrabold text-amber-700">적용할 수 없는 쿠폰입니다</span>
        <span className="ml-auto text-xs text-amber-800 tabular-nums">
          {code.trim().toUpperCase()}
        </span>
      </div>
      <div className="p-5 flex flex-col gap-3.5">
        {coupon && (
          <div className="flex gap-4 items-center flex-wrap opacity-75">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-line grid place-items-center text-caption shrink-0">
              <CouponTagIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-44">
              <div className="text-base font-extrabold text-caption">{coupon.name}</div>
              <div className="text-xs text-caption">
                {couponDiscountLabel(coupon)} · {couponConditionLabel(coupon)} · 발급 고객{" "}
                {coupon.issuedCustomerName ?? "-"}
              </div>
            </div>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-white bg-amber-700 rounded-full px-2.5 py-0.5">
              사유
            </span>
            <span className="text-sm font-bold text-amber-800">{label}</span>
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">
            코드를 다시 확인하거나 고객에게 쿠폰 상태를 안내해주세요.
          </div>
        </div>
      </div>
    </div>
  );
}

function AppliedCard({ receipt, onReset }: { receipt: AppliedReceipt; onReset: () => void }) {
  return (
    <div className="w-full grid place-items-center">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-10 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-green-50 border-2 border-green-200 grid place-items-center">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">쿠폰이 적용되었습니다</h2>
          <div className="text-sm text-caption mt-2">{kstDateLabel()} KST</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">쿠폰</span>
            <span className="text-sm font-bold">{receipt.couponName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">혜택</span>
            <span className="text-sm font-extrabold text-primary">{receipt.discountLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">적용 거래</span>
            <span className="text-sm font-bold tabular-nums">{receipt.trxLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">반영 시점</span>
            <span className="text-sm font-bold">거래 완료 시 지급액에 가산</span>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <Link
            href="/transactions"
            className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/25 grid place-items-center"
          >
            거래 처리 화면으로 이동
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold"
          >
            다른 쿠폰 조회
          </button>
        </div>
      </div>
    </div>
  );
}
