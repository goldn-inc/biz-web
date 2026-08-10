"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { DirectRegisterModal } from "@/components/gp/DirectRegisterModal";
import {
  GP_CATEGORY_LABEL,
  GP_EVENT_LABEL,
  GP_METAL_LABEL,
  GP_PURITY_CODES,
  GP_SOURCE_LABEL,
  GP_STATUS_LABEL,
  gram,
  krw,
  kstDate,
  kstDateTime,
  type GpCategory,
  type GpItem,
  type GpItemDetail,
  type GpItemListResponse,
  type GpItemStatus,
  type GpMetalType,
  type GpProductLite,
  type GpSupplier,
} from "@/lib/gp";

const STATUS_OPTIONS: (GpItemStatus | "ALL")[] = [
  "IN_STOCK",
  "RENTED",
  "SOLD",
  "ADJUSTED_OUT",
  "VOID",
  "ALL",
];

/** 드롭다운 공통 스타일 — 조회줄(흰 헤더, 세로선 없음)의 부품. */
const dd = "h-8 px-2 rounded-md border border-line bg-white text-[13px]";

/**
 * GP 재고 목록(§5.1 — 확정 시안 그대로).
 * 조회줄 드롭다운 5 + 검색 + 모델 묶어보기 토글, 격자는 가로선만,
 * 하단 고정 합계줄. 키보드: / 검색 · ↑↓ 행 · Enter 상세 · Esc 닫기 · N 직접등록 · M 묶기.
 */
