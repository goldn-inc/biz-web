"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiDownload, bizApiFetch, BizApiError } from "@/lib/api";
import { DirectRegisterModal } from "@/components/gp/DirectRegisterModal";
import {
  GP_ACQUIRE_LABEL,
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
  type GpAcquireType,
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

/** 한 번에 받는 개체 수 — 서버 기본값과 같게 둔다(백엔드 DEFAULT_ITEM_PAGE_SIZE). */
const PAGE_SIZE = 200;

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
  const [acquireType, setAcquireType] = useState<GpAcquireType | "">("");
  const [supplierId, setSupplierId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [groupByModel, setGroupByModel] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  /**
   * 개체는 판매돼도 SOLD 로 남아 계속 쌓인다 — 「전체」 조회는 재고 수백 개인 매장에서도
   * 몇 년이면 만 단위가 된다. 서버 기본 200행을 받고 「더 보기」로 **뒤를 이어 붙인다.**
   * (예전에는 limit 을 200씩 키워 전체를 다시 받았는데, 세 번째 클릭이 서버 상한 500 을
   * 넘겨 400 으로 떨어지면서 이미 그려진 행까지 사라졌다.)
   */
  const [result, setResult] = useState<{
    key: string;
    data?: GpItemListResponse;
    error?: string;
  } | null>(null);
  /** 「더 보기」 실패 — 이미 그려진 행은 그대로 두고 이 문구만 띄운다. */
  const [moreErrorState, setMoreErrorState] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);

  // null = 조회 실패. 빈 배열(=진짜 0건)과 섞으면 모델이 있는 매장에 「기존 모델」을 잠근다.
  const [suppliers, setSuppliers] = useState<GpSupplier[] | null>([]);
  const [products, setProducts] = useState<GpProductLite[] | null>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  /** 카다로그 「이 모델로 직접등록」(§8.4) — ?register=<gpProductId> 로 진입하면 프리셀렉트 오픈. */
  const [urlRegisterProductId, setUrlRegisterProductId] = useState<string | null>(null);
  const pendingRegisterRef = useRef<string | null>(
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("register"),
  );
  const [detail, setDetail] = useState<{ serial: string; data?: GpItemDetail; error?: string } | null>(
    null,
  );
  /** 선택 행 — 요청 키가 바뀌면(필터 변경 등) 자동으로 0 으로 돌아가는 파생 상태. */
  const [selection, setSelection] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [highlightSerial, setHighlightSerial] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  /** 필터 축만 모은 키 — 필터가 바뀌면 「더 보기」로 이어 붙인 것을 버리고 처음부터 받는다. */
  const filterKey = [status, metal, purity, category, acquireType, supplierId, q, groupByModel].join(
    "|",
  );

  /**
   * 요청 키에 페이지를 넣지 않는다 — 「더 보기」는 뒤를 이어 붙일 뿐 다른 요청이 아니다.
   * 넣으면 더 볼 때마다 선택 행이 첫 줄로 튄다.
   */
  const requestKey = [filterKey, reloadCount].join("|");

  /**
   * 필터를 쿼리스트링으로. 묶어보기는 행이 개체 수가 아니라 **모델 수**라 SOLD 가 쌓여도
   * 늘지 않는다 — 그래서 묶어보기에만 페이지가 없다(여기만 limit 을 안 붙이는 이유).
   */
  const buildParams = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      params.set("status", status);
      if (metal) params.set("metal", metal);
      if (purity) params.set("purity", purity);
      if (category) params.set("category", category);
      if (acquireType) params.set("acquireType", acquireType);
      if (supplierId) params.set("supplierId", supplierId);
      if (q) params.set("q", q);
      if (groupByModel) {
        params.set("groupByModel", "true");
      } else {
        params.set("limit", String(PAGE_SIZE));
        if (offset > 0) params.set("offset", String(offset));
      }
      return params;
    },
    [status, metal, purity, category, acquireType, supplierId, q, groupByModel],
  );
  const loading = result?.key !== requestKey;
  const data = !loading ? result?.data : undefined;
  const loadError = !loading ? (result?.error ?? null) : null;
  const moreError = moreErrorState?.key === requestKey ? moreErrorState.message : null;
  const rows: GpItem[] = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const summary = data?.summary;
  const rowCount = groupByModel ? groups.length : rows.length;

  /** 「더 보기」 — 전체를 다시 받지 않고 offset 뒤만 이어 붙인다. 실패해도 기존 행은 남긴다. */
  const showMore = useCallback(() => {
    if (!data?.hasMore || loadingMore) return;
    const key = requestKey;
    const offset = rows.length;
    setLoadingMore(true);
    setMoreErrorState(null);
    void (async () => {
      try {
        const res = await bizApiFetch<GpItemListResponse>(
          `/biz/gp/items?${buildParams(offset).toString()}`,
          { token },
        );
        // 이어 붙이는 동안 필터가 바뀌었으면 버린다 — 다른 필터의 개체가 섞이면 안 된다.
        setResult((cur) =>
          cur?.key === key && cur.data
            ? { key, data: { ...res, items: [...cur.data.items, ...res.items] } }
            : cur,
        );
      } catch (error) {
        setMoreErrorState({
          key,
          message: error instanceof BizApiError ? error.message : "더 불러오지 못했습니다.",
        });
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [data, loadingMore, requestKey, rows.length, buildParams, token]);

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
    void (async () => {
      try {
        const res = await bizApiFetch<GpItemListResponse>(
          `/biz/gp/items?${buildParams(0).toString()}`,
          { token },
        );
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
  }, [buildParams, requestKey, token]);

  /** 폼 드롭다운 데이터 — 화면 진입·등록 후에만 갱신하면 충분하다. */
  const loadFormData = useCallback(() => {
    void bizApiFetch<{ suppliers: GpSupplier[] }>("/biz/gp/suppliers", { token })
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers(null));
    void bizApiFetch<{ products: GpProductLite[] }>("/biz/gp/products", { token })
      .then((r) => {
        setProducts(r.products);
        // URL 프리셀렉트는 모델 목록이 온 뒤에 열어야 프리필이 성립한다(§8.4)
        if (pendingRegisterRef.current) {
          setUrlRegisterProductId(pendingRegisterRef.current);
          pendingRegisterRef.current = null;
          setRegisterOpen(true);
        }
      })
      .catch(() => setProducts(null));
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

  /**
   * 묶어보기 CSV — groups 는 이미 필터 전체를 GROUP BY 로 집계한 값이라(§listGroups)
   * 페이지 상한과 무관하게 완전하다. 그대로 클라이언트에서 만든다.
   * 개체별 CSV는 화면에 로드된 rows(최대 500)만으로는 불완전해서, 서버가 필터 전체를
   * 상한 없이 뽑는 GET /biz/gp/export 를 호출한다.
   */
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportCsv = useCallback(() => {
    if (groupByModel) {
      const esc = (v: string | number | null) => {
        const s = v === null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
      };
      const lines = [
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
      ];
      const kst = new Date(Date.now() + 9 * 3600 * 1000);
      const stamp = kst.toISOString().slice(0, 10).replaceAll("-", "");
      const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gp-재고-모델별-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const params = new URLSearchParams();
    params.set("status", status);
    if (metal) params.set("metal", metal);
    if (purity) params.set("purity", purity);
    if (category) params.set("category", category);
    if (acquireType) params.set("acquireType", acquireType);
    if (supplierId) params.set("supplierId", supplierId);
    if (q) params.set("q", q);
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const stamp = kst.toISOString().slice(0, 10).replaceAll("-", "");
    setExporting(true);
    setExportError(null);
    void bizApiDownload(`/biz/gp/export?${params.toString()}`, `gp-재고-${stamp}.csv`, token)
      .catch((error) =>
        setExportError(error instanceof BizApiError ? error.message : "CSV를 내려받지 못했습니다."),
      )
      .finally(() => setExporting(false));
  }, [groupByModel, groups, status, metal, purity, category, acquireType, supplierId, q, token]);

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
            {loading
              ? "불러오는 중…"
              : /* 헤더는 필터에 걸린 전체 수 기준 — 「불러온 행 수」를 찍으면 200에서 멈춰,
                   같은 화면 하단의 「200 / 1,530 표시」와 다른 숫자를 말한다. */
                groupByModel
                ? `${groups.length.toLocaleString()}건`
                : data?.total != null && data.total > rows.length
                  ? `${data.total.toLocaleString()}건 (${rows.length.toLocaleString()} 표시)`
                  : `${rowCount.toLocaleString()}건`}
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
              disabled={exporting}
              title={groupByModel ? undefined : "현재 필터에 걸린 전체 재고를 내려받습니다"}
              className="h-8 px-3 rounded-md bg-primary hover:bg-primary-light text-white font-bold disabled:opacity-50"
            >
              {exporting ? "내려받는 중…" : "엑셀"}
            </button>
            {exportError ? <span className="text-[12px] text-red-600">{exportError}</span> : null}
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
          <select
            value={acquireType}
            onChange={(e) => setAcquireType(e.target.value as GpAcquireType | "")}
            className={dd}
          >
            <option value="">매입구분: 전체</option>
            <option value="NEW">매입구분: 사입</option>
            <option value="USED_BUY">매입구분: 고금매입</option>
          </select>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={dd}>
            <option value="">입고처: 전체</option>
            {(suppliers ?? []).map((s) => (
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
                  <th className={th}>스톤(메인/보조)</th>
                  <th className={thNum}>실중량(g)</th>
                  <th className={thNum}>순중량(g)</th>
                  <th className={thNum}>매입공임</th>
                  <th className={thNum}>원가</th>
                  <th className={thNum}>소비자가(TAG)</th>
                  <th className={th}>매입구분</th>
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
                      <td className={td}>
                        {[r.mainStoneName, r.subStoneName].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className={tdNum}>{gram(r.weightG)}</td>
                      <td className={tdNum}>{gram(r.pureGram)}</td>
                      <td className={tdNum}>{krw(r.acquiredLaborFee)}</td>
                      {/* IMPORT 만 시세로 재계산된다 — 나머지는 매입 시점 스냅샷이라 구분해 보여준다. */}
                      <td className={tdNum}>
                        {krw(r.spotCost)}
                        {r.isSpotLinkedCost ? (
                          <span className="ml-1 text-[10px] text-caption font-semibold">시세</span>
                        ) : null}
                      </td>
                      <td className={`${tdNum} font-semibold text-red-600`}>
                        {r.tagPriceSource === "SPOT"
                          ? krw(r.linkedTagPrice)
                          : r.tagPriceSource === "FIXED"
                            ? krw(r.tagPrice)
                            : "—"}
                        {r.tagPriceSource === "SPOT" ? (
                          <span className="ml-1 text-[10px] text-caption font-semibold">시세</span>
                        ) : null}
                      </td>
                      <td className={td}>{r.acquireType ? GP_ACQUIRE_LABEL[r.acquireType] : "—"}</td>
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
            {/* 보유 금속가치 — 순금 총량 × 시세. 파는 값이 아니라 갖고 있는 금속의 값이다. */}
            {summary.metalValueKrw !== null ? (
              <span
                title={
                  `금 ${gram(summary.goldPureGramSum)}g × ${krw(summary.goldSpotKrwPerGram)}` +
                  (summary.silverSpotKrwPerGram
                    ? ` + 은 ${gram(summary.silverPureGramSum)}g × ${krw(summary.silverSpotKrwPerGram)}`
                    : "") +
                  (summary.spotAsOf ? ` · ${summary.spotAsOf} 시세` : "")
                }
                className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold"
              >
                금속가치 <b className="tabular-nums">{krw(summary.metalValueKrw)}</b>
              </span>
            ) : null}
            {summary.unconvertibleCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                환산 불가 {summary.unconvertibleCount}건
              </span>
            ) : null}
            {!groupByModel && data && (data.hasMore || moreError) ? (
              <>
                <span className="text-caption tabular-nums">
                  {rows.length.toLocaleString()} / {(data.total ?? 0).toLocaleString()} 표시
                </span>
                <button
                  type="button"
                  onClick={showMore}
                  disabled={loadingMore}
                  className="h-6 px-2 rounded border border-line bg-white font-semibold hover:bg-surface disabled:opacity-50"
                >
                  {loadingMore ? "불러오는 중…" : "더 보기"}
                </button>
                {moreError ? <span className="text-red-600">{moreError}</span> : null}
              </>
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
          initialProductId={urlRegisterProductId ?? undefined}
          onClose={() => {
            setRegisterOpen(false);
            setUrlRegisterProductId(null);
          }}
          onRegistered={(item) => {
            setRegisterOpen(false);
            setUrlRegisterProductId(null);
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
              <div className="flex items-center gap-2">
                <a
                  href={`/gp/inventory/${encodeURIComponent(detail.serial)}`}
                  className="text-[12px] text-primary font-semibold hover:underline"
                  title="액션(라벨·대여·수정·VOID)과 전체 이력은 상세 페이지에서"
                >
                  전체 상세 →
                </a>
                <button type="button" onClick={() => setDetail(null)} className="text-caption hover:text-ink px-1">
                  ✕ <span className="text-[11px]">Esc</span>
                </button>
              </div>
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
                      [
                        detail.data.isSpotLinkedCost ? "원가(시세 반영)" : "원가",
                        krw(detail.data.spotCost),
                      ],
                      ["적용 해리", detail.data.effectiveHallmark.toFixed(3)],
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
