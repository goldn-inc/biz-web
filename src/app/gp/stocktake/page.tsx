"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { gram, kstDateTime, type GpItem, type GpItemListResponse } from "@/lib/gp";

type StLine = {
  gpItemId: string | null;
  serial: string | null;
  productName: string | null;
  pureGram: number | null;
  result: "FOUND" | "MISSING" | "UNEXPECTED";
  scannedAt: string | null;
};
type Stocktake = {
  id: string;
  status: "DRAFT" | "CONFIRMED" | "CANCELED";
  startedAt: string;
  confirmedAt: string | null;
  targetCount: number;
  foundCount: number;
  missingCount: number;
  unexpectedCount: number;
  lines: StLine[];
};
type StSummary = {
  id: string;
  status: string;
  startedAt: string;
  confirmedAt: string | null;
  targetCount: number;
  foundCount: number;
  missingCount: number;
};
type ScanResult = { result: string; message: string; foundCount: number; targetCount: number };

/**
 * GP 재고조사(§5.5) — 시작=IN_STOCK 스냅샷, 스캔이 목록을 지워 나가고,
 * 확정 한 번이 MISSING→조정출고 + 원장 STOCKTAKE_ADJUST 를 원자 반영한다.
 * RENTED 는 스캔 대상에서 제외하고 별도 섹션으로 접어 보여준다(§4.2 #5).
 */
