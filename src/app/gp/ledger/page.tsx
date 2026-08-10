"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { GP_CASH_TYPE_LABEL, GP_METAL_TYPE_ENTRY_LABEL, gram, krw, kstDateTime } from "@/lib/gp";

type CashEntry = {
  id: string;
  entryType: string;
  amount: number;
  memo: string | null;
  createdAt: string;
  runningBalance: number;
};
type CashLedger = { balance: number; hasOpening: boolean; entries: CashEntry[] };
type MetalEntry = {
  id: string;
  entryType: string;
  pureGram: number;
  memo: string | null;
  createdAt: string;
  runningBalance: number;
};
type MetalLedger = {
  metal: "GOLD" | "SILVER";
  balance: number;
  itemSum: number;
  difference: number;
  hasOpening: boolean;
  unconvertibleCount: number;
  entries: MetalEntry[];
};

type Tab = "CASH" | "GOLD" | "SILVER";

/** 금·은 카드 — 원장 잔액(SSOT) 옆에 개체 합 대조를 상시 병기한다(§4.1 정합성 장치). */
function MetalCard({ label, data }: { label: string; data: MetalLedger | null }) {
  const ok = data && Math.abs(data.difference) < 0.0005;
  return (
    <div className="flex-1 border border-line rounded-lg p-3">
      <div className="text-[12px] text-caption font-bold mb-1">{label} 순중량 잔액</div>
      <div className="text-[18px] font-extrabold tabular-nums">
        {data ? `${gram(data.balance)}g` : "—"}
      </div>
      {data ? (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <span className="text-caption tabular-nums">개체 합 {gram(data.itemSum)}g</span>
          {ok ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
              일치
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
              {data.difference > 0 ? "+" : ""}
              {gram(data.difference)}g · 재고조사 권장
            </span>
          )}
          {data.unconvertibleCount > 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              환산 불가 {data.unconvertibleCount}건
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * GP 금·현금 시재(§5.4) — 상단 카드 3장(현금·금·은), 금·은 카드에 개체 합 대조 병기.
 * 행 수정·삭제 버튼 없음(반대 기입 안내). 원 단위/g 단위 표는 탭으로 분리.
 */
export default function GpLedgerPage() {
  const { token } = useBizSession();
  const [tab, setTab] = useState<Tab>("CASH");
  const [reload, setReload] = useState(0);
  const [cashData, setCashData] = useState<CashLedger | null>(null);
  const [goldData, setGoldData] = useState<MetalLedger | null>(null);
  const [silverData, setSilverData] = useState<MetalLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<"IN" | "OUT" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cash, gold, silver] = await Promise.all([
          bizApiFetch<CashLedger>("/biz/gp/ledger/cash", { token }),
          bizApiFetch<MetalLedger>("/biz/gp/ledger/metal?metal=GOLD", { token }),
          bizApiFetch<MetalLedger>("/biz/gp/ledger/metal?metal=SILVER", { token }),
        ]);
        if (!cancelled) {
          setCashData(cash);
          setGoldData(gold);
          setSilverData(silver);
          setError(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof BizApiError ? e.message : "시재를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  const hasAnyOpening =
    (cashData?.hasOpening || goldData?.hasOpening || silverData?.hasOpening) ?? false;
  const loaded = cashData && goldData && silverData;

  const exportCsv = useCallback(() => {
    if (!loaded) return;
    const rows =
      tab === "CASH"
        ? [
            ["일시", "유형", "적요", "입출(원)", "잔액(원)"].join(","),
            ...cashData.entries.map((e) =>
              [
                kstDateTime(e.createdAt),
                GP_CASH_TYPE_LABEL[e.entryType] ?? e.entryType,
                `"${(e.memo ?? "").replaceAll('"', '""')}"`,
                e.amount,
                e.runningBalance,
              ].join(","),
            ),
          ]
        : [
            ["일시", "유형", "적요", "입출(g)", "잔액(g)"].join(","),
            ...(tab === "GOLD" ? goldData : silverData).entries.map((e) =>
              [
                kstDateTime(e.createdAt),
                GP_METAL_TYPE_ENTRY_LABEL[e.entryType] ?? e.entryType,
                `"${(e.memo ?? "").replaceAll('"', '""')}"`,
                e.pureGram,
                e.runningBalance,
              ].join(","),
            ),
          ];
    const blob = new Blob([`﻿${rows.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gp-시재-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [loaded, tab, cashData, goldData, silverData]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";

  const activeEntries: (CashEntry | MetalEntry)[] =
    tab === "CASH"
      ? (cashData?.entries ?? [])
      : ((tab === "GOLD" ? goldData : silverData)?.entries ?? []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">금·현금 시재</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setManualOpen("IN")}
              className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              수동 입금
            </button>
            <button
              type="button"
              onClick={() => setManualOpen("OUT")}
              className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              수동 출금
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="h-8 px-3 rounded-md bg-primary hover:bg-primary-light text-white font-bold"
            >
              엑셀
            </button>
          </div>
        </div>

        {!hasAnyOpening && loaded ? (
          <div className="mb-2 px-3 py-2 rounded-md bg-amber-50 text-amber-800 text-[12px]">
            개시 잔액이 아직 없습니다.{" "}
            <Link href="/gp/settings" className="font-bold underline">
              기초 설정에서 개시 잔액을 입력
            </Link>
            하면 시재가 실제 장부와 맞기 시작합니다.
          </div>
        ) : null}

        <div className="flex gap-3 mb-2">
          <div className="flex-1 border border-line rounded-lg p-3">
            <div className="text-[12px] text-caption font-bold mb-1">현금 잔액</div>
            <div className="text-[18px] font-extrabold tabular-nums">
              {cashData ? krw(cashData.balance) : "—"}
            </div>
          </div>
          <MetalCard label="금" data={goldData} />
          <MetalCard label="은" data={silverData} />
        </div>

        <div className="flex gap-1">
          {(
            [
              ["CASH", "현금"],
              ["GOLD", "금"],
              ["SILVER", "은"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-8 px-4 rounded-t-md border border-b-0 ${
                tab === key
                  ? "border-line bg-white font-bold text-primary"
                  : "border-transparent text-body hover:bg-surface"
              }`}
            >
              {label} 원장
            </button>
          ))}
          <span className="ml-auto self-center text-[11px] text-caption">
            행 수정·삭제 없음 — 틀리면 반대 기입으로 바로잡습니다
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {error ? (
          <div className="p-6 text-center text-red-600">{error}</div>
        ) : !loaded ? (
          <div className="p-6 text-center text-caption">불러오는 중…</div>
        ) : activeEntries.length === 0 ? (
          <div className="p-10 text-center text-caption">기입된 행이 없습니다.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>일시</th>
                <th className={th}>유형</th>
                <th className={th}>적요</th>
                <th className={`${th} text-right`}>입출{tab === "CASH" ? "(원)" : "(g)"}</th>
                <th className={`${th} text-right`}>잔액{tab === "CASH" ? "(원)" : "(g)"}</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map((e) => {
                const value = "amount" in e ? e.amount : e.pureGram;
                const fmt = (v: number) =>
                  tab === "CASH" ? v.toLocaleString("ko-KR") : gram(v);
                const label =
                  tab === "CASH"
                    ? (GP_CASH_TYPE_LABEL[e.entryType] ?? e.entryType)
                    : (GP_METAL_TYPE_ENTRY_LABEL[e.entryType] ?? e.entryType);
                return (
                  <tr key={e.id} className="border-b border-line/70">
                    <td className={`${td} tabular-nums text-caption`}>{kstDateTime(e.createdAt)}</td>
                    <td className={td}>
                      <span className="font-semibold">{label}</span>
                    </td>
                    <td className={td}>{e.memo ?? "—"}</td>
                    <td
                      className={`${td} text-right tabular-nums font-semibold ${
                        value < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {value > 0 ? "+" : ""}
                      {fmt(value)}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(e.runningBalance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {manualOpen ? (
        <ManualEntryModal
          token={token}
          direction={manualOpen}
          tab={tab}
          onClose={() => setManualOpen(null)}
          onDone={() => {
            setManualOpen(null);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/** 수동 입출 — 현금 탭이면 원 단위(MANUAL_IN/OUT), 금·은 탭이면 g 단위(MANUAL). */
function ManualEntryModal({
  token,
  direction,
  tab,
  onClose,
  onDone,
}: {
  token: string;
  direction: "IN" | "OUT";
  tab: Tab;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<Tab>(tab);
  const [value, setValue] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      setError("금액/중량을 입력해 주세요.");
      return;
    }
    if (!memo.trim()) {
      setError("적요를 입력해 주세요 — 원장은 사유가 남아야 합니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (target === "CASH") {
        await bizApiFetch("/biz/gp/ledger/cash", {
          method: "POST",
          token,
          body: {
            entryType: direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT",
            amount: Math.round(num),
            memo: memo.trim(),
          },
        });
      } else {
        await bizApiFetch("/biz/gp/ledger/metal", {
          method: "POST",
          token,
          body: { metal: target, pureGram: num, direction, memo: memo.trim() },
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "기입에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[360px] rounded-lg bg-white border border-line shadow-xl p-4 text-[13px]">
        <h2 className="font-extrabold text-[14px] mb-3">
          수동 {direction === "IN" ? "입금(입고)" : "출금(출고)"}
        </h2>
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="text-[12px] font-semibold text-body">대상</div>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as Tab)}
              className="h-8 px-2 rounded-md border border-line bg-white w-full"
            >
              <option value="CASH">현금(원)</option>
              <option value="GOLD">금 순중량(g)</option>
              <option value="SILVER">은 순중량(g)</option>
            </select>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-body">
              {target === "CASH" ? "금액(원)" : "순중량(g)"}
            </div>
            <input
              type="number"
              min="0"
              step={target === "CASH" ? "1" : "0.001"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 px-2 rounded-md border border-line bg-white w-full text-right tabular-nums"
              autoFocus
            />
          </div>
          <div>
            <div className="text-[12px] font-semibold text-body">적요(필수)</div>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 자투리 금 매입"
              className="h-8 px-2 rounded-md border border-line bg-white w-full"
            />
          </div>
          {error ? <div className="text-red-600 text-[12px] font-semibold">{error}</div> : null}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className={`h-8 px-4 rounded-md text-white font-bold disabled:opacity-50 ${
                direction === "IN"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {busy ? "기입 중…" : "기입"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
