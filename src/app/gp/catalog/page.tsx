"use client";

/* eslint-disable @next/next/no-img-element -- R2 public 이미지, next/image 최적화 불필요(격자 썸네일) */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, bizApiUpload, BizApiError } from "@/lib/api";
import {
  GP_CATEGORY_LABEL,
  GP_METAL_LABEL,
  GP_PURITIES_BY_METAL,
  gram,
  krw,
  type GpCatalogProduct,
  type GpCategory,
  type GpMetalType,
  type GpStoneRow,
  type GpSupplier,
} from "@/lib/gp";

const dd = "h-8 px-2 rounded-md border border-line bg-white text-[13px]";
const NEW_SUPPLIER = "__new__";
const NEW_STONE = "__new__";

/** 스톤 표기 — 이관 카다로그는 사전 이름 없이 알값만 오므로 금액이라도 보여준다. */
function stoneText(p: GpCatalogProduct): string | null {
  const part = (name: string | null, fee: number | null) =>
    name && fee ? `${name} ${krw(fee)}` : (name ?? (fee ? krw(fee) : null));
  const main = part(p.mainStoneName, p.mainStoneFee);
  const sub = part(p.subStoneName, p.subStoneFee);
  if (!main && !sub) return null;
  return `${main ?? "—"} / ${sub ?? "—"}`;
}

type FormState = {
  name: string;
  category: GpCategory;
  metalType: GpMetalType;
  purityCode: string;
  defaultWeightGram: string;
  defaultLaborFeeKrw: string;
  defaultTagPrice: string;
  code: string;
  hallmarkFactor: string;
  supplierSel: string;
  newSupplierName: string;
  // §9 — 메인/보조 스톤 + 스톤 공임
  mainStoneSel: string;
  newMainStoneName: string;
  mainStoneFee: string;
  subStoneSel: string;
  newSubStoneName: string;
  subStoneFee: string;
  imageKey: string | null;
  imageUrl: string | null;
  memo: string;
  isActive: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    category: "RING",
    metalType: "GOLD",
    purityCode: "24K",
    defaultWeightGram: "",
    defaultLaborFeeKrw: "",
    defaultTagPrice: "",
    code: "",
    hallmarkFactor: "",
    supplierSel: "",
    newSupplierName: "",
    mainStoneSel: "",
    newMainStoneName: "",
    mainStoneFee: "",
    subStoneSel: "",
    newSubStoneName: "",
    subStoneFee: "",
    imageKey: null,
    imageUrl: null,
    memo: "",
    isActive: true,
  };
}

function toForm(p: GpCatalogProduct): FormState {
  return {
    name: p.name,
    category: p.category,
    metalType: p.metalType,
    purityCode: p.purityCode,
    defaultWeightGram: p.defaultWeightGram != null ? String(p.defaultWeightGram) : "",
    defaultLaborFeeKrw: p.defaultLaborFeeKrw != null ? String(p.defaultLaborFeeKrw) : "",
    defaultTagPrice: p.defaultTagPrice != null ? String(p.defaultTagPrice) : "",
    code: p.code ?? "",
    hallmarkFactor: p.hallmarkFactor != null ? String(p.hallmarkFactor) : "",
    supplierSel: p.supplierId ?? "",
    newSupplierName: "",
    mainStoneSel: p.mainStoneId ?? "",
    newMainStoneName: "",
    mainStoneFee: p.mainStoneFee != null ? String(p.mainStoneFee) : "",
    subStoneSel: p.subStoneId ?? "",
    newSubStoneName: "",
    subStoneFee: p.subStoneFee != null ? String(p.subStoneFee) : "",
    imageKey: p.imageKey,
    imageUrl: p.imageUrl,
    memo: p.memo ?? "",
    isActive: p.isActive,
  };
}

/**
 * GP 카다로그(§8.4·§8.5) — 골드펜 카다로그 대응. 사진 카드 그리드가 기본, 표 보기 토글.
 * 카드에서 수정·「이 모델로 직접등록」. 사진은 백엔드 프록시 업로드(R2 public).
 */