export default function GpInventoryPage() {
  const { token } = useBizSession();

  const [status, setStatus] = useState<GpItemStatus | "ALL">("IN_STOCK");
  const [metal, setMetal] = useState<GpMetalType | "">("");
  const [purity, setPurity] = useState("");
  const [category, setCategory] = useState<GpCategory | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [groupByModel, setGroupByModel] = useState(false);

  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: GpItemListResponse;
    error?: string;
  } | null>(null);

  const [suppliers, setSuppliers] = useState<GpSupplier[]>([]);
  const [products, setProducts] = useState<GpProductLite[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detail, setDetail] = useState<{ serial: string; data?: GpItemDetail; error?: string } | null>(
    null,
  );
  /** 선택 행 — 요청 키가 바뀌면(필터 변경 등) 자동으로 0 으로 돌아가는 파생 상태. */
  const [selection, setSelection] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [highlightSerial, setHighlightSerial] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const requestKey = [status, metal, purity, category, supplierId, q, groupByModel, reloadCount].join(
    "|",
  );
  const loading = result?.key !== requestKey;
  const data = !loading ? result?.data : undefined;
  const loadError = !loading ? (result?.error ?? null) : null;
  const rows: GpItem[] = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const summary = data?.summary;
  const rowCount = groupByModel ? groups.length : rows.length;

  const selectedIndex = selection.key === requestKey ? selection.index : 0;
  const setSelectedIndex = useCallback(
    (next: number | ((i: number) => number)) => {
      setSelection((cur) => {
        const curIndex = cur.key === requestKey ? cur.index : 0;
        return { key: requestKey, index: typeof next === "function" ? next(curIndex) : next };
      });
    },
    [requestKey],
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("status", status);
    if (metal) params.set("metal", metal);
    if (purity) params.set("purity", purity);
    if (category) params.set("category", category);
    if (supplierId) params.set("supplierId", supplierId);
    if (q) params.set("q", q);
    if (groupByModel) params.set("groupByModel", "true");
    void (async () => {
      try {
        const res = await bizApiFetch<GpItemListResponse>(`/biz/gp/items?${params.toString()}`, {
          token,
        });
        if (!cancelled) setResult({ key: requestKey, data: res });
      } catch (error) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error: error instanceof BizApiError ? error.message : "재고를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, metal, purity, category, supplierId, q, groupByModel, reloadCount, requestKey, token]);

  /** 폼 드롭다운 데이터 — 화면 진입·등록 후에만 갱신하면 충분하다. */
  const loadFormData = useCallback(() => {
    void bizApiFetch<{ suppliers: GpSupplier[] }>("/biz/gp/suppliers", { token })
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers([]));
    void bizApiFetch<{ products: GpProductLite[] }>("/biz/gp/products", { token })
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [token]);
  useEffect(loadFormData, [loadFormData]);

  const refresh = useCallback(() => setReloadCount((n) => n + 1), []);

  const openDetail = useCallback(
    (serial: string) => {
      setDetail({ serial });
      void bizApiFetch<GpItemDetail>(`/biz/gp/items/${encodeURIComponent(serial)}`, { token })
        .then((d) => setDetail((cur) => (cur?.serial === serial ? { serial, data: d } : cur)))
        .catch((error) =>
          setDetail((cur) =>
            cur?.serial === serial
              ? {
                  serial,
                  error:
                    error instanceof BizApiError ? error.message : "상세를 불러오지 못했습니다.",
                }
              : cur,
          ),
        );
    },
    [token],
  );

  /** 키보드 동선(§5 공통) — 입력 중에는 목록 단축키를 먹지 않는다. */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "Escape") {
        if (registerOpen) setRegisterOpen(false);
        else if (detail) setDetail(null);
        else if (typing) target.blur();
        return;
      }
      if (typing || registerOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (!groupByModel && rows[selectedIndex]) openDetail(rows[selectedIndex].serial);
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setRegisterOpen(true);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setGroupByModel((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rows, rowCount, selectedIndex, setSelectedIndex, groupByModel, registerOpen, detail, openDetail]);

  /** 선택 행이 화면 밖이면 따라 스크롤. */
  useEffect(() => {
    tableRef.current
      ?.querySelector(`[data-row-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  /** 현재 격자를 그대로 CSV 로 — 서버 전체 내보내기(GET /biz/gp/export)는 후속. */
  const exportCsv = useCallback(() => {
    const esc = (v: string | number | null) => {
      const s = v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const lines = groupByModel
      ? [
          ["품명", "분류", "재질", "순도", "수량", "중량합(g)", "순중량합(g)"].join(","),
          ...groups.map((g) =>
            [
              esc(g.productName),
              GP_CATEGORY_LABEL[g.category],
              GP_METAL_LABEL[g.metalType],
              g.purityCode,
              g.count,
              g.weightSum,
              g.pureGramSum,
            ].join(","),
          ),
        ]
      : [
          [
            "시리얼",
            "품명",
            "분류",
            "재질",
            "순도",
            "실중량(g)",
            "순중량(g)",
            "매입공임",
            "입고처",
            "입고일",
            "상태",
          ].join(","),
          ...rows.map((r) =>
            [
              r.serial,
              esc(r.productName),
              GP_CATEGORY_LABEL[r.category],
              GP_METAL_LABEL[r.metalType],
              r.purityCode,
              r.weightG ?? "",
              r.pureGram ?? "",
              r.acquiredLaborFee ?? "",
              esc(r.supplierName),
              kstDate(r.receivedAt),
              GP_STATUS_LABEL[r.status],
            ].join(","),
          ),
        ];
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const stamp = kst.toISOString().slice(0, 10).replaceAll("-", "");
    const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gp-재고-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, groups, groupByModel]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const thNum = `${th} text-right`;
  const td = "px-2 py-1.5 whitespace-nowrap";
  const tdNum = `${td} text-right tabular-nums`;

  const statusChip = useMemo(
    () => ({
      IN_STOCK: "bg-emerald-50 text-emerald-700",
      RENTED: "bg-amber-50 text-amber-700",
      SOLD: "bg-slate-100 text-slate-500",
      ADJUSTED_OUT: "bg-red-50 text-red-600",
      VOID: "bg-slate-100 text-slate-400 line-through",
    }),
    [],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 타이틀 + 조회줄 — 흰 헤더, 강한 위계 */}
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">재고 목록</h1>
          <span className="text-caption text-[12px]">
            {loading ? "불러오는 중…" : `${rowCount.toLocaleString()}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={refresh}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
              title="단축키 N"
            >
              직접등록
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

        <div className="flex flex-wrap items-center gap-1.5">
          <select value={status} onChange={(e) => setStatus(e.target.value as GpItemStatus | "ALL")} className={dd}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "상태: 전체" : `상태: ${GP_STATUS_LABEL[s]}`}
              </option>
            ))}
          </select>
          <select value={metal} onChange={(e) => setMetal(e.target.value as GpMetalType | "")} className={dd}>
            <option value="">재질: 전체</option>
            <option value="GOLD">재질: 금</option>
            <option value="SILVER">재질: 은</option>
          </select>
          <select value={purity} onChange={(e) => setPurity(e.target.value)} className={dd}>
            <option value="">순도: 전체</option>
            {GP_PURITY_CODES.map((p) => (
              <option key={p} value={p}>
                순도: {p === "UNKNOWN" ? "미상" : p}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value as GpCategory | "")} className={dd}>
            <option value="">분류: 전체</option>
            {(Object.keys(GP_CATEGORY_LABEL) as GpCategory[]).map((c) => (
              <option key={c} value={c}>
                분류: {GP_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={dd}>
            <option value="">입고처: 전체</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                입고처: {s.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 ml-1">
            <input
              ref={searchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQ(qInput.trim());
              }}
              placeholder="시리얼·품명 검색  ( / )"
              className="h-8 w-52 px-2 rounded-md border border-line bg-white"
            />
            <button
              type="button"
              onClick={() => setQ(qInput.trim())}
              className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              검색
            </button>
          </div>

          <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none" title="단축키 M">
            <input
              type="checkbox"
              checked={groupByModel}
              onChange={(e) => setGroupByModel(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-semibold">모델 묶어보기</span>
          </label>
        </div>
      </div>

      {/* 격자 — 가로선만, 세로 격자선 없음 */}
      <div ref={tableRef} className="flex-1 overflow-auto bg-white">
        {loadError ? (
          <div className="p-6 text-center text-red-600">{loadError}</div>
        ) : rowCount === 0 && !loading ? (
          <div className="p-10 text-center text-caption">
            조건에 맞는 재고가 없습니다. 직접등록(N)으로 첫 개체를 올리거나 발주·입고에서
            도매 물건을 스캔하세요.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              {groupByModel ? (
                <tr>
                  <th className={th}>No</th>
                  <th className={th}>품명</th>
                  <th className={th}>분류</th>
                  <th className={th}>재질</th>
                  <th className={th}>순도</th>
                  <th className={thNum}>수량</th>
                  <th className={thNum}>중량합(g)</th>
                  <th className={thNum}>순중량합(g)</th>
                </tr>
              ) : (
                <tr>
                  <th className={th}>No</th>
                  <th className={th}>시리얼</th>
                  <th className={th}>품명</th>
                  <th className={th}>분류</th>
                  <th className={th}>재질</th>
                  <th className={th}>순도</th>
                  <th className={thNum}>실중량(g)</th>
                  <th className={thNum}>순중량(g)</th>
                  <th className={thNum}>매입공임</th>
                  <th className={th}>입고처</th>
                  <th className={th}>입고일</th>
                  <th className={th}>상태</th>
                </tr>
              )}
            </thead>
            <tbody>
              {groupByModel
                ? groups.map((g, i) => (
                    <tr
                      key={g.gpProductId}
                      data-row-index={i}
                      onClick={() => setSelectedIndex(i)}
                      className={`border-b border-line/70 cursor-default ${
                        i === selectedIndex ? "bg-orange-50" : "hover:bg-surface"
                      }`}
                    >
                      <td className={tdNum}>{i + 1}</td>
                      <td className={`${td} font-semibold`}>{g.productName}</td>
                      <td className={td}>{GP_CATEGORY_LABEL[g.category]}</td>
                      <td className={td}>{GP_METAL_LABEL[g.metalType]}</td>
                      <td className={td}>{g.purityCode}</td>
                      <td className={`${tdNum} font-bold`}>{g.count}</td>
                      <td className={tdNum}>{gram(g.weightSum)}</td>
                      <td className={tdNum}>{gram(g.pureGramSum)}</td>
                    </tr>
                  ))
                : rows.map((r, i) => (
                    <tr
                      key={r.id}
                      data-row-index={i}
                      onClick={() => setSelectedIndex(i)}
                      onDoubleClick={() => openDetail(r.serial)}
                      className={`border-b border-line/70 cursor-default ${
                        r.serial === highlightSerial
                          ? "bg-emerald-50"
                          : i === selectedIndex
                            ? "bg-orange-50"
                            : "hover:bg-surface"
                      }`}
                    >
                      <td className={tdNum}>{i + 1}</td>
                      <td className={`${td} font-mono text-[12px]`}>{r.serial}</td>
                      <td className={`${td} font-semibold`}>{r.productName}</td>
                      <td className={td}>{GP_CATEGORY_LABEL[r.category]}</td>
                      <td className={td}>{GP_METAL_LABEL[r.metalType]}</td>
                      <td className={td}>{r.purityCode === "UNKNOWN" ? "미상" : r.purityCode}</td>
                      <td className={tdNum}>{gram(r.weightG)}</td>
                      <td className={tdNum}>{gram(r.pureGram)}</td>
                      <td className={tdNum}>{krw(r.acquiredLaborFee)}</td>
                      <td className={td}>{r.supplierName ?? (r.source === "WHOLESALE" ? "본사(도매)" : "—")}</td>
                      <td className={td}>{kstDate(r.receivedAt)}</td>
                      <td className={td}>
                        <span className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${statusChip[r.status]}`}>
                          {GP_STATUS_LABEL[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 하단 고정 합계줄 — 필터와 무관한 매장 전체 기준 */}
      <div className="shrink-0 h-9 px-4 flex items-center gap-4 border-t border-line bg-surface text-[12px]">
        {summary ? (
          <>
            <span>
              재고 <b className="tabular-nums">{summary.inStockCount.toLocaleString()}</b>
            </span>
            <span>
              대여 <b className="tabular-nums">{summary.rentedCount.toLocaleString()}</b>
            </span>
            <span>
              이달 판매 <b className="tabular-nums">{summary.soldThisMonthCount.toLocaleString()}</b>
            </span>
            <span className="ml-auto">
              금 순중량 <b className="tabular-nums">{gram(summary.goldPureGramSum)}g</b>
            </span>
            <span>
              은 순중량 <b className="tabular-nums">{gram(summary.silverPureGramSum)}g</b>
            </span>
            {summary.unconvertibleCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                환산 불가 {summary.unconvertibleCount}건
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-caption">합계 계산 중…</span>
        )}
      </div>

      {registerOpen ? (
        <DirectRegisterModal
          token={token}
          products={products}
          suppliers={suppliers}
          onClose={() => setRegisterOpen(false)}
          onRegistered={(item) => {
            setRegisterOpen(false);
            setHighlightSerial(item.serial);
            loadFormData();
            refresh();
          }}
        />
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-40" onMouseDown={() => setDetail(null)}>
          <aside
            className="absolute right-0 top-0 h-full w-[360px] bg-white border-l border-line shadow-xl p-4 overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-[14px] font-mono">{detail.serial}</h2>
              <button type="button" onClick={() => setDetail(null)} className="text-caption hover:text-ink px-1">
                ✕ <span className="text-[11px]">Esc</span>
              </button>
            </div>
            {detail.error ? (
              <div className="text-red-600">{detail.error}</div>
            ) : !detail.data ? (
              <div className="text-caption">불러오는 중…</div>
            ) : (
              <div className="flex flex-col gap-3">
                <dl className="grid grid-cols-[88px_1fr] gap-y-1.5 text-[13px]">
                  {(
                    [
                      ["품명", detail.data.productName],
                      ["분류", GP_CATEGORY_LABEL[detail.data.category]],
                      ["재질", GP_METAL_LABEL[detail.data.metalType]],
                      ["순도", detail.data.purityCode === "UNKNOWN" ? "미상" : detail.data.purityCode],
                      ["실중량", `${gram(detail.data.weightG)}g`],
                      ["순중량", `${gram(detail.data.pureGram)}g`],
                      ["매입원가", krw(detail.data.acquiredUnitCost)],
                      ["매입공임", krw(detail.data.acquiredLaborFee)],
                      ["입고 경로", GP_SOURCE_LABEL[detail.data.source]],
                      ["입고처", detail.data.supplierName ?? (detail.data.source === "WHOLESALE" ? "본사(도매)" : "—")],
                      ["입고일", kstDateTime(detail.data.receivedAt)],
                      ["상태", GP_STATUS_LABEL[detail.data.status]],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-caption">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <div className="text-[12px] font-bold text-caption mb-1">이력</div>
                  <ul className="flex flex-col gap-1">
                    {detail.data.events.map((ev, i) => (
                      <li key={i} className="flex items-center gap-2 border-b border-line/60 pb-1">
                        <span className="font-semibold">{GP_EVENT_LABEL[ev.eventType] ?? ev.eventType}</span>
                        <span className="ml-auto text-caption tabular-nums">{kstDateTime(ev.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
