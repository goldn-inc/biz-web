"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_METAL_LABEL,
  gram,
  krw,
  kstDate,
  type GpStatsSalesResponse,
  type GpStatsStaleResponse,
} from "@/lib/gp";

const dd = "h-8 px-2 rounded-md border border-line bg-white text-[13px]";

const DIMS = [
  ["purity", "재질(순도)"],
  ["category", "분류"],
  ["supplier", "매입처"],
] as const;

/** KST 기준 날짜 문자열. offsetDays 만큼 이동. */
function kstDateStr(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
}

function kstMonthStartStr(): string {
  return `${new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 8)}01`;
}

/**
 * GP 통계 v1(§9.2) — 골드펜에 없는 신규 축이라 최소로 시작:
 * 기간 카드 4장 + 기간×차원 판매 집계(반품 제외) + 묵은 재고.
 * 전월 대비·그래프는 질문지 A-3 답이 가리키면 추가한다.
 */
export default function GpStatsPage() {
  const { token } = useBizSession();

  const [from, setFrom] = useState(kstMonthStartStr);
  const [to, setTo] = useState(() => kstDateStr());
  const [dim, setDim] = useState<(typeof DIMS)[number][0]>("purity");
  const [staleDays, setStaleDays] = useState(90);
  const [reload, setReload] = useState(0);

  const [sales, setSales] = useState<GpStatsSalesResponse | null>(null);
  const [stale, setStale] = useState<GpStatsStaleResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("dim", dim);
    void Promise.all([
      bizApiFetch<GpStatsSalesResponse>(`/biz/gp/stats/sales?${params.toString()}`, { token }),
      bizApiFetch<GpStatsStaleResponse>(`/biz/gp/stats/stale?days=${staleDays}`, { token }),
    ])
      .then(([s, st]) => {
        if (!cancelled) {
          setSales(s);
          setStale(st);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          // 직전 조건의 결과를 남겨 두면 기간·차원만 바뀐 화면이 새 조건의 값인 척한다
          // (「오늘」을 눌렀는데 이달 숫자, 「분류」로 바꿨는데 재질 행). 엑셀도 그 값을 내보낸다.
          setSales(null);
          setStale(null);
          setLoadError(
            error instanceof BizApiError ? error.message : "통계를 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, from, to, dim, staleDays, reload]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-2 py-1.5 whitespace-nowrap";
  const tdNum = `${td} text-right tabular-nums`;

  const exportCsv = (kind: "sales" | "stale") => {
    const esc = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines =
      kind === "sales"
        ? [
            ["구분", "건수", "순중량(g)", "매출", "원가", "마진"].join(","),
            ...(sales?.rows ?? []).map((r) =>
              [esc(r.key), r.lineCount, r.pureGramSum, r.salesTotal, r.costTotal, r.marginTotal].join(
                ",",
              ),
            ),
          ]
        : [
            ["시리얼", "품명", "재질", "순도", "순중량(g)", "매입가", "입고일", "경과일"].join(","),
            ...(stale?.items ?? []).map((r) =>
              [
                r.serial,
                esc(r.productName),
                GP_METAL_LABEL[r.metalType],
                r.purityCode,
                r.pureGram ?? "",
                r.acquiredCost ?? "",
                kstDate(r.receivedAt),
                r.daysInStock,
              ].join(","),
            ),
          ];
    const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gp-통계-${kind === "sales" ? "판매" : "묵은재고"}-${kstDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">통계</h1>
          <span className="text-caption text-[12px]">판매 집계는 반품 제외 · 완료 판매 기준</span>
          <div className="ml-auto">
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
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dd} />
          <span className="text-caption">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dd} />
          {(
            [
              ["오늘", () => [kstDateStr(), kstDateStr()]],
              ["1주", () => [kstDateStr(-7), kstDateStr()]],
              ["이달", () => [kstMonthStartStr(), kstDateStr()]],
              ["1달", () => [kstDateStr(-30), kstDateStr()]],
            ] as const
          ).map(([lbl, range]) => (
            <button
              key={lbl}
              type="button"
              onClick={() => {
                const [f, t] = range();
                setFrom(f);
                setTo(t);
              }}
              className="h-8 px-2 rounded-md border border-line text-[12px] text-body hover:bg-surface"
            >
              {lbl}
            </button>
          ))}
          <div className="ml-3 flex rounded-md border border-line overflow-hidden">
            {DIMS.map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                onClick={() => setDim(v)}
                className={`h-8 px-3 text-[13px] ${
                  dim === v ? "bg-surface font-bold text-primary" : "text-body hover:bg-surface"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="p-6 flex flex-col items-center gap-2">
          <span className="text-red-600">{loadError}</span>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="h-8 px-3 rounded-md border border-line bg-white text-[13px] font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <div className="p-4 flex flex-col gap-4 max-w-5xl">
        {/* 상단 카드 4장 */}
        <div className="grid grid-cols-4 gap-3">
          {(
            [
              ["기간 매출", sales ? krw(sales.salesTotal) : "…", ""],
              [
                "매출마진",
                sales ? krw(sales.marginTotal) : "…",
                sales && sales.marginTotal < 0 ? "text-red-600" : "text-emerald-700",
              ],
              ["판매 건수", sales ? `${sales.saleCount.toLocaleString()}건` : "…", ""],
              ["기간 매입액(입고)", sales ? krw(sales.purchaseTotal) : "…", ""],
            ] as const
          ).map(([lbl, value, tone]) => (
            <div key={lbl} className="rounded-lg border border-line p-3">
              <div className="text-[12px] text-caption font-bold">{lbl}</div>
              <div className={`mt-1 text-[18px] font-extrabold tabular-nums ${tone}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* 표1 — 기간×차원 판매 집계 */}
        <section className="rounded-lg border border-line overflow-hidden">
          <div className="px-3 py-2 flex items-center border-b border-line bg-surface">
            <h2 className="text-[13px] font-extrabold">
              판매 집계 — {DIMS.find(([v]) => v === dim)?.[1]}
            </h2>
            <button
              type="button"
              onClick={() => exportCsv("sales")}
              className="ml-auto h-7 px-2.5 rounded-md bg-primary hover:bg-primary-light text-white text-[12px] font-bold"
            >
              엑셀
            </button>
          </div>
          {sales && sales.rows.length === 0 ? (
            <div className="p-6 text-center text-caption">기간 내 판매가 없습니다.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line/70">
                  <th className={th}>구분</th>
                  <th className={thNum}>건수</th>
                  <th className={thNum}>순중량(g)</th>
                  <th className={thNum}>매출</th>
                  <th className={thNum}>원가</th>
                  <th className={thNum}>마진</th>
                </tr>
              </thead>
              <tbody>
                {(sales?.rows ?? []).map((r) => (
                  <tr key={r.key} className="border-b border-line/50">
                    <td className={`${td} font-semibold`}>{r.key}</td>
                    <td className={tdNum}>{r.lineCount}</td>
                    <td className={tdNum}>{gram(r.pureGramSum)}</td>
                    <td className={`${tdNum} font-semibold`}>{krw(r.salesTotal)}</td>
                    <td className={tdNum}>{krw(r.costTotal)}</td>
                    <td
                      className={`${tdNum} font-bold ${r.marginTotal >= 0 ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {krw(r.marginTotal)}
                    </td>
                  </tr>
                ))}
                {sales ? (
                  <tr className="bg-surface font-bold">
                    <td className={td}>합계</td>
                    <td className={tdNum}>
                      {sales.rows.reduce((s, r) => s + r.lineCount, 0)}
                    </td>
                    <td className={tdNum}>
                      {gram(Number(sales.rows.reduce((s, r) => s + r.pureGramSum, 0).toFixed(3)))}
                    </td>
                    <td className={tdNum}>{krw(sales.salesTotal)}</td>
                    <td className={tdNum}>{krw(sales.costTotal)}</td>
                    <td className={tdNum}>{krw(sales.marginTotal)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </section>

        {/* 표2 — 묵은 재고 */}
        <section className="rounded-lg border border-line overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-line bg-surface">
            <h2 className="text-[13px] font-extrabold">묵은 재고</h2>
            <select
              value={staleDays}
              onChange={(e) => setStaleDays(Number(e.target.value))}
              className="h-7 px-1.5 rounded-md border border-line bg-white text-[12px]"
            >
              {[30, 90, 180].map((d) => (
                <option key={d} value={d}>
                  입고 {d}일 경과
                </option>
              ))}
            </select>
            <span className="text-[12px] text-caption">
              {stale
              ? stale.total != null && stale.items.length < stale.total
                ? `표시 ${stale.items.length} / 전체 ${stale.total}건`
                : `${stale.items.length}건`
              : "…"}
            </span>
            <button
              type="button"
              onClick={() => exportCsv("stale")}
              className="ml-auto h-7 px-2.5 rounded-md bg-primary hover:bg-primary-light text-white text-[12px] font-bold"
            >
              엑셀
            </button>
          </div>
          {stale && stale.items.length === 0 ? (
            <div className="p-6 text-center text-caption">
              {staleDays}일 넘게 묵은 재고가 없습니다.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line/70">
                  <th className={th}>시리얼</th>
                  <th className={th}>품명</th>
                  <th className={th}>재질</th>
                  <th className={thNum}>순중량(g)</th>
                  <th className={thNum}>매입가</th>
                  <th className={th}>입고일</th>
                  <th className={thNum}>경과일</th>
                </tr>
              </thead>
              <tbody>
                {(stale?.items ?? []).map((r) => (
                  <tr key={r.serial} className="border-b border-line/50">
                    <td className={`${td} font-mono text-[12px]`}>
                      <Link
                        href={`/gp/inventory/${encodeURIComponent(r.serial)}`}
                        className="text-primary hover:underline"
                      >
                        {r.serial}
                      </Link>
                    </td>
                    <td className={`${td} font-semibold`}>{r.productName}</td>
                    <td className={td}>
                      {GP_METAL_LABEL[r.metalType]}{" "}
                      {r.purityCode === "UNKNOWN" ? "미상" : r.purityCode}
                    </td>
                    <td className={tdNum}>{gram(r.pureGram)}</td>
                    <td className={tdNum}>{krw(r.acquiredCost)}</td>
                    <td className={td}>{kstDate(r.receivedAt)}</td>
                    <td className={tdNum}>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[12px] font-bold ${
                          r.daysInStock >= 180
                            ? "bg-red-50 text-red-600"
                            : r.daysInStock >= 90
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.daysInStock}일
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