export default function GpCatalogPage() {
  const { token } = useBizSession();

  const [category, setCategory] = useState<GpCategory | "">("");
  const [metal, setMetal] = useState<GpMetalType | "">("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  const [reload, setReload] = useState(0);
  /** 스톤 사전의 모델건수 클릭 점프(§9.1) — ?stone=<id> 로 진입하면 필터. */
  const [stoneFilter, setStoneFilter] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("stone"),
  );

  const [rows, setRows] = useState<GpCatalogProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<GpSupplier[]>([]);
  const [stones, setStones] = useState<GpStoneRow[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (metal) params.set("metal", metal);
    if (includeInactive) params.set("includeInactive", "true");
    if (q) params.set("q", q);
    if (stoneFilter) params.set("stoneId", stoneFilter);
    void bizApiFetch<{ products: GpCatalogProduct[] }>(
      `/biz/gp/products?${params.toString()}`,
      { token },
    )
      .then((r) => {
        if (!cancelled) {
          setRows(r.products);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof BizApiError ? error.message : "카다로그를 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, category, metal, includeInactive, q, stoneFilter, reload]);

  useEffect(() => {
    void bizApiFetch<{ suppliers: GpSupplier[] }>("/biz/gp/suppliers", { token })
      .then((r) => setSuppliers(r.suppliers))
      .catch(() => setSuppliers([]));
    void bizApiFetch<{ stones: GpStoneRow[] }>("/biz/gp/stones", { token })
      .then((r) => setStones(r.stones))
      .catch(() => setStones([]));
  }, [token, reload]);

  const uploadImage = useCallback(
    (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      setUploading(true);
      setSaveError(null);
      void bizApiUpload<{ key: string; url: string }>("/biz/gp/products/images", formData, token)
        .then((r) =>
          setEditing((c) => c && { ...c, form: { ...c.form, imageKey: r.key, imageUrl: r.url } }),
        )
        .catch((error) =>
          setSaveError(
            error instanceof BizApiError ? error.message : "이미지 업로드에 실패했습니다.",
          ),
        )
        .finally(() => setUploading(false));
    },
    [token],
  );

  const save = useCallback(() => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) {
      setSaveError("품명을 입력하세요.");
      return;
    }
    const num = (v: string) => (v.trim() ? Number(v) : undefined);
    const body = {
      name: f.name.trim(),
      category: f.category,
      metalType: f.metalType,
      purityCode: f.purityCode,
      defaultWeightGram: num(f.defaultWeightGram),
      defaultLaborFeeKrw: num(f.defaultLaborFeeKrw),
      defaultTagPrice: num(f.defaultTagPrice),
      ...(f.code.trim() ? { code: f.code.trim() } : {}),
      ...(f.hallmarkFactor.trim() ? { hallmarkFactor: Number(f.hallmarkFactor) } : {}),
      ...(f.supplierSel && f.supplierSel !== NEW_SUPPLIER ? { supplierId: f.supplierSel } : {}),
      ...(f.supplierSel === NEW_SUPPLIER && f.newSupplierName.trim()
        ? { newSupplierName: f.newSupplierName.trim() }
        : {}),
      // §9 — 스톤: 선택/인라인 생성/해제(수정에서 「없음」)
      ...(f.mainStoneSel && f.mainStoneSel !== NEW_STONE ? { mainStoneId: f.mainStoneSel } : {}),
      ...(f.mainStoneSel === NEW_STONE && f.newMainStoneName.trim()
        ? { newMainStoneName: f.newMainStoneName.trim() }
        : {}),
      ...(editing.id && !f.mainStoneSel ? { clearMainStone: true } : {}),
      mainStoneFee: f.mainStoneSel ? num(f.mainStoneFee) : undefined,
      ...(f.subStoneSel && f.subStoneSel !== NEW_STONE ? { subStoneId: f.subStoneSel } : {}),
      ...(f.subStoneSel === NEW_STONE && f.newSubStoneName.trim()
        ? { newSubStoneName: f.newSubStoneName.trim() }
        : {}),
      ...(editing.id && !f.subStoneSel ? { clearSubStone: true } : {}),
      subStoneFee: f.subStoneSel ? num(f.subStoneFee) : undefined,
      ...(f.imageKey ? { imageKey: f.imageKey } : {}),
      memo: f.memo.trim() || undefined,
      ...(editing.id ? { isActive: f.isActive } : {}),
    };
    setSaving(true);
    setSaveError(null);
    void (async () => {
      try {
        if (editing.id) {
          await bizApiFetch(`/biz/gp/products/${editing.id}`, { method: "PATCH", body, token });
        } else {
          await bizApiFetch("/biz/gp/products", { method: "POST", body, token });
        }
        setEditing(null);
        setReload((n) => n + 1);
      } catch (error) {
        setSaveError(error instanceof BizApiError ? error.message : "저장에 실패했습니다.");
      } finally {
        setSaving(false);
      }
    })();
  }, [editing, token]);

  const purityOptions = editing ? GP_PURITIES_BY_METAL[editing.form.metalType] : [];

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";
  const field = "h-8 px-2 rounded-md border border-line bg-white w-full";
  const label = "text-[12px] font-bold text-caption";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">카다로그</h1>
          <span className="text-caption text-[12px]">
            {rows === null ? "불러오는 중…" : `${rows.length.toLocaleString()}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex rounded-md border border-line overflow-hidden">
              {(
                [
                  ["card", "카드"],
                  ["table", "목록"],
                ] as const
              ).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`h-8 px-3 text-[13px] ${
                    view === v ? "bg-surface font-bold text-primary" : "text-body hover:bg-surface"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setEditing({ id: null, form: emptyForm() })}
              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              모델 등록
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as GpCategory | "")}
            className={dd}
          >
            <option value="">분류: 전체</option>
            {(Object.keys(GP_CATEGORY_LABEL) as GpCategory[]).map((c) => (
              <option key={c} value={c}>
                분류: {GP_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            value={metal}
            onChange={(e) => setMetal(e.target.value as GpMetalType | "")}
            className={dd}
          >
            <option value="">재질: 전체</option>
            <option value="GOLD">재질: 금</option>
            <option value="SILVER">재질: 은</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="품명 검색"
            className="h-8 w-52 px-2 rounded-md border border-line bg-white"
          />
          <label className="ml-2 flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-semibold">단종 포함</span>
          </label>
          {stoneFilter ? (
            <span className="flex items-center gap-1 px-2 h-8 rounded-md bg-amber-50 text-amber-800 text-[12px] font-semibold">
              스톤: {stones.find((s) => s.id === stoneFilter)?.name ?? "필터"}
              <button
                type="button"
                onClick={() => setStoneFilter(null)}
                className="ml-1 hover:text-ink"
                title="스톤 필터 해제"
              >
                ✕
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white p-3">
        {loadError ? (
          <div className="p-6 text-center text-red-600">{loadError}</div>
        ) : rows !== null && rows.length === 0 ? (
          <div className="p-10 text-center text-caption">
            모델이 없습니다. 모델 등록으로 첫 카다로그를 만들거나, 직접등록·도매 입고에서
            만들어진 모델이 여기 쌓입니다.
          </div>
        ) : view === "card" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {(rows ?? []).map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border border-line overflow-hidden flex flex-col ${
                  p.isActive ? "bg-white" : "bg-slate-50 opacity-70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setEditing({ id: p.id, form: toForm(p) })}
                  className="relative h-40 bg-surface flex items-center justify-center overflow-hidden"
                  title="클릭하여 수정"
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-caption text-[12px]">사진 없음</span>
                  )}
                  {p.inStockCount > 0 ? (
                    <span className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full bg-ink text-white text-[12px] font-bold flex items-center justify-center">
                      {p.inStockCount}
                    </span>
                  ) : null}
                  {!p.isActive ? (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[11px] font-bold">
                      단종
                    </span>
                  ) : null}
                </button>
                <div className="p-2.5 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ id: p.id, form: toForm(p) })}
                    className="text-left font-bold text-primary hover:underline truncate"
                  >
                    {p.name}
                  </button>
                  <div className="text-[12px] text-body">
                    {GP_METAL_LABEL[p.metalType]} {p.purityCode === "UNKNOWN" ? "미상" : p.purityCode}
                    {p.defaultWeightGram != null ? ` · ${gram(p.defaultWeightGram)}g` : ""}
                    {" · "}
                    {GP_CATEGORY_LABEL[p.category]}
                  </div>
                  {stoneText(p) ? (
                    <div className="text-[12px] text-caption truncate">{stoneText(p)}</div>
                  ) : null}
                  <div className="text-[12px] text-body flex items-center gap-2">
                    <span>공임 {krw(p.defaultLaborFeeKrw)}</span>
                    <span className="ml-auto font-bold text-red-600 tabular-nums">
                      {p.defaultTagPrice != null ? krw(p.defaultTagPrice) : ""}
                    </span>
                  </div>
                  <div className="text-[12px] text-caption truncate">
                    {p.supplierName ?? "매입처 미지정"}
                  </div>
                  <div className="mt-1 flex gap-1.5">
                    <Link
                      href={`/gp/inventory?register=${p.id}`}
                      className="h-7 px-2 inline-flex items-center rounded-md border border-line text-[12px] text-body hover:bg-surface"
                    >
                      이 모델로 직접등록
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>No</th>
                <th className={th}>품번</th>
                <th className={th}>품명</th>
                <th className={th}>분류</th>
                <th className={th}>재질</th>
                <th className={th}>순도</th>
                <th className={`${th} text-right`}>표준중량(g)</th>
                <th className={th}>스톤(메인/보조)</th>
                <th className={`${th} text-right`}>기본공임</th>
                <th className={`${th} text-right`}>해리</th>
                <th className={`${th} text-right`}>소비자가(TAG)</th>
                <th className={th}>매입처</th>
                <th className={`${th} text-right`}>재고</th>
                <th className={th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((p, i) => (
                <tr
                  key={p.id}
                  onDoubleClick={() => setEditing({ id: p.id, form: toForm(p) })}
                  className="border-b border-line/70 cursor-default hover:bg-surface"
                >
                  <td className={`${td} text-right tabular-nums`}>{i + 1}</td>
                  <td className={`${td} tabular-nums text-caption`}>{p.code ?? "—"}</td>
                  <td className={`${td} font-semibold`}>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: p.id, form: toForm(p) })}
                      className="text-primary hover:underline"
                    >
                      {p.name}
                    </button>
                    {/* 주문 유의사항이 메모에만 있는 모델이 있다 — 목록에서 보이지 않으면 안 읽힌다. */}
                    {p.memo ? (
                      <span
                        title={p.memo}
                        className="ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 align-middle"
                      >
                        메모
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>{GP_CATEGORY_LABEL[p.category]}</td>
                  <td className={td}>{GP_METAL_LABEL[p.metalType]}</td>
                  <td className={td}>{p.purityCode === "UNKNOWN" ? "미상" : p.purityCode}</td>
                  <td className={`${td} text-right tabular-nums`}>{gram(p.defaultWeightGram)}</td>
                  <td className={td}>{stoneText(p) ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{krw(p.defaultLaborFeeKrw)}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {p.effectiveHallmark.toFixed(3)}
                    {p.hallmarkFactor != null ? (
                      <span className="ml-1 text-[10px] text-primary font-semibold">개별</span>
                    ) : null}
                  </td>
                  {/* 시세연동가가 서면 그것이 진짜 TAG가다 — 고정가는 회색으로 같이 보여준다. */}
                  <td className={`${td} text-right tabular-nums font-bold text-red-600`}>
                    {p.tagPriceSource === "SPOT" ? (
                      <>
                        {krw(p.linkedTagPrice)}
                        <span className="ml-1 text-[10px] text-caption font-semibold">시세</span>
                      </>
                    ) : p.tagPriceSource === "FIXED" ? (
                      <>
                        {krw(p.defaultTagPrice)}
                        <span className="ml-1 text-[10px] text-caption font-semibold">고정</span>
                      </>
                    ) : (
                      <span className="text-caption font-normal">—</span>
                    )}
                  </td>
                  <td className={td}>{p.supplierName ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums font-bold`}>{p.inStockCount}</td>
                  <td className={td}>
                    {p.isActive ? (
                      <span className="px-1.5 py-0.5 rounded text-[12px] font-semibold bg-emerald-50 text-emerald-700">
                        활성
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[12px] font-semibold bg-slate-100 text-slate-400">
                        단종
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
          onMouseDown={() => setEditing(null)}
        >
          <div
            className="w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-line shadow-xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-[14px]">
                {editing.id ? "모델 수정" : "모델 등록"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-caption hover:text-ink px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-3">
              {/* 사진 — 골드펜 카다로그의 본체(§8.4). 프록시 업로드 1장 */}
              <div className="w-40 shrink-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-40 h-40 rounded-lg border border-dashed border-line bg-surface flex items-center justify-center overflow-hidden hover:border-primary"
                >
                  {uploading ? (
                    <span className="text-caption text-[12px]">업로드 중…</span>
                  ) : editing.form.imageUrl ? (
                    <img
                      src={editing.form.imageUrl}
                      alt="모델 사진"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-caption text-[12px]">사진 업로드</span>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadImage(file);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="col-span-2">
                  <div className={label}>품명 *</div>
                  <input
                    autoFocus
                    value={editing.form.name}
                    onChange={(e) =>
                      setEditing((c) => c && { ...c, form: { ...c.form, name: e.target.value } })
                    }
                    className={field}
                  />
                </div>
                <div>
                  <div className={label}>분류</div>
                  <select
                    value={editing.form.category}
                    onChange={(e) =>
                      setEditing(
                        (c) =>
                          c && {
                            ...c,
                            form: { ...c.form, category: e.target.value as GpCategory },
                          },
                      )
                    }
                    className={dd + " w-full"}
                  >
                    {(Object.keys(GP_CATEGORY_LABEL) as GpCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {GP_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className={label}>재질 / 순도</div>
                  <div className="flex gap-1.5">
                    <select
                      value={editing.form.metalType}
                      onChange={(e) => {
                        const nextMetal = e.target.value as GpMetalType;
                        setEditing(
                          (c) =>
                            c && {
                              ...c,
                              form: {
                                ...c.form,
                                metalType: nextMetal,
                                purityCode: GP_PURITIES_BY_METAL[nextMetal][0],
                              },
                            },
                        );
                      }}
                      className={dd + " flex-1"}
                    >
                      <option value="GOLD">금</option>
                      <option value="SILVER">은</option>
                    </select>
                    <select
                      value={editing.form.purityCode}
                      onChange={(e) =>
                        setEditing(
                          (c) => c && { ...c, form: { ...c.form, purityCode: e.target.value } },
                        )
                      }
                      className={dd + " flex-1"}
                    >
                      {purityOptions.map((p) => (
                        <option key={p} value={p}>
                          {p === "UNKNOWN" ? "미상" : p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <div className={label}>표준중량(g)</div>
                  <input
                    value={editing.form.defaultWeightGram}
                    onChange={(e) =>
                      setEditing(
                        (c) =>
                          c && { ...c, form: { ...c.form, defaultWeightGram: e.target.value } },
                      )
                    }
                    inputMode="decimal"
                    className={field}
                  />
                </div>
                <div>
                  <div className={label}>기본공임(원)</div>
                  <input
                    value={editing.form.defaultLaborFeeKrw}
                    onChange={(e) =>
                      setEditing(
                        (c) =>
                          c && { ...c, form: { ...c.form, defaultLaborFeeKrw: e.target.value } },
                      )
                    }
                    inputMode="numeric"
                    className={field}
                  />
                </div>
                <div>
                  <div
                    className={label}
                    title="중량·공임이 있으면 시세연동가가 우선한다. 이 값은 계산이 안 될 때의 고정가."
                  >
                    소비자가(TAG가, 원) — 고정
                  </div>
                  <input
                    value={editing.form.defaultTagPrice}
                    onChange={(e) =>
                      setEditing(
                        (c) => c && { ...c, form: { ...c.form, defaultTagPrice: e.target.value } },
                      )
                    }
                    inputMode="numeric"
                    className={field}
                  />
                </div>
                <div>
                  <div className={label} title="비우면 재질 기준(설정 화면)을 따른다">
                    상품 해리
                  </div>
                  <input
                    value={editing.form.hallmarkFactor}
                    onChange={(e) =>
                      setEditing(
                        (c) => c && { ...c, form: { ...c.form, hallmarkFactor: e.target.value } },
                      )
                    }
                    placeholder="재질 기준 사용"
                    inputMode="decimal"
                    className={field}
                  />
                </div>
                <div>
                  <div className={label} title="비우면 재질·순도로 자동 채번(GD14-0001)">
                    품번
                  </div>
                  <input
                    value={editing.form.code}
                    onChange={(e) =>
                      setEditing((c) => c && { ...c, form: { ...c.form, code: e.target.value } })
                    }
                    placeholder="자동 채번"
                    className={field}
                  />
                </div>
                <div>
                  <div className={label}>매입처</div>
                  <select
                    value={editing.form.supplierSel}
                    onChange={(e) =>
                      setEditing(
                        (c) => c && { ...c, form: { ...c.form, supplierSel: e.target.value } },
                      )
                    }
                    className={dd + " w-full"}
                  >
                    <option value="">미지정</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value={NEW_SUPPLIER}>+ 새 매입처…</option>
                  </select>
                </div>
                {editing.form.supplierSel === NEW_SUPPLIER ? (
                  <div className="col-span-2">
                    <div className={label}>새 매입처 이름</div>
                    <input
                      value={editing.form.newSupplierName}
                      onChange={(e) =>
                        setEditing(
                          (c) =>
                            c && { ...c, form: { ...c.form, newSupplierName: e.target.value } },
                        )
                      }
                      className={field}
                    />
                  </div>
                ) : null}
                {/* §9 — 메인/보조 스톤 + 스톤 공임(골드펜 매입단가 기본/메인/보조 분해) */}
                {(
                  [
                    ["메인스톤", "mainStoneSel", "newMainStoneName", "mainStoneFee"],
                    ["보조스톤", "subStoneSel", "newSubStoneName", "subStoneFee"],
                  ] as const
                ).map(([lbl, selKey, newKey, feeKey]) => (
                  <div key={selKey} className="col-span-2 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <div className={label}>{lbl}</div>
                      <select
                        value={editing.form[selKey]}
                        onChange={(e) =>
                          setEditing(
                            (c) => c && { ...c, form: { ...c.form, [selKey]: e.target.value } },
                          )
                        }
                        className={dd + " w-full"}
                      >
                        <option value="">없음</option>
                        {stones.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value={NEW_STONE}>+ 새 스톤…</option>
                      </select>
                    </div>
                    {editing.form[selKey] ? (
                      <div>
                        <div className={label}>{lbl} 공임(원)</div>
                        <input
                          value={editing.form[feeKey]}
                          onChange={(e) =>
                            setEditing(
                              (c) => c && { ...c, form: { ...c.form, [feeKey]: e.target.value } },
                            )
                          }
                          inputMode="numeric"
                          className={field}
                        />
                      </div>
                    ) : (
                      <div />
                    )}
                    {editing.form[selKey] === NEW_STONE ? (
                      <div className="col-span-2">
                        <div className={label}>새 {lbl} 이름 (예: 랩다이아/조각/3.0)</div>
                        <input
                          value={editing.form[newKey]}
                          onChange={(e) =>
                            setEditing(
                              (c) => c && { ...c, form: { ...c.form, [newKey]: e.target.value } },
                            )
                          }
                          className={field}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="col-span-2">
                  <div className={label}>메모</div>
                  <textarea
                    value={editing.form.memo}
                    onChange={(e) =>
                      setEditing((c) => c && { ...c, form: { ...c.form, memo: e.target.value } })
                    }
                    rows={8}
                    placeholder="주문 시 유의사항·스톤 스펙·규격 등 (골드펜 「비고사항」이 여기로 들어온다)"
                    className="px-2 py-1.5 rounded-md border border-line bg-white w-full resize-y min-h-[64px] font-mono text-[12px] leading-relaxed"
                  />
                </div>
                {editing.id ? (
                  <label className="col-span-2 flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editing.form.isActive}
                      onChange={(e) =>
                        setEditing(
                          (c) => c && { ...c, form: { ...c.form, isActive: e.target.checked } },
                        )
                      }
                      className="accent-primary"
                    />
                    <span className="font-semibold">활성 (해제 = 단종 처리)</span>
                  </label>
                ) : null}
              </div>
            </div>

            {saveError ? <div className="mt-2 text-red-600 text-[12px]">{saveError}</div> : null}

            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                disabled={saving || uploading}
                onClick={save}
                className="h-8 px-4 rounded-md bg-primary hover:bg-primary-light text-white font-bold disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
