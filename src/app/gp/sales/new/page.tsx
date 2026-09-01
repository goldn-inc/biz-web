"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { gram, krw, type GpItemDetail, type GpMetalType } from "@/lib/gp";

type SaleLine =
  | {
      kind: "item";
      gpItemId: string;
      serial: string;
      name: string;
      pureGram: number | null;
      acquiredLaborFee: number | null;
      salePrice: string;
    }
  | {
      kind: "free";
      freeName: string;
      freeMetal: GpMetalType | "";
      freePureGram: string;
      salePrice: string;
    };

type SaleResult = { id: string; saleNo: number; totalAmount: number };

/**
 * GP 판매 등록(§5.3) — 스캔/시리얼 입력 상주 → 개체 라인 적재, 비개체 라인 보조.
 * 결제 3칸 분할, 라인 합=결제 합 검증, Ctrl+Enter 저장(한 트랜잭션).
 */
/** 판매가 프리필 — 시세연동가 우선, 없으면 고정 TAG가, 둘 다 없으면 빈 칸. */
function tagPriceOf(item: GpItemDetail): string {
  if (item.tagPriceSource === "SPOT" && item.linkedTagPrice != null) {
    return String(item.linkedTagPrice);
  }
  return item.tagPrice != null ? String(item.tagPrice) : "";
}

