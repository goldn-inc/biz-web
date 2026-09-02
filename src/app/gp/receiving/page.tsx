"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { DirectRegisterModal } from "@/components/gp/DirectRegisterModal";
import { gram, kstDate, type GpProductLite, type GpSupplier } from "@/lib/gp";

type PendingItem = { serial: string; weightG: number | null };
type PendingLine = {
  productId: string;
  productName: string;
  orderedQty: number;
  deliveredCount: number;
  pendingItems: PendingItem[];
};
type PendingOrder = { id: string; status: string; createdAt: string; lines: PendingLine[] };
type PendingResponse = {
  summary: { ordersInProgress: number; ordersShipping: number; pendingItemCount: number };
  orders: PendingOrder[];
};
type ScanResult = {
  ok: true;
  serial: string;
  productName: string;
  weightG: number | null;
  pureGram: number | null;
  orderCompleted: boolean;
};

type ScanLog = { serial: string; ok: boolean; message: string };

/**
 * GP 발주·입고(§5.2) — 화면의 주인공은 스캐너다. 스캔 입력이 포커스 상주하고,
 * 스캔 성공 시 해당 개체 행이 즉시 입고완료로 바뀐다. 골드펜에는 없는 화면(이기는 자리).
 */
export default function GpReceivingPage() {
  const { token } = useBizSession();

  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{ key: number; data?: PendingResponse; error?: string } | null>(
    null,
  );
  const loading = result?.key !== reloadCount;
  const data = !loading ? result?.data : undefined;

  const [scanValue, setScanValue] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  /** 이번 세션에서 입고 완료된 시리얼 — 목록 재조회 전에도 행을 즉시 완료 표시. */
  const [doneSerials, setDoneSerials] = useState<Set<string>>(new Set());
  const [receiveAllBusy, setReceiveAllBusy] = useState<string | null>(null);

  const [directOpen, setDirectOpen] = useState(false);
  // null = 조회 실패. 빈 배열(=진짜 0건)과 섞으면 모델이 있는 매장에 「기존 모델」을 잠근다.
  const [products, setProducts] = useState<GpProductLite[] | null>([]);
  const [suppliers, setSuppliers] = useState<GpSupplier[] | null>([]);

  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await bizApiFetch<PendingResponse>("/biz/gp/receiving/pending", { token });
        if (!cancelled) setResult({ key: reloadCount, data: res });
      } catch (error) {
        if (!cancelled) {
          setResult({
            key: reloadCount,
            error:
              error instanceof BizApiError ? error.message : "도착 대기를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadCount, token]);

  const loadFormData = useCallback(() => {
    void bizApiFetch<{ suppliers: GpSupplier[] }>("/biz/gp/suppliers", { token })
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers(null));
    void bizApiFetch<{ products: GpProductLite[] }>("/biz/gp/products", { token })
      .then((r) => setProducts(r.products))
      .catch(() => setProducts(null));
  }, [token]);
  useEffect(loadFormData, [loadFormData]);

  /** 스캔 입력 포커스 상주 — 모달이 없을 때 항상 스캐너가 주인공. */
  useEffect(() => {
    if (!directOpen) scanRef.current?.focus();
  }, [directOpen, loading]);

  const pushLog = useCallback((log: ScanLog) => {
    setLogs((prev) => [log, ...prev].slice(0, 8));
  }, []);

  const scan = useCallback(
    async (serialRaw: string) => {
      const serial = serialRaw.trim();
      if (!serial || scanBusy) return;
      setScanBusy(true);
      try {
        const res = await bizApiFetch<ScanResult>("/biz/gp/receiving/scan", {
          method: "POST",
          token,
          body: { serial },
        });
        setDoneSerials((prev) => new Set(prev).add(res.serial));
        pushLog({
          serial: res.serial,
          ok: true,
          message: `${res.productName} · ${gram(res.weightG)}g 입고${res.orderCompleted ? " (주문 완료)" : ""}`,
        });
        setReloadCount((n) => n + 1);
      } catch (error) {
        pushLog({
          serial,
          ok: false,
          message: error instanceof BizApiError ? error.message : "스캔 입고에 실패했습니다.",
        });
      } finally {
        setScanValue("");
        setScanBusy(false);
        scanRef.current?.focus();
      }
    },
    [scanBusy, token, pushLog],
  );

  const receiveAll = useCallback(
    async (orderId: string) => {
      setReceiveAllBusy(orderId);
      try {
        const res = await bizApiFetch<{
          received: ScanResult[];
          failed: { serial: string; error: string }[];
        }>("/biz/gp/receiving/receive-all", {
          method: "POST",
          token,
          body: { wholesaleOrderId: orderId },
        });
        setDoneSerials((prev) => {
          const next = new Set(prev);
          res.received.forEach((r) => next.add(r.serial));
          return next;
        });
        pushLog({
          serial: "일괄",
          ok: res.failed.length === 0,
          message: `${res.received.length}건 입고${res.failed.length ? ` · 실패 ${res.failed.length}건` : ""}`,
        });
        setReloadCount((n) => n + 1);
      } catch (error) {
        pushLog({
          serial: "일괄",
          ok: false,
          message: error instanceof BizApiError ? error.message : "일괄 수령에 실패했습니다.",
        });
      } finally {
        setReceiveAllBusy(null);
      }
    },
    [token, pushLog],
  );

  const summary = data?.summary;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">발주·입고</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReloadCount((n) => n + 1)}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setDirectOpen(true)}
              className="h-8 px-3 rounded-md border border-blue-600 text-blue-600 font-bold hover:bg-blue-50"
            >
              직접 입고(비도매)
            </button>
            <Link
              href="/wholesale"
              className="h-8 px-3 inline-flex items-center rounded-md bg-primary hover:bg-primary-light text-white font-bold"
            >
              도매 발주 바로가기 ↗
            </Link>
          </div>
        </div>

        {/* 요약 띠 */}
        <div className="flex items-center gap-4 text-[12px] mb-2">
          <span>
            발주중 <b className="tabular-nums">{summary?.ordersInProgress ?? "—"}</b>
          </span>
          <span>
            배송중 주문 <b className="tabular-nums">{summary?.ordersShipping ?? "—"}</b>
          </span>
          <span>
            도착 대기 개체{" "}
            <b className="tabular-nums text-primary">{summary?.pendingItemCount ?? "—"}</b>
          </span>
        </div>

        {/* 스캔 입력 — 상주 포커스 */}
        <div className="flex items-center gap-2">
          <input
            ref={scanRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void scan(scanValue);
            }}
            placeholder="라벨 스캔 또는 시리얼 입력 후 Enter (GP-…)"
            className="h-10 w-96 px-3 rounded-md border-2 border-primary/60 focus:border-primary bg-white font-mono text-[14px]"
            disabled={scanBusy}
          />
          <button
            type="button"
            onClick={() => void scan(scanValue)}
            disabled={scanBusy || !scanValue.trim()}
            className="h-10 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
          >
            {scanBusy ? "입고 중…" : "입고"}
          </button>
        </div>

        {logs.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-0.5 text-[12px]">
            {logs.map((log, i) => (
              <li key={i} className={log.ok ? "text-emerald-700" : "text-red-600"}>
                <span className="font-mono">{log.serial}</span> — {log.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto bg-white p-4">
        {result?.error && !loading ? (
          <div className="text-center text-red-600">{result.error}</div>
        ) : !data ? (
          <div className="text-center text-caption">불러오는 중…</div>
        ) : data.orders.length === 0 ? (
          <div className="text-center text-caption py-10">
            도착 대기 개체가 없습니다. 본사가 출고 스캔(SHIPPED)하면 여기 자동으로 나타납니다.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.orders.map((order) => (
              <section key={order.id} className="border border-line rounded-lg overflow-hidden">
                <header className="flex items-center gap-3 px-3 py-2 bg-surface border-b border-line">
                  <span className="font-bold">주문 {order.id.slice(0, 8)}</span>
                  <span className="text-caption text-[12px]">{kstDate(order.createdAt)} 발주</span>
                  <button
                    type="button"
                    onClick={() => void receiveAll(order.id)}
                    disabled={receiveAllBusy !== null}
                    className="ml-auto h-7 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold text-[12px] disabled:opacity-50"
                  >
                    {receiveAllBusy === order.id ? "수령 중…" : "전체 수령"}
                  </button>
                </header>
                <div className="p-3 flex flex-col gap-3">
                  {order.lines.map((line) => (
                    <div key={line.productId}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{line.productName}</span>
                        <span className="text-caption text-[12px] tabular-nums">
                          입고 {line.deliveredCount + line.pendingItems.filter((i) => doneSerials.has(i.serial)).length}
                          /{line.orderedQty}
                        </span>
                      </div>
                      <ul className="flex flex-col">
                        {line.pendingItems.map((item) => {
                          const done = doneSerials.has(item.serial);
                          return (
                            <li
                              key={item.serial}
                              className={`flex items-center gap-3 px-2 py-1.5 border-b border-line/60 last:border-b-0 ${
                                done ? "bg-emerald-50" : ""
                              }`}
                            >
                              <span className="font-mono text-[12px]">{item.serial}</span>
                              <span className="tabular-nums text-[12px]">
                                {gram(item.weightG)}g
                              </span>
                              <span
                                className={`ml-auto text-[12px] font-semibold ${
                                  done ? "text-emerald-700" : "text-caption"
                                }`}
                              >
                                {done ? "입고완료" : "도착 대기"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {directOpen ? (
        <DirectRegisterModal
          token={token}
          products={products}
          suppliers={suppliers}
          onClose={() => setDirectOpen(false)}
          onRegistered={(item) => {
            setDirectOpen(false);
            pushLog({ serial: item.serial, ok: true, message: `${item.productName} 직접 입고` });
            loadFormData();
          }}
        />
      ) : null}
    </div>
  );
}
