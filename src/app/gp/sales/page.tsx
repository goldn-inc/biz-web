"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_METAL_LABEL,
  gram,
  krw,
  kstDateTime,
  type GpSale,
  type GpSaleLine,
  type GpSaleListResponse,
  type GpSalesPeriodSummary,
} from "@/lib/gp";

const dd = "h-8 px-2 rounded-md border border-line bg-white text-[13px]";

/** KST 기준 날짜 문자열(YYYY-MM-DD). offsetDays 만큼 이동. */
function kstDateStr(base: Date, offsetDays = 0): string {
  const kst = new Date(base.getTime() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** KST 이달 1일. */
function kstMonthStartStr(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.toISOString().slice(0, 8)}01`;
}

type ReturnDraft = {
  sale: GpSale;
  checked: Record<string, boolean>;
  refundCash: string;
  refundTransfer: string;
  refundCard: string;
  memo: string;
  submitting: boolean;
  error: string | null;
};

/**
 * GP 판매 내역(§8.2) — 골드펜 판매관리의 독법대로 라인(품목) 단위 행 + 판매별 소계.
 * 반품(§8.3)은 별도 화면 없이 이 화면의 모달(골드펜과 같게), 거래명세서는 print CSS.
 * 하단 합계: 골드펜 「거래구분별 금액 합계」 대응(매출·결제수단·원가·마진).
 */
export default function GpSalesHistoryPage() {
  const { token, account } = useBizSession();

  const [from, setFrom] = useState(kstMonthStartStr);
  const [to, setTo] = useState(() => kstDateStr(new Date()));
  const [showCanceled, setShowCanceled] = useState(false);
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<GpSaleListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [returnDraft, setReturnDraft] = useState<ReturnDraft | null>(null);
  const [statement, setStatement] = useState<GpSale | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("status", showCanceled ? "ALL" : "COMPLETED");
    void bizApiFetch<GpSaleListResponse>(`/biz/gp/sales?${params.toString()}`, { token })
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof BizApiError ? error.message : "판매 내역을 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, from, to, showCanceled, reload]);

  const sales = useMemo(() => {
    const all = data?.sales ?? [];
    if (!q.trim()) return all;
    const needle = q.trim().toLowerCase();
    return all.filter(
      (s) =>
        String(s.saleNo).includes(needle) ||
        (s.buyerMemo ?? "").toLowerCase().includes(needle) ||
        (s.memo ?? "").toLowerCase().includes(needle) ||
        s.lines.some(
          (l) =>
            (l.serial ?? "").toLowerCase().includes(needle) ||
            l.name.toLowerCase().includes(needle),
        ),
    );
  }, [data, q]);

  const summary: GpSalesPeriodSummary | undefined = data?.summary;

  /** 반품 모달 열기 — 환불 프리필은 현금 우선(§8.3: 실무에서 환불은 현금이 기본). */
  const openReturn = useCallback((sale: GpSale) => {
    const returnable = sale.lines.filter((l) => !l.returned);
    const checked: Record<string, boolean> = {};
    for (const l of returnable) checked[l.id] = returnable.length === 1;
    setReturnDraft({
      sale,
      checked,
      refundCash: "",
      refundTransfer: "",
      refundCard: "",
      memo: "",
      submitting: false,
      error: null,
    });
  }, []);

  /** 체크 상태가 바뀔 때마다 환불 3칸을 현금→이체→카드 순으로 다시 프리필. */
  const refillRefund = useCallback((draft: ReturnDraft, checked: Record<string, boolean>) => {
    const sale = draft.sale;
    const total = sale.lines
      .filter((l) => checked[l.id])
      .reduce((sum, l) => sum + l.salePrice, 0);
    const refunded = sale.returns.reduce(
      (acc, r) => ({
        cash: acc.cash + r.refundCash,
        transfer: acc.transfer + r.refundTransfer,
        card: acc.card + r.refundCard,
      }),
      { cash: 0, transfer: 0, card: 0 },
    );
    const remainCash = sale.cashAmount - refunded.cash;
    const remainTransfer = sale.transferAmount - refunded.transfer;
    const cash = Math.min(total, Math.max(remainCash, 0));
    const transfer = Math.min(total - cash, Math.max(remainTransfer, 0));
    const card = total - cash - transfer;
    return {
      ...draft,
      checked,
      refundCash: String(cash),
      refundTransfer: String(transfer),
      refundCard: String(card),
    };
  }, []);

  const submitReturn = useCallback(() => {
    if (!returnDraft) return;
    const lineIds = Object.entries(returnDraft.checked)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (lineIds.length === 0) {
      setReturnDraft((c) => c && { ...c, error: "반품할 품목을 선택하세요." });
      return;
    }
    const body = {
      lineIds,
      refundCash: Number(returnDraft.refundCash) || 0,
      refundTransfer: Number(returnDraft.refundTransfer) || 0,
      refundCard: Number(returnDraft.refundCard) || 0,
      memo: returnDraft.memo.trim() || undefined,
    };
    setReturnDraft((c) => c && { ...c, submitting: true, error: null });
    void (async () => {
      try {
        await bizApiFetch(`/biz/gp/sales/${returnDraft.sale.id}/return`, {
          method: "POST",
          body,
          token,
        });
        setReturnDraft(null);
        setReload((n) => n + 1);
      } catch (error) {
        setReturnDraft(
          (c) =>
            c && {
              ...c,
              submitting: false,
              error: error instanceof BizApiError ? error.message : "반품에 실패했습니다.",
            },
        );
      }
    })();
  }, [returnDraft, token]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-2 py-1.5 whitespace-nowrap";
  const tdNum = `${td} text-right tabular-nums`;

  const lineMaterial = (l: GpSaleLine) =>
    l.metalType
      ? `${GP_METAL_LABEL[l.metalType]}${l.purityCode ? ` ${l.purityCode === "UNKNOWN" ? "미상" : l.purityCode}` : ""}`
      : "—";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">판매 내역</h1>
          <span className="text-caption text-[12px]">
            {data === null ? "불러오는 중…" : `${sales.length.toLocaleString()}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              새로고침
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={dd}
          />
          <span className="text-caption">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dd} />
          <div className="flex items-center gap-1 ml-1">
            {(
              [
                ["오늘", 0],
                ["1주", 7],
                ["1달", 30],
              ] as const
            ).map(([lbl, days]) => (
              <button
                key={lbl}
                type="button"
                onClick={() => {
                  setFrom(kstDateStr(new Date(), -days));
                  setTo(kstDateStr(new Date()));
                }}
                className="h-8 px-2 rounded-md border border-line text-[12px] text-body hover:bg-surface"
              >
                {lbl}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="시리얼·품명·메모 검색"
            className="h-8 w-52 px-2 rounded-md border border-line bg-white ml-1"
          />
          <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCanceled}
              onChange={(e) => setShowCanceled(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-semibold">취소·반품 포함</span>
          </label>
        </div>
      </div>

      {/* 라인 평탄화 격자 — 골드펜 판매관리의 독법(품목 행 + 판매 소계) */}
      <div className="flex-1 overflow-auto bg-white">
        {loadError ? (
          <div className="p-6 text-center text-red-600">{loadError}</div>
        ) : data !== null && sales.length === 0 ? (
          <div className="p-10 text-center text-caption">
            기간 내 판매가 없습니다. 판매 등록에서 첫 판매를 올리세요.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>판매번호</th>
                <th className={th}>거래일시</th>
                <th className={th}>시리얼</th>
                <th className={th}>품명</th>
                <th className={th}>재질</th>
                <th className={thNum}>순중량(g)</th>
                <th className={thNum}>매입원가</th>
                <th className={thNum}>판매가</th>
                <th className={thNum}>현금</th>
                <th className={thNum}>이체</th>
                <th className={thNum}>카드</th>
                <th className={th}>비고</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const canceled = sale.status === "CANCELED";
                const returnable = sale.lines.some((l) => !l.returned) && !canceled;
                return (
                  <SaleRows
                    key={sale.id}
                    sale={sale}
                    canceled={canceled}
                    returnable={returnable}
                    td={td}
                    tdNum={tdNum}
                    lineMaterial={lineMaterial}
                    onReturn={() => openReturn(sale)}
                    onStatement={() => setStatement(sale)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 하단 기간 합계 — 골드펜 「거래구분별 금액 합계」 대응 */}
      <div className="shrink-0 h-9 px-4 flex items-center gap-4 border-t border-line bg-surface text-[12px]">
        {summary ? (
          <>
            <span>
              판매 <b className="tabular-nums">{summary.count.toLocaleString()}</b>건
            </span>
            <span>
              품목 <b className="tabular-nums">{summary.lineCount.toLocaleString()}</b>
            </span>
            <span>
              매출 <b className="tabular-nums">{krw(summary.salesTotal)}</b>
            </span>
            <span className="text-caption">
              현금 <b className="tabular-nums text-ink">{krw(summary.cashTotal)}</b> · 이체{" "}
              <b className="tabular-nums text-ink">{krw(summary.transferTotal)}</b> · 카드{" "}
              <b className="tabular-nums text-ink">{krw(summary.cardTotal)}</b>
            </span>
            <span className="ml-auto text-caption">
              원가 <b className="tabular-nums text-ink">{krw(summary.costTotal)}</b>
            </span>
            <span>
              마진{" "}
              <b
                className={`tabular-nums ${summary.marginTotal >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {krw(summary.marginTotal)}
              </b>
            </span>
          </>
        ) : (
          <span className="text-caption">합계 계산 중…</span>
        )}
      </div>

      {/* 반품 모달(§8.3) */}
      {returnDraft ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
          onMouseDown={() => setReturnDraft(null)}
        >
          <div
            className="w-[520px] max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-line shadow-xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-extrabold text-[14px]">반품 — 판매 #{returnDraft.sale.saleNo}</h2>
              <button
                type="button"
                onClick={() => setReturnDraft(null)}
                className="text-caption hover:text-ink px-1"
              >
                ✕
              </button>
            </div>
            <p className="text-[12px] text-caption mb-2">
              반품할 품목을 선택하세요. 개체는 재고로 복귀하고 금·현금 원장에 반대 기입됩니다.
            </p>

            <div className="border border-line rounded-md divide-y divide-line/70 mb-3">
              {returnDraft.sale.lines.map((l) => (
                <label
                  key={l.id}
                  className={`flex items-center gap-2 px-2 py-1.5 ${
                    l.returned ? "opacity-45 cursor-default" : "cursor-pointer hover:bg-surface"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={l.returned}
                    checked={!!returnDraft.checked[l.id]}
                    onChange={(e) =>
                      setReturnDraft(
                        (c) =>
                          c && refillRefund(c, { ...c.checked, [l.id]: e.target.checked }),
                      )
                    }
                    className="accent-primary"
                  />
                  <span className="font-mono text-[12px] w-32 truncate">{l.serial ?? "비개체"}</span>
                  <span className="font-semibold flex-1 truncate">{l.name}</span>
                  {l.returned ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      반품됨
                    </span>
                  ) : null}
                  <span className="tabular-nums">{krw(l.salePrice)}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {(
                [
                  ["현금 환불", "refundCash"],
                  ["이체 환불", "refundTransfer"],
                  ["카드 환불", "refundCard"],
                ] as const
              ).map(([lbl, key]) => (
                <div key={key}>
                  <div className="text-[12px] font-bold text-caption">{lbl}</div>
                  <input
                    value={returnDraft[key]}
                    onChange={(e) =>
                      setReturnDraft((c) => c && { ...c, [key]: e.target.value })
                    }
                    inputMode="numeric"
                    className="h-8 px-2 rounded-md border border-line bg-white w-full text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
            <div className="mb-2">
              <div className="text-[12px] font-bold text-caption">사유</div>
              <input
                value={returnDraft.memo}
                onChange={(e) => setReturnDraft((c) => c && { ...c, memo: e.target.value })}
                className="h-8 px-2 rounded-md border border-line bg-white w-full"
                placeholder="선택 입력"
              />
            </div>

            {returnDraft.error ? (
              <div className="mb-2 text-red-600 text-[12px]">{returnDraft.error}</div>
            ) : null}

            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setReturnDraft(null)}
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                disabled={returnDraft.submitting}
                onClick={submitReturn}
                className="h-8 px-4 rounded-md bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
              >
                {returnDraft.submitting ? "처리 중…" : "반품 확정"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 거래명세서(§8.2) — 골드펜 명세서 구조. 잔금 3칸은 외상 미지원이라 없음(§8.0 #6) */}
      {statement ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
          onMouseDown={() => setStatement(null)}
        >
          <style>{`@media print {
            body * { visibility: hidden !important; }
            #gp-statement-print, #gp-statement-print * { visibility: visible !important; }
            #gp-statement-print { position: fixed; inset: 0; overflow: visible; }
          }`}</style>
          <div
            className="w-[640px] max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-line shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-line print:hidden">
              <h2 className="font-extrabold text-[14px]">거래명세서</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-8 px-3 rounded-md bg-primary hover:bg-primary-light text-white font-bold"
                >
                  인쇄
                </button>
                <button
                  type="button"
                  onClick={() => setStatement(null)}
                  className="text-caption hover:text-ink px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div id="gp-statement-print" className="p-6 bg-white text-[13px]">
              <h3 className="text-center text-[18px] font-extrabold mb-4">거 래 명 세 서</h3>
              <div className="flex justify-between mb-3 text-[12px]">
                <div>
                  <div>
                    거래일: <b>{kstDateTime(statement.soldAt)}</b>
                  </div>
                  <div>
                    출력일: <b>{kstDateTime(new Date().toISOString())}</b>
                  </div>
                  <div>
                    고객: <b>{statement.buyerMemo ?? "일반"}</b>
                  </div>
                </div>
                <div className="text-right">
                  <div>
                    공급자: <b>{account.storeName}</b>
                  </div>
                  <div>
                    판매번호: <b>#{statement.saleNo}</b>
                  </div>
                  {statement.status === "CANCELED" ? (
                    <div className="text-red-600 font-bold">(취소된 판매)</div>
                  ) : null}
                </div>
              </div>

              <table className="w-full border-collapse mb-3">
                <thead>
                  <tr className="border-y border-ink">
                    <th className="px-1.5 py-1 text-left text-[12px]">No</th>
                    <th className="px-1.5 py-1 text-left text-[12px]">품명 (시리얼)</th>
                    <th className="px-1.5 py-1 text-left text-[12px]">함량</th>
                    <th className="px-1.5 py-1 text-right text-[12px]">중량(g)</th>
                    <th className="px-1.5 py-1 text-right text-[12px]">수량</th>
                    <th className="px-1.5 py-1 text-right text-[12px]">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-line">
                      <td className="px-1.5 py-1 tabular-nums">{i + 1}</td>
                      <td className="px-1.5 py-1">
                        <b>{l.name}</b>
                        {l.serial ? (
                          <span className="text-[11px] text-caption"> ({l.serial})</span>
                        ) : null}
                        {l.returned ? <span className="text-red-600 text-[11px]"> [반품]</span> : null}
                      </td>
                      <td className="px-1.5 py-1">{lineMaterial(l)}</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">
                        {l.weightG != null ? gram(l.weightG) : l.pureGram != null ? gram(l.pureGram) : "—"}
                      </td>
                      <td className="px-1.5 py-1 text-right tabular-nums">1</td>
                      <td className="px-1.5 py-1 text-right tabular-nums">{krw(l.salePrice)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-ink font-bold">
                    <td className="px-1.5 py-1" colSpan={5}>
                      합계
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums">
                      {krw(statement.totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-y border-ink">
                    <th className="px-1.5 py-1 text-right">현금</th>
                    <th className="px-1.5 py-1 text-right">이체</th>
                    <th className="px-1.5 py-1 text-right">카드</th>
                    <th className="px-1.5 py-1 text-right">받은금액 합계</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-1.5 py-1 text-right tabular-nums">
                      {krw(statement.cashAmount)}
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums">
                      {krw(statement.transferAmount)}
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums">
                      {krw(statement.cardAmount)}
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums font-bold">
                      {krw(statement.totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {statement.returns.length > 0 ? (
                <div className="mt-2 text-[12px] text-red-600">
                  반품{" "}
                  {statement.returns
                    .map(
                      (r) =>
                        `${kstDateTime(r.returnedAt)} ${krw(
                          r.refundCash + r.refundTransfer + r.refundCard,
                        )}`,
                    )
                    .join(" · ")}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 한 판매의 라인 행들 + 소계 행. 소계 행에 결제·액션이 붙는다. */
function SaleRows({
  sale,
  canceled,
  returnable,
  td,
  tdNum,
  lineMaterial,
  onReturn,
  onStatement,
}: {
  sale: GpSale;
  canceled: boolean;
  returnable: boolean;
  td: string;
  tdNum: string;
  lineMaterial: (l: GpSaleLine) => string;
  onReturn: () => void;
  onStatement: () => void;
}) {
  const dim = canceled ? "opacity-50" : "";
  return (
    <>
      {sale.lines.map((l, i) => (
        <tr key={l.id} className={`border-b border-line/40 ${dim}`}>
          <td className={`${td} font-mono text-[12px]`}>{i === 0 ? `#${sale.saleNo}` : ""}</td>
          <td className={td}>{i === 0 ? kstDateTime(sale.soldAt) : ""}</td>
          <td className={`${td} font-mono text-[12px]`}>{l.serial ?? "—"}</td>
          <td className={`${td} font-semibold ${l.returned ? "line-through text-caption" : ""}`}>
            {l.name}
            {l.returned ? <span className="ml-1 text-red-600 text-[11px] no-underline">반품</span> : null}
          </td>
          <td className={td}>{lineMaterial(l)}</td>
          <td className={tdNum}>{gram(l.pureGram)}</td>
          <td className={tdNum}>{krw(l.acquiredCost)}</td>
          <td className={`${tdNum} font-semibold`}>{krw(l.salePrice)}</td>
          <td className={tdNum}></td>
          <td className={tdNum}></td>
          <td className={tdNum}></td>
          <td className={td}></td>
        </tr>
      ))}
      <tr className={`border-b border-line bg-amber-50/60 ${dim}`}>
        <td className={td} colSpan={6}>
          <span className="text-[12px] text-caption">
            판매 소계 · {sale.lines.length}품목
            {canceled ? <b className="ml-2 text-red-600">취소됨</b> : null}
            {sale.buyerMemo ? <span className="ml-2">고객: {sale.buyerMemo}</span> : null}
          </span>
        </td>
        <td className={tdNum}></td>
        <td className={`${tdNum} font-bold`}>{krw(sale.totalAmount)}</td>
        <td className={tdNum}>{krw(sale.cashAmount)}</td>
        <td className={tdNum}>{krw(sale.transferAmount)}</td>
        <td className={tdNum}>{krw(sale.cardAmount)}</td>
        <td className={td}>
          <span className="flex items-center gap-1">
            {returnable ? (
              <button
                type="button"
                onClick={onReturn}
                className="h-6 px-2 rounded border border-red-200 text-red-600 text-[12px] font-semibold hover:bg-red-50"
              >
                반품
              </button>
            ) : null}
            <button
              type="button"
              onClick={onStatement}
              className="h-6 px-2 rounded border border-line text-body text-[12px] hover:bg-surface"
            >
              명세서
            </button>
          </span>
        </td>
      </tr>
    </>
  );
}
