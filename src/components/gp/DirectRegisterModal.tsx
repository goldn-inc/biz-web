"use client";

import { useMemo, useState } from "react";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_CATEGORY_LABEL,
  GP_METAL_LABEL,
  GP_PURITIES_BY_METAL,
  type GpCategory,
  type GpItem,
  type GpMetalType,
  type GpProductLite,
  type GpSupplier,
} from "@/lib/gp";

const NEW_SUPPLIER = "__new__";
const CATEGORIES = Object.keys(GP_CATEGORY_LABEL) as GpCategory[];

type Props = {
  token: string;
  products: GpProductLite[];
  suppliers: GpSupplier[];
  /** 카다로그 「이 모델로 직접등록」(§8.4) — 모델 프리셀렉트. */
  initialProductId?: string;
  onClose: () => void;
  /** 등록 성공 — 목록 재조회 + 새 시리얼 하이라이트용. */
  onRegistered: (item: GpItem) => void;
};

/**
 * 직접등록 모달 — 비도매 물건(자투리 매입·기존 보유분)을 매장 재고로 올린다.
 * 모델·입고처는 인라인 생성 가능(gp-design.md §5.2 직접 입고).
 */
export function DirectRegisterModal({
  token,
  products,
  suppliers,
  initialProductId,
  onClose,
  onRegistered,
}: Props) {
  const initialProduct = initialProductId
    ? products.find((p) => p.id === initialProductId)
    : undefined;
  const [mode, setMode] = useState<"existing" | "new">(
    initialProduct || products.length > 0 ? "existing" : "new",
  );
  const [gpProductId, setGpProductId] = useState(initialProduct?.id ?? products[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<GpCategory>("RING");
  const [metal, setMetal] = useState<GpMetalType>("GOLD");
  const [purity, setPurity] = useState("24K");
  const [weightG, setWeightG] = useState("");
  const [cost, setCost] = useState("");
  // §9.3 — 매입 유형 + 매입대금 현금 지급(체크 시 현금 원장 MANUAL_OUT 자동 기입)
  const [acquireType, setAcquireType] = useState<"NEW" | "USED_BUY">("NEW");
  const [payCash, setPayCash] = useState(false);
  const [cashPaid, setCashPaid] = useState("");
  const [supplierSel, setSupplierSel] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === gpProductId) ?? null,
    [products, gpProductId],
  );
  /** 기존 모델 선택 시 순도 후보는 그 모델의 재질을 따른다. */
  const effectiveMetal = mode === "existing" ? (selectedProduct?.metalType ?? "GOLD") : metal;
  const purityOptions = GP_PURITIES_BY_METAL[effectiveMetal];
  const effectivePurity = purityOptions.includes(purity)
    ? purity
    : (mode === "existing" ? selectedProduct?.purityCode : null) ?? purityOptions[0];

  async function submit() {
    const weight = Number(weightG);
    if (!Number.isFinite(weight) || weight <= 0) {
      setError("실중량(g)을 입력해 주세요.");
      return;
    }
    if (mode === "existing" && !gpProductId) {
      setError("모델을 선택해 주세요.");
      return;
    }
    if (mode === "new" && !newName.trim()) {
      setError("품명을 입력해 주세요.");
      return;
    }
    if (payCash && cashPaid.trim() === "" && cost.trim() === "") {
      setError("현금 지급 기입에는 지급액 또는 매입원가가 필요합니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const item = await bizApiFetch<GpItem>("/biz/gp/items", {
        method: "POST",
        token,
        body: {
          ...(mode === "existing"
            ? { gpProductId }
            : {
                newProduct: {
                  name: newName.trim(),
                  category: newCategory,
                  metalType: metal,
                  purityCode: effectivePurity,
                },
              }),
          weightG: weight,
          purityCode: effectivePurity,
          ...(cost.trim() !== "" ? { acquiredUnitCost: Math.round(Number(cost)) } : {}),
          acquireType,
          ...(payCash
            ? {
                payCash: true,
                ...(cashPaid.trim() !== ""
                  ? { cashPaidAmount: Math.round(Number(cashPaid)) }
                  : {}),
              }
            : {}),
          ...(supplierSel && supplierSel !== NEW_SUPPLIER ? { supplierId: supplierSel } : {}),
          ...(supplierSel === NEW_SUPPLIER && newSupplierName.trim()
            ? { newSupplierName: newSupplierName.trim() }
            : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
      });
      onRegistered(item);
    } catch (e) {
      setError(e instanceof BizApiError ? e.message : "등록에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const field = "h-8 px-2 rounded-md border border-line bg-white w-full";
  const label = "text-[12px] font-semibold text-body";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 grid place-items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[420px] max-h-[90vh] overflow-y-auto rounded-lg bg-white border border-line shadow-xl p-4 text-[13px]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-extrabold text-[14px]">재고 직접등록</h2>
          <button type="button" onClick={onClose} className="text-caption hover:text-ink px-1">
            ✕ <span className="text-[11px]">Esc</span>
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode("existing")}
              disabled={products.length === 0}
              className={`h-7 px-3 rounded-md border ${
                mode === "existing"
                  ? "border-primary text-primary font-bold"
                  : "border-line text-body"
              } disabled:opacity-40`}
            >
              기존 모델
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`h-7 px-3 rounded-md border ${
                mode === "new" ? "border-primary text-primary font-bold" : "border-line text-body"
              }`}
            >
              새 모델
            </button>
          </div>

          {mode === "existing" ? (
            <div>
              <div className={label}>모델</div>
              <select
                value={gpProductId}
                onChange={(e) => setGpProductId(e.target.value)}
                className={field}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {GP_CATEGORY_LABEL[p.category]} · {p.purityCode}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <div className={label}>품명</div>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 순금 돌반지 1.875g"
                  className={field}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className={label}>분류</div>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as GpCategory)}
                    className={field}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {GP_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className={label}>재질</div>
                  <select
                    value={metal}
                    onChange={(e) => {
                      const m = e.target.value as GpMetalType;
                      setMetal(m);
                      setPurity(GP_PURITIES_BY_METAL[m][0]);
                    }}
                    className={field}
                  >
                    {(["GOLD", "SILVER"] as const).map((m) => (
                      <option key={m} value={m}>
                        {GP_METAL_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={label}>순도</div>
              <select
                value={effectivePurity}
                onChange={(e) => setPurity(e.target.value)}
                className={field}
              >
                {purityOptions.map((p) => (
                  <option key={p} value={p}>
                    {p === "UNKNOWN" ? "미상" : p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={label}>실중량(g)</div>
              <input
                type="number"
                step="0.001"
                min="0"
                value={weightG}
                onChange={(e) => setWeightG(e.target.value)}
                placeholder="0.000"
                className={`${field} text-right tabular-nums`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={label}>매입원가(원)</div>
              <input
                type="number"
                step="1"
                min="0"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="선택"
                className={`${field} text-right tabular-nums`}
              />
            </div>
            <div>
              <div className={label}>입고처</div>
              <select
                value={supplierSel}
                onChange={(e) => setSupplierSel(e.target.value)}
                className={field}
              >
                <option value="">선택 안 함</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW_SUPPLIER}>+ 새 입고처…</option>
              </select>
            </div>
          </div>

          {supplierSel === NEW_SUPPLIER ? (
            <div>
              <div className={label}>새 입고처 이름</div>
              <input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="예: 종로도매상"
                className={field}
              />
            </div>
          ) : null}

          {/* §9.3 — 매입 유형 + 현금 지급(고금 매입의 축) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className={label}>매입 유형</div>
              <select
                value={acquireType}
                onChange={(e) => setAcquireType(e.target.value as "NEW" | "USED_BUY")}
                className={field}
              >
                <option value="NEW">사입(신품)</option>
                <option value="USED_BUY">고금매입(손님 물건)</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer select-none h-full pt-4">
                <input
                  type="checkbox"
                  checked={payCash}
                  onChange={(e) => setPayCash(e.target.checked)}
                  className="accent-primary"
                />
                <span className="font-semibold">매입대금 현금 지급</span>
              </label>
            </div>
          </div>
          {payCash ? (
            <div>
              <div className={label}>현금 지급액(원) — 비우면 매입원가로 기입</div>
              <input
                type="number"
                step="1"
                min="0"
                value={cashPaid}
                onChange={(e) => setCashPaid(e.target.value)}
                placeholder={cost.trim() !== "" ? cost : "0"}
                className={`${field} text-right tabular-nums`}
              />
              <p className="mt-1 text-[11px] text-caption">
                현금 원장에 출금으로 자동 기입됩니다. 계좌 이체로 지급했다면 체크를 해제하세요.
              </p>
            </div>
          ) : null}

          <div>
            <div className={label}>메모</div>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선택"
              className={field}
            />
          </div>

          {error ? <div className="text-[12px] text-red-600 font-semibold">{error}</div> : null}

          <div className="flex justify-end gap-1.5 mt-1">
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
              disabled={submitting}
              className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
            >
              {submitting ? "등록 중…" : "등록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