export default function GpSalesNewPage() {
  const { token } = useBizSession();

  const [lines, setLines] = useState<SaleLine[]>([]);
  const [scanValue, setScanValue] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cash, setCash] = useState("");
  const [transfer, setTransfer] = useState("");
  const [card, setCard] = useState("");
  const [buyerMemo, setBuyerMemo] = useState("");
  const [freeOpen, setFreeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<SaleResult | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const linesTotal = lines.reduce((sum, l) => sum + (Number(l.salePrice) || 0), 0);
  const paidTotal = (Number(cash) || 0) + (Number(transfer) || 0) + (Number(card) || 0);
  const balanced = linesTotal > 0 && linesTotal === paidTotal;

  const addBySerial = useCallback(
    async (serialRaw: string) => {
      const serial = serialRaw.trim();
      if (!serial) return;
      setScanError(null);
      try {
        const item = await bizApiFetch<GpItemDetail>(
          `/biz/gp/items/${encodeURIComponent(serial)}`,
          { token },
        );
        if (item.status !== "IN_STOCK") {
          setScanError(`${serial} 은 재고 상태가 아닙니다(${item.status}).`);
          return;
        }
        setLines((prev) => {
          if (prev.some((l) => l.kind === "item" && l.gpItemId === item.id)) {
            setScanError(`${serial} 은 이미 담겨 있습니다.`);
            return prev;
          }
          return [
            ...prev,
            {
              kind: "item",
              gpItemId: item.id,
              serial: item.serial,
              name: item.productName,
              pureGram: item.pureGram,
              acquiredLaborFee: item.acquiredLaborFee,
              // §8.4 — 소비자가(TAG가) 프리필(수정 가능). 시세연동가가 서면 그쪽이 우선이고,
              // 중량·공임이 없어 계산이 안 될 때만 고정가로 떨어진다.
              salePrice: tagPriceOf(item),
            },
          ];
        });
      } catch (error) {
        setScanError(
          error instanceof BizApiError ? error.message : "개체를 찾지 못했습니다.",
        );
      } finally {
        setScanValue("");
        scanRef.current?.focus();
      }
    },
    [token],
  );

  /** 이 화면의 한 번의 「등록」에 대한 멱등 키 — 성공하면 새로 뽑는다. */
  const submitKeyRef = useRef<string>(crypto.randomUUID());

  const submit = useCallback(async () => {
    if (!balanced || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const sale = await bizApiFetch<SaleResult>("/biz/gp/sales", {
        method: "POST",
        token,
        // 더블탭이 판매·현금·금 원장을 각각 두 벌 남긴다 — 개체 라인은 IN_STOCK 조건부
        // UPDATE 가 막지만 비개체 라인에는 그 앵커가 없다. 이 화면에서 한 번 만든 키를
        // 재시도에도 그대로 써서 서버가 같은 요청임을 알아보게 한다.
        idempotencyKey: submitKeyRef.current,
        body: {
          lines: lines.map((l) =>
            l.kind === "item"
              ? { gpItemId: l.gpItemId, salePrice: Number(l.salePrice) || 0 }
              : {
                  freeName: l.freeName,
                  ...(l.freeMetal && Number(l.freePureGram) > 0
                    ? { freeMetal: l.freeMetal, freePureGram: Number(l.freePureGram) }
                    : {}),
                  salePrice: Number(l.salePrice) || 0,
                },
          ),
          cashAmount: Number(cash) || 0,
          transferAmount: Number(transfer) || 0,
          cardAmount: Number(card) || 0,
          ...(buyerMemo.trim() ? { buyerMemo: buyerMemo.trim() } : {}),
        },
      });
      setLastSale(sale);
      setLines([]);
      setCash("");
      setTransfer("");
      setCard("");
      setBuyerMemo("");
      scanRef.current?.focus();
    } catch (error) {
      setSubmitError(error instanceof BizApiError ? error.message : "판매 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [balanced, submitting, lines, cash, transfer, card, buyerMemo, token]);

  /** Ctrl+Enter 저장(§5.3). */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void submit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submit]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";
  const numInput = "h-8 w-32 px-2 rounded-md border border-line bg-white text-right tabular-nums";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">판매 등록</h1>
          {lastSale ? (
            <span className="text-emerald-700 text-[12px] font-semibold">
              판매 #{lastSale.saleNo} 저장됨 · {krw(lastSale.totalAmount)}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFreeOpen((v) => !v)}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              비개체 라인 추가
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!balanced || submitting}
              className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
              title="Ctrl+Enter"
            >
              {submitting ? "저장 중…" : "저장 (Ctrl+Enter)"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={scanRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addBySerial(scanValue);
            }}
            placeholder="판매할 개체 라벨 스캔 또는 시리얼 입력 후 Enter"
            className="h-10 w-96 px-3 rounded-md border-2 border-primary/60 focus:border-primary bg-white font-mono text-[14px]"
          />
          {scanError ? <span className="text-red-600 text-[12px]">{scanError}</span> : null}
        </div>

        {freeOpen ? <FreeLineForm onAdd={(l) => setLines((prev) => [...prev, l])} /> : null}
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {lines.length === 0 ? (
          <div className="p-10 text-center text-caption">
            스캔한 개체가 여기에 쌓입니다. 판매가를 입력하고 결제를 나눠 적은 뒤 저장하세요.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>No</th>
                <th className={th}>시리얼/품명</th>
                <th className={`${th} text-right`}>순중량(g)</th>
                <th className={`${th} text-right`}>매입공임(참고)</th>
                <th className={`${th} text-right`}>판매가(원)</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className={`${td} text-right tabular-nums`}>{i + 1}</td>
                  <td className={td}>
                    {line.kind === "item" ? (
                      <>
                        <span className="font-mono text-[12px]">{line.serial}</span>{" "}
                        <span className="font-semibold">{line.name}</span>
                      </>
                    ) : (
                      <span className="font-semibold">
                        {line.freeName} <span className="text-caption text-[11px]">(비개체)</span>
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {line.kind === "item"
                      ? gram(line.pureGram)
                      : line.freePureGram
                        ? gram(Number(line.freePureGram))
                        : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums text-caption`}>
                    {line.kind === "item" ? krw(line.acquiredLaborFee) : "—"}
                  </td>
                  <td className={`${td} text-right`}>
                    <input
                      type="number"
                      min="0"
                      value={line.salePrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, j) => (j === i ? { ...l, salePrice: e.target.value } : l)),
                        )
                      }
                      className={numInput}
                      placeholder="0"
                    />
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      className="text-caption hover:text-red-600 px-1"
                      title="라인 제거"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {submitError ? (
          <div className="px-4 py-2 text-red-600 text-[12px] font-semibold">{submitError}</div>
        ) : null}
      </div>

      {/* 하단 고정 — 결제 분할 + 합계 검증 */}
      <div className="shrink-0 px-4 py-2.5 flex items-center gap-4 border-t border-line bg-surface">
        <label className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold">현금</span>
          <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} className={numInput} placeholder="0" />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold">이체</span>
          <input type="number" min="0" value={transfer} onChange={(e) => setTransfer(e.target.value)} className={numInput} placeholder="0" />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold">카드</span>
          <input type="number" min="0" value={card} onChange={(e) => setCard(e.target.value)} className={numInput} placeholder="0" />
        </label>
        <label className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[12px] font-semibold shrink-0">고객 메모</span>
          <input
            value={buyerMemo}
            onChange={(e) => setBuyerMemo(e.target.value)}
            className="h-8 px-2 rounded-md border border-line bg-white flex-1 min-w-0"
            placeholder="선택"
          />
        </label>
        <div className="ml-auto text-right shrink-0">
          <div className="tabular-nums font-extrabold text-[14px]">{krw(linesTotal)}</div>
          <div
            className={`text-[11px] font-semibold ${
              linesTotal === 0 ? "text-caption" : balanced ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {linesTotal === 0
              ? "라인 없음"
              : balanced
                ? "결제 합 일치"
                : `결제 합 ${krw(paidTotal)} — 불일치`}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 비개체 판매 입력(자투리 금·주문제작 등) — 순중량을 적으면 금 원장에 출고로 잡힌다. */
function FreeLineForm({ onAdd }: { onAdd: (line: SaleLine) => void }) {
  const [name, setName] = useState("");
  const [metal, setMetal] = useState<GpMetalType | "">("");
  const [pureGram, setPureGram] = useState("");

  return (
    <div className="mt-2 flex items-center gap-2 text-[13px]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="품명(예: 자투리 금)"
        className="h-8 w-52 px-2 rounded-md border border-line bg-white"
      />
      <select
        value={metal}
        onChange={(e) => setMetal(e.target.value as GpMetalType | "")}
        className="h-8 px-2 rounded-md border border-line bg-white"
      >
        <option value="">재질 없음</option>
        <option value="GOLD">금</option>
        <option value="SILVER">은</option>
      </select>
      <input
        type="number"
        step="0.001"
        min="0"
        value={pureGram}
        onChange={(e) => setPureGram(e.target.value)}
        placeholder="순중량(g, 선택)"
        className="h-8 w-32 px-2 rounded-md border border-line bg-white text-right tabular-nums"
        disabled={!metal}
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onAdd({
            kind: "free",
            freeName: name.trim(),
            freeMetal: metal,
            freePureGram: pureGram,
            salePrice: "",
          });
          setName("");
          setMetal("");
          setPureGram("");
        }}
        className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
      >
        라인 추가
      </button>
      <span className="text-caption text-[11px]">순중량을 적으면 금 원장에 출고로 잡힙니다</span>
    </div>
  );
}