export default function GpStocktakePage() {
  const { token } = useBizSession();
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState<StSummary[] | null>(null);
  const [active, setActive] = useState<Stocktake | null>(null);
  const [rented, setRented] = useState<GpItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [scanValue, setScanValue] = useState("");
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [measuredGold, setMeasuredGold] = useState("");
  const [measuredSilver, setMeasuredSilver] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, items] = await Promise.all([
          bizApiFetch<{ stocktakes: StSummary[] }>("/biz/gp/stocktakes", { token }),
          bizApiFetch<GpItemListResponse>("/biz/gp/items?status=RENTED", { token }),
        ]);
        if (cancelled) return;
        setHistory(list.stocktakes);
        setRented(items.items);
        const draft = list.stocktakes.find((s) => s.status === "DRAFT");
        if (draft) {
          const detail = await bizApiFetch<Stocktake>(`/biz/gp/stocktakes/${draft.id}`, { token });
          if (!cancelled) setActive(detail);
        } else {
          setActive(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof BizApiError ? e.message : "재고조사를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  useEffect(() => {
    if (active?.status === "DRAFT") scanRef.current?.focus();
  }, [active]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      await bizApiFetch<Stocktake>("/biz/gp/stocktakes", { method: "POST", token });
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "조사를 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const scan = useCallback(
    async (serialRaw: string) => {
      const serial = serialRaw.trim();
      if (!serial || !active) return;
      try {
        const res = await bizApiFetch<ScanResult>(`/biz/gp/stocktakes/${active.id}/scan`, {
          method: "POST",
          token,
          body: { serial },
        });
        setLastScan(res);
        const detail = await bizApiFetch<Stocktake>(`/biz/gp/stocktakes/${active.id}`, { token });
        setActive(detail);
      } catch (e) {
        setLastScan({
          result: "ERROR",
          message: e instanceof BizApiError ? e.message : "스캔에 실패했습니다.",
          foundCount: active.foundCount,
          targetCount: active.targetCount,
        });
      } finally {
        setScanValue("");
        scanRef.current?.focus();
      }
    },
    [active, token],
  );

  const confirm = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    try {
      await bizApiFetch<Stocktake>(`/biz/gp/stocktakes/${active.id}/confirm`, {
        method: "POST",
        token,
        body: {
          ...(measuredGold !== "" ? { measuredGoldPureGram: Number(measuredGold) } : {}),
          ...(measuredSilver !== "" ? { measuredSilverPureGram: Number(measuredSilver) } : {}),
        },
      });
      setConfirmOpen(false);
      setMeasuredGold("");
      setMeasuredSilver("");
      setLastScan(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "확정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [active, measuredGold, measuredSilver, token]);

  const missing = active?.lines.filter((l) => l.result === "MISSING") ?? [];
  const unexpected = active?.lines.filter((l) => l.result === "UNEXPECTED") ?? [];
  const progress = active && active.targetCount > 0 ? active.foundCount / active.targetCount : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-extrabold">재고조사</h1>
          {active ? (
            <span className="text-[12px] text-caption">
              {kstDateTime(active.startedAt)} 시작 · 진행중
            </span>
          ) : null}
          <div className="ml-auto">
            {!active ? (
              <button
                type="button"
                onClick={() => void start()}
                disabled={busy || !history}
                className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
              >
                조사 시작 (IN_STOCK 스냅샷)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                className="h-8 px-4 rounded-md bg-primary hover:bg-primary-light text-white font-bold disabled:opacity-50"
              >
                확정…
              </button>
            )}
          </div>
        </div>

        {active ? (
          <>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="tabular-nums text-[12px] font-bold">
                {active.foundCount} / {active.targetCount}
              </span>
              {unexpected.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px] font-semibold">
                  장부 밖 {unexpected.length}건
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void scan(scanValue);
                }}
                placeholder="개체 라벨 스캔 후 Enter"
                className="h-10 w-96 px-3 rounded-md border-2 border-primary/60 focus:border-primary bg-white font-mono text-[14px]"
              />
              {lastScan ? (
                <span
                  className={`text-[12px] font-semibold ${
                    lastScan.result === "FOUND"
                      ? "text-emerald-700"
                      : lastScan.result === "ALREADY_FOUND"
                        ? "text-caption"
                        : "text-amber-700"
                  }`}
                >
                  {lastScan.message}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto bg-white p-4">
        {error ? <div className="text-red-600 mb-3">{error}</div> : null}

        {active ? (
          <div className="flex flex-col gap-4 max-w-3xl">
            <section>
              <h2 className="text-[13px] font-extrabold mb-1">
                아직 스캔 안 됨 <span className="tabular-nums text-caption">{missing.length}</span>
              </h2>
              {missing.length === 0 ? (
                <div className="text-emerald-700 font-semibold text-[13px]">
                  전 개체 확인 완료 — 확정으로 마감하세요.
                </div>
              ) : (
                <ul className="flex flex-col">
                  {missing.map((l) => (
                    <li
                      key={l.gpItemId}
                      className="flex items-center gap-3 px-2 py-1.5 border-b border-line/60"
                    >
                      <span className="font-mono text-[12px]">{l.serial}</span>
                      <span className="font-semibold">{l.productName}</span>
                      <span className="ml-auto tabular-nums text-[12px] text-caption">
                        {gram(l.pureGram)}g
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {unexpected.length > 0 ? (
              <section>
                <h2 className="text-[13px] font-extrabold mb-1 text-amber-700">
                  장부에 없는 실물 (확정 후 직접등록 유도)
                </h2>
                <ul className="flex flex-col">
                  {unexpected.map((l, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 px-2 py-1.5 border-b border-line/60"
                    >
                      <span className="font-mono text-[12px]">{l.serial}</span>
                      <span className="text-caption text-[12px]">
                        {kstDateTime(l.scannedAt)} 스캔
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {rented.length > 0 ? (
              <section>
                <h2 className="text-[13px] font-extrabold mb-1 text-caption">
                  대여중 — 스캔 제외 {rented.length}건 (장부엔 자산, 매장엔 실물 없음)
                </h2>
                <ul className="flex flex-col">
                  {rented.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 px-2 py-1.5 border-b border-line/60 text-caption"
                    >
                      <span className="font-mono text-[12px]">{r.serial}</span>
                      <span>{r.productName}</span>
                      <span className="ml-auto tabular-nums text-[12px]">{gram(r.pureGram)}g</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : history && history.length > 0 ? (
          <section className="max-w-3xl">
            <h2 className="text-[13px] font-extrabold mb-1">조사 이력</h2>
            <ul className="flex flex-col">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-2 py-1.5 border-b border-line/60">
                  <span className="tabular-nums text-[12px]">{kstDateTime(h.startedAt)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                      h.status === "CONFIRMED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {h.status === "CONFIRMED" ? "확정" : h.status === "DRAFT" ? "진행중" : "취소"}
                  </span>
                  <span className="ml-auto tabular-nums text-[12px] text-caption">
                    확인 {h.foundCount}/{h.targetCount} · 미발견 {h.missingCount}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : history ? (
          <div className="text-center text-caption py-10">
            아직 조사 이력이 없습니다. 조사 시작을 누르면 현재 재고(IN_STOCK) 전 개체가 대상으로
            잡힙니다.
          </div>
        ) : (
          <div className="text-center text-caption py-10">불러오는 중…</div>
        )}
      </div>

      {confirmOpen && active ? (
        <div
          className="fixed inset-0 z-50 bg-black/30 grid place-items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="w-[420px] rounded-lg bg-white border border-line shadow-xl p-4 text-[13px]">
            <h2 className="font-extrabold text-[14px] mb-2">재고조사 확정</h2>
            <ul className="mb-3 flex flex-col gap-1 text-[13px]">
              <li>
                확인 <b className="tabular-nums">{active.foundCount}</b> /{" "}
                <span className="tabular-nums">{active.targetCount}</span>
              </li>
              <li className={missing.length ? "text-red-600 font-semibold" : ""}>
                미발견 {missing.length}건 → 조정출고(ADJUSTED_OUT) 처리
              </li>
              {unexpected.length > 0 ? (
                <li className="text-amber-700">장부 밖 실물 {unexpected.length}건 — 확정 후 직접등록 필요</li>
              ) : null}
            </ul>
            <div className="mb-3">
              <div className="text-[12px] font-semibold text-body mb-1">
                저울 실측 총량(선택) — 입력하면 원장 잔액을 실측에 맞춰 조정합니다
              </div>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-[11px] text-caption">금 순중량(g)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={measuredGold}
                    onChange={(e) => setMeasuredGold(e.target.value)}
                    className="h-8 w-full px-2 rounded-md border border-line bg-white text-right tabular-nums"
                    placeholder="건너뛰기"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-[11px] text-caption">은 순중량(g)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={measuredSilver}
                    onChange={(e) => setMeasuredSilver(e.target.value)}
                    className="h-8 w-full px-2 rounded-md border border-line bg-white text-right tabular-nums"
                    placeholder="건너뛰기"
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="h-8 px-4 rounded-md bg-primary hover:bg-primary-light text-white font-bold disabled:opacity-50"
              >
                {busy ? "반영 중…" : "확정 반영"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
