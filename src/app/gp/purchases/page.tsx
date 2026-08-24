"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_PURCHASE_KIND_LABEL,
  GP_PURITY_CODES,
  gram,
  krw,
  type GpPurchaseDetail,
  type GpPurchaseLineKind,
  type GpPurchaseOutstanding,
  type GpPurchaseRow,
  type GpSupplierRow,
} from "@/lib/gp";

/** 골드펜 발주 그리드는 20행으로 열린다 — 빈 행은 저장에서 걸러낸다. */
const GRID_ROWS = 20;

type LineDraft = {
  kind: GpPurchaseLineKind;
  note: string;
  purityCode: string;
  actualWeightG: string;
  hallmarkFactor: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

function emptyLine(): LineDraft {
  return {
    kind: "PURCHASE",
    note: "",
    purityCode: "",
    actualWeightG: "",
    hallmarkFactor: "",
    quantity: "1",
    unitPrice: "",
    taxRate: "",
  };
}

/** 오늘(KST) — 매입일 기본값. */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const th = "px-2 py-1.5 text-[12px] font-semibold text-caption text-left whitespace-nowrap";
const thNum = `${th} text-right`;
const cell = "h-8 w-full px-1.5 rounded border border-line bg-white text-[13px]";
const cellNum = `${cell} text-right tabular-nums`;

/**
 * 매입 등록(골드펜 발주) — 거래처 원장.
 *
 * 재고는 여기서 만들어지지 않는다(재고 등록은 직접등록/이관 화면). 이 화면은 거래처에 얼마가
 * 밀려 있는지(미수)를 관리한다. 금액·순금환산은 저장 시 서버가 계산하며, 아래 미리보기는
 * 같은 산식을 화면에서 한 번 더 돌린 것이다.
 */
export default function GpPurchasesPage() {
  const { token } = useBizSession();

  const [suppliers, setSuppliers] = useState<GpSupplierRow[]>([]);
  const [rows, setRows] = useState<GpPurchaseRow[] | null>(null);
  const [detail, setDetail] = useState<GpPurchaseDetail | null>(null);
  const [fetchedOutstanding, setFetchedOutstanding] = useState<GpPurchaseOutstanding | null>(
    null,
  );

  const [purchaseDate, setPurchaseDate] = useState(todayKst());
  const [supplierId, setSupplierId] = useState("");
  const [materialGroup, setMaterialGroup] = useState("");
  const [defaultHallmark, setDefaultHallmark] = useState("");
  const [defaultTaxRate, setDefaultTaxRate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    Array.from({ length: GRID_ROWS }, () => emptyLine()),
  );

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback(() => {
    void bizApiFetch<{ purchases: GpPurchaseRow[] }>("/biz/gp/purchases?limit=50", { token })
      .then((res) => setRows(res.purchases))
      .catch(() => setMessage({ ok: false, text: "매입 목록을 불러오지 못했습니다." }));
  }, [token]);

  useEffect(() => {
    void bizApiFetch<{ suppliers: GpSupplierRow[] }>("/biz/gp/suppliers", { token })
      .then((res) => setSuppliers(res.suppliers))
      .catch(() => setMessage({ ok: false, text: "거래처를 불러오지 못했습니다." }));
    loadList();
  }, [token, loadList]);

  /* 거래처를 고르면 그 거래처의 지금 미수를 불러온다(골드펜 「매입 전 미수」). */
  useEffect(() => {
    if (!supplierId) return;
    let cancelled = false;
    void bizApiFetch<GpPurchaseOutstanding>(
      `/biz/gp/purchases/outstanding?supplierId=${supplierId}`,
      { token },
    )
      .then((res) => {
        if (!cancelled) setFetchedOutstanding(res);
      })
      .catch(() => {
        if (!cancelled) setFetchedOutstanding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, token]);

  /** 거래처를 바꾸면 이전 거래처의 미수가 잠깐 남아 보이지 않도록 id 로 한 번 더 맞춘다. */
  const outstanding =
    supplierId && fetchedOutstanding?.supplierId === supplierId ? fetchedOutstanding : null;

  /** 매입처 변경 — 기본해리 프리필은 이벤트에서 한다(effect 에서 하면 연쇄 렌더가 된다). */
  function selectSupplier(nextId: string) {
    setSupplierId(nextId);
    const supplier = suppliers.find((s) => s.id === nextId);
    if (supplier?.hallmarkFactor != null) setDefaultHallmark(String(supplier.hallmarkFactor));
  }

  function setLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  /** 값이 하나라도 들어간 행만 진짜 라인으로 본다. */
  const filledLines = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter(
          ({ line }) =>
            line.note.trim() !== "" ||
            line.purityCode !== "" ||
            line.actualWeightG !== "" ||
            line.unitPrice !== "",
        ),
    [lines],
  );

  /* 화면 미리보기 — 서버 산식과 같은 순서로 계산한다(저장 후 숫자가 달라 보이면 안 된다). */
  const preview = useMemo(() => {
    let purchaseAmount = 0;
    let settledAmount = 0;
    let purchaseGram = 0;
    let settledGram = 0;

    for (const { line } of filledLines) {
      const quantity = Number(line.quantity || "1");
      const unitPrice = line.unitPrice === "" ? null : Number(line.unitPrice);
      const supply = unitPrice != null ? unitPrice * quantity : 0;
      const rate = line.taxRate !== "" ? Number(line.taxRate) : Number(defaultTaxRate || "0");
      const total = supply + (rate ? Math.round((supply * rate) / 100) : 0);

      const weight = line.actualWeightG === "" ? null : Number(line.actualWeightG);
      const hallmark =
        line.hallmarkFactor !== ""
          ? Number(line.hallmarkFactor)
          : defaultHallmark !== ""
            ? Number(defaultHallmark)
            : 1;
      const coefficient = PRICING_FACTOR[line.purityCode] ?? null;
      const pureGram = weight != null && coefficient != null ? weight * coefficient * hallmark : 0;

      if (line.kind === "PURCHASE") {
        purchaseAmount += total;
        purchaseGram += pureGram;
      } else {
        settledAmount += total;
        settledGram += pureGram;
      }
    }

    const before = outstanding?.outstanding ?? { amount: 0, pureGram: 0 };
    return {
      before,
      purchase: { amount: purchaseAmount, pureGram: purchaseGram },
      settled: { amount: settledAmount, pureGram: settledGram },
      after: {
        amount: before.amount + purchaseAmount - settledAmount,
        pureGram: before.pureGram + purchaseGram - settledGram,
      },
    };
  }, [filledLines, defaultHallmark, defaultTaxRate, outstanding]);

  async function submit() {
    if (!supplierId) {
      setMessage({ ok: false, text: "매입처를 선택해 주세요." });
      return;
    }
    if (filledLines.length === 0) {
      setMessage({ ok: false, text: "라인을 한 줄 이상 입력해 주세요." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await bizApiFetch<GpPurchaseDetail>("/biz/gp/purchases", {
        method: "POST",
        token,
        body: {
          purchaseDate,
          supplierId,
          ...(materialGroup ? { materialGroup } : {}),
          ...(defaultHallmark !== "" ? { defaultHallmark: Number(defaultHallmark) } : {}),
          ...(defaultTaxRate !== "" ? { defaultTaxRate: Number(defaultTaxRate) } : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
          lines: filledLines.map(({ line }) => ({
            kind: line.kind,
            ...(line.note.trim() ? { note: line.note.trim() } : {}),
            ...(line.purityCode ? { purityCode: line.purityCode } : {}),
            ...(line.actualWeightG !== "" ? { actualWeightG: Number(line.actualWeightG) } : {}),
            ...(line.hallmarkFactor !== ""
              ? { hallmarkFactor: Number(line.hallmarkFactor) }
              : {}),
            ...(line.quantity !== "" ? { quantity: Math.round(Number(line.quantity)) } : {}),
            ...(line.unitPrice !== "" ? { unitPrice: Math.round(Number(line.unitPrice)) } : {}),
            ...(line.taxRate !== "" ? { taxRate: Number(line.taxRate) } : {}),
          })),
        },
      });
      setDetail(created);
      setLines(Array.from({ length: GRID_ROWS }, () => emptyLine()));
      setMemo("");
      loadList();
      setMessage({ ok: true, text: `저장됐습니다 — 거래번호 ${created.purchaseNo}` });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof BizApiError ? e.message : "저장에 실패했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="px-6 py-5">
        <h1 className="text-[15px] font-extrabold mb-1">매입 등록</h1>
        <p className="text-caption text-[12px] mb-4 leading-relaxed">
          거래처 원장입니다 — 여기서 <b>재고는 만들어지지 않습니다</b>(재고 등록은 직접등록·이관
          화면). 미수는 매입 라인에서 결제·반품 라인을 뺀 값으로 계산합니다.
        </p>

        {/* 헤더 */}
        <div className="flex flex-wrap items-end gap-3 pb-4 border-b border-line">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-caption">매입일</span>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="h-8 px-2 rounded-md border border-line bg-white text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-caption">매입처</span>
            <select
              value={supplierId}
              onChange={(e) => selectSupplier(e.target.value)}
              className="h-8 w-48 px-2 rounded-md border border-line bg-white text-[13px]"
            >
              <option value="">선택</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-caption">재질그룹</span>
            <select
              value={materialGroup}
              onChange={(e) => setMaterialGroup(e.target.value)}
              className="h-8 w-28 px-2 rounded-md border border-line bg-white text-[13px]"
            >
              <option value="">전체</option>
              {GP_PURITY_CODES.filter((c) => c !== "UNKNOWN").map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-caption">기본해리</span>
            <input
              value={defaultHallmark}
              onChange={(e) => setDefaultHallmark(e.target.value)}
              inputMode="decimal"
              placeholder="예 1.100"
              className="h-8 w-24 px-2 rounded-md border border-line bg-white text-[13px] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-caption">기본세율(%)</span>
            <input
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(e.target.value)}
              inputMode="decimal"
              placeholder="예 10"
              className="h-8 w-24 px-2 rounded-md border border-line bg-white text-[13px] text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-[12px] font-semibold text-caption">메모</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-8 px-2 rounded-md border border-line bg-white text-[13px]"
            />
          </label>
        </div>

        <div className="flex gap-5 mt-4">
          {/* 그리드 */}
          <div className="flex-1 min-w-0 overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>구분</th>
                  <th className={th}>비고사항</th>
                  <th className={th}>재질</th>
                  <th className={thNum}>실중량(g)</th>
                  <th className={thNum}>해리</th>
                  <th className={thNum}>수량</th>
                  <th className={thNum}>단가</th>
                  <th className={thNum}>세율(%)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index} className="border-b border-line/50">
                    <td className="px-1 py-0.5 w-24">
                      <select
                        value={line.kind}
                        onChange={(e) =>
                          setLine(index, { kind: e.target.value as GpPurchaseLineKind })
                        }
                        className={cell}
                      >
                        {(Object.keys(GP_PURCHASE_KIND_LABEL) as GpPurchaseLineKind[]).map((k) => (
                          <option key={k} value={k}>
                            {GP_PURCHASE_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5 min-w-[180px]">
                      <input
                        value={line.note}
                        onChange={(e) => setLine(index, { note: e.target.value })}
                        className={cell}
                      />
                    </td>
                    <td className="px-1 py-0.5 w-24">
                      <select
                        value={line.purityCode}
                        onChange={(e) => setLine(index, { purityCode: e.target.value })}
                        className={cell}
                      >
                        <option value="">—</option>
                        {GP_PURITY_CODES.filter((c) => c !== "UNKNOWN").map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5 w-28">
                      <input
                        value={line.actualWeightG}
                        onChange={(e) => setLine(index, { actualWeightG: e.target.value })}
                        inputMode="decimal"
                        className={cellNum}
                      />
                    </td>
                    <td className="px-1 py-0.5 w-24">
                      <input
                        value={line.hallmarkFactor}
                        onChange={(e) => setLine(index, { hallmarkFactor: e.target.value })}
                        inputMode="decimal"
                        placeholder={defaultHallmark || "기본"}
                        className={cellNum}
                      />
                    </td>
                    <td className="px-1 py-0.5 w-20">
                      <input
                        value={line.quantity}
                        onChange={(e) => setLine(index, { quantity: e.target.value })}
                        inputMode="numeric"
                        className={cellNum}
                      />
                    </td>
                    <td className="px-1 py-0.5 w-32">
                      <input
                        value={line.unitPrice}
                        onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                        inputMode="numeric"
                        className={cellNum}
                      />
                    </td>
                    <td className="px-1 py-0.5 w-24">
                      <input
                        value={line.taxRate}
                        onChange={(e) => setLine(index, { taxRate: e.target.value })}
                        inputMode="decimal"
                        placeholder={defaultTaxRate || "기본"}
                        className={cellNum}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 우측 요약 */}
          <aside className="w-72 shrink-0">
            <div className="rounded-lg border border-line p-3">
              <div className="text-[13px] font-extrabold mb-2">
                {outstanding?.supplierName ?? "매입처를 선택하세요"}
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-caption">
                    <th className="text-left font-semibold py-1"> </th>
                    <th className="text-right font-semibold py-1">순금(g)</th>
                    <th className="text-right font-semibold py-1">금액(원)</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["매입 전 미수", preview.before],
                      ["매입", preview.purchase],
                      ["결제 및 반품", preview.settled],
                      ["매입 후 미수", preview.after],
                    ] as const
                  ).map(([label, value], i) => (
                    <tr
                      key={label}
                      className={i === 3 ? "border-t border-line font-bold" : "border-t border-line/50"}
                    >
                      <td className="py-1.5">{label}</td>
                      <td className="py-1.5 text-right tabular-nums">{gram(value.pureGram)}</td>
                      <td className="py-1.5 text-right tabular-nums">{krw(value.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {message ? (
                <div
                  className={`mt-3 text-[12px] font-semibold ${message.ok ? "text-emerald-700" : "text-red-600"}`}
                >
                  {message.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="mt-3 h-9 w-full rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
              >
                {busy ? "저장 중…" : "매입 등록"}
              </button>
            </div>

            {detail ? (
              <div className="mt-3 rounded-lg border border-line p-3 text-[12px]">
                <div className="font-extrabold mb-1">방금 저장 — {detail.purchaseNo}</div>
                <div className="text-caption">
                  매입 {krw(detail.summary.purchase.amount)} · 결제·반품{" "}
                  {krw(detail.summary.settled.amount)}
                </div>
                <div className="font-bold mt-1">
                  매입 후 미수 {krw(detail.summary.after.amount)} ·{" "}
                  {gram(detail.summary.after.pureGram)}g
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        {/* 최근 전표 */}
        <section className="mt-8">
          <h2 className="text-[14px] font-extrabold mb-2">최근 매입 전표</h2>
          {!rows ? (
            <div className="text-caption text-[13px]">불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div className="text-caption text-[13px]">등록된 매입 전표가 없습니다.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>거래번호</th>
                  <th className={th}>매입일</th>
                  <th className={th}>매입처</th>
                  <th className={thNum}>매입</th>
                  <th className={thNum}>결제·반품</th>
                  <th className={th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 text-[13px]">
                    <td className="px-2 py-1.5 tabular-nums">
                      <Link
                        href={`/gp/purchases/${row.id}`}
                        className="text-primary font-semibold hover:underline"
                      >
                        {row.purchaseNo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">{row.purchaseDate}</td>
                    <td className="px-2 py-1.5">{row.supplierName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {krw(row.purchaseAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {krw(row.settledAmount)}
                    </td>
                    <td className="px-2 py-1.5 text-caption">{row.memo ?? "—"}</td>
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

/** 미리보기용 가격 계수 — 서버 GP_PRICING_FACTOR 와 같은 값(24K=1.0). */
const PRICING_FACTOR: Record<string, number> = {
  "24K": 1.0,
  "22K": 0.916,
  "18K": 0.75,
  "14K": 0.585,
  "10K": 0.4167,
  "999": 1.0,
  "925": 0.925,
  "900": 0.9,
};
