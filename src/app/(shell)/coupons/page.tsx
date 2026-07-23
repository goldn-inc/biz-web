"use client";

import { useEffect, useState } from "react";
import { CouponTagIcon } from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { krwLabel } from "@/lib/coupon";
import { CouponApplyWidget } from "@/components/coupons/CouponApplyWidget";

/** GET /biz/coupons/recent 응답 항목 */
type ApiRecentEntry = {
  couponId: string;
  name: string;
  customerName: string | null;
  benefitAmountKrw: number;
  sellRequestId: string;
  usedAt: string;
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

/** 고객 앱 발급 쿠폰 조회·검증·거래 적용 — 사업자용 쿠폰 화면 */
export default function CouponsPage() {
  const { token } = useBizSession();

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

  return (
    <>
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">쿠폰 적용</h1>
        <div className="text-sm text-caption mt-1.5">
          {kstDateLabel()} · KST · 고객 앱 발급 쿠폰 조회·검증
        </div>
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <div className="flex-[1.6] min-w-80 flex flex-col gap-5">
          <CouponApplyWidget token={token} onApplied={() => setHistoryReload((n) => n + 1)} />
        </div>

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
    </>
  );
}
