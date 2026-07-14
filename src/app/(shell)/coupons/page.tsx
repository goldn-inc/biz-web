"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CouponTagIcon,
  QrIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
} from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
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

/** GET /biz/coupons/recent 응답 항목 */
type ApiRecentEntry = {
  couponId: string;
  name: string;
  customerName: string | null;
  benefitAmountKrw: number;
  sellRequestId: string;
  usedAt: string;
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

/** 고객 앱 발급 쿠폰 조회·검증·거래 적용 — 사업자용 쿠폰 화면 */
export default function CouponsPage() {
  const { token } = useBizSession();

  const [code, setCode] = useState("");
  const [view, setView] = useState<ViewState>("idle");
  const [verify, setVerify] = useState<ApiVerifyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<AppliedReceipt | null>(null);

  const [openTxs, setOpenTxs] = useState<ApiOpenTransaction[] | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const [historyReload, setHistoryReload] = useState(0);
  const [history, setHistory] = useState<ApiRecentEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await bizApiFetch<{ entries: ApiRecentEntry[] }>("/biz/coupons/recent", {
          token,
        });
        if (!cancelled) {
          setHistory(res.entries);
          setHistoryError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(
            error instanceof BizApiError ? error.message : "이력을 불러오지 못했습니다.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, historyReload]);

  async function lookup(rawCode: string) {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) return;
    setView("loading");
    setApplyError(null);
    setOpenTxs(null);
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
        const { from, to } = weekRange();
        const list = await bizApiFetch<{ transactions: ApiOpenTransaction[] }>(
          `/biz/transactions?from=${from}&to=${to}&status=IN_PROGRESS`,
          { token },
        );
        setOpenTxs(list.transactions);
        setSelectedTxId(list.transactions[0]?.id ?? null);
      }
    } catch (error) {
      setVerify({ result: "NOT_FOUND", coupon: null });
      setApplyError(
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
      setHistoryReload((n) => n + 1);
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

  return (
    <>
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">쿠폰 적용</h1>
        <div className="text-sm text-caption mt-1.5">
          {kstDateLabel()} · KST · 고객 앱 발급 쿠폰 조회·검증
        </div>
      </div>

      {view === "applied" && receipt ? (
        <AppliedCard receipt={receipt} onReset={resetLookup} />
      ) : (
        <>
          <div className="flex gap-5 flex-wrap items-start">
            <section className="flex-[1.6] min-w-80 bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-3.5">
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

            <section className="flex-1 min-w-72 bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-1.5">
              <h3 className="text-sm font-extrabold m-0 mb-2">최근 적용 이력</h3>
              {historyError ? (
                <p className="text-xs text-red-600 m-0 py-4">{historyError}</p>
              ) : history === null ? (
                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 text-center py-6">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
                    <CouponTagIcon className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold">아직 적용한 쿠폰이 없습니다</div>
                  <p className="text-xs text-caption m-0">
                    쿠폰을 조회해 거래에 적용하면 이력이 쌓입니다.
                  </p>
                </div>
              ) : (
                history.map((h) => (
                  <div
                    key={h.couponId}
                    className="flex items-center gap-3 py-2.5 border-t border-slate-100 first:border-t-0"
                  >
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 grid place-items-center text-primary shrink-0">
                      <CouponTagIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{h.name}</div>
                      <div className="text-xs text-caption">
                        {h.customerName ?? "고객"} · {kstTimeLabel(h.usedAt)} ·{" "}
                        {h.sellRequestId.slice(0, 8)}
                      </div>
                    </div>
                    <div className="text-sm font-extrabold text-primary shrink-0 tabular-nums">
                      +{krwLabel(h.benefitAmountKrw)}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>

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
      )}
    </>
  );
}

function ValidCard({
  coupon,
  transactions,
  selectedTxId,
  onSelectTx,
  onApply,
  applying,
  applyError,
}: {
  coupon: ApiCouponSummary;
  transactions: ApiOpenTransaction[] | null;
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
          {transactions === null ? (
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
