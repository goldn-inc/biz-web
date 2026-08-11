"use client";

import { useCallback, useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_SUPPLIER_TYPE_LABEL,
  type GpSupplierRow,
  type GpSupplierType,
} from "@/lib/gp";

const dd = "h-8 px-2 rounded-md border border-line bg-white text-[13px]";

type FormState = {
  name: string;
  type: GpSupplierType;
  phone: string;
  fax: string;
  email: string;
  address: string;
  businessName: string;
  businessNo: string;
  ceoName: string;
  managerName: string;
  managerPhone: string;
  hallmarkFactor: string;
  orderLeadDays: string;
  memo: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "PURCHASE",
  phone: "",
  fax: "",
  email: "",
  address: "",
  businessName: "",
  businessNo: "",
  ceoName: "",
  managerName: "",
  managerPhone: "",
  hallmarkFactor: "",
  orderLeadDays: "",
  memo: "",
  isActive: true,
};

function toForm(s: GpSupplierRow): FormState {
  return {
    name: s.name,
    type: s.type,
    phone: s.phone ?? "",
    fax: s.fax ?? "",
    email: s.email ?? "",
    address: s.address ?? "",
    businessName: s.businessName ?? "",
    businessNo: s.businessNo ?? "",
    ceoName: s.ceoName ?? "",
    managerName: s.managerName ?? "",
    managerPhone: s.managerPhone ?? "",
    hallmarkFactor: s.hallmarkFactor != null ? String(s.hallmarkFactor) : "",
    orderLeadDays: s.orderLeadDays != null ? String(s.orderLeadDays) : "",
    memo: s.memo ?? "",
    isActive: s.isActive,
  };
}

/**
 * GP 거래처(§8.6) — 골드펜 거래처 화면 대응. 목록 + 등록/수정 모달.
 * 삭제는 없다(비활성 처리) — 개체·모델이 참조하는 마스터라 행이 사라지면 이력이 끊긴다.
 */
export default function GpSuppliersPage() {
  const { token } = useBizSession();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [q, setQ] = useState("");
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<GpSupplierRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = includeInactive ? "?includeInactive=true" : "";
    void bizApiFetch<{ suppliers: GpSupplierRow[] }>(`/biz/gp/suppliers${params}`, { token })
      .then((r) => {
        if (!cancelled) {
          setRows(r.suppliers);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof BizApiError ? error.message : "거래처를 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, includeInactive, reload]);

  const filtered = (rows ?? []).filter((s) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [s.name, s.businessName, s.phone, s.managerName, s.managerPhone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });

  const save = useCallback(() => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) {
      setSaveError("거래처명을 입력하세요.");
      return;
    }
    const hallmark = f.hallmarkFactor.trim() ? Number(f.hallmarkFactor) : undefined;
    if (hallmark !== undefined && (!Number.isFinite(hallmark) || hallmark < 0.5 || hallmark > 2)) {
      setSaveError("매입해리는 0.5~2.0 사이 숫자여야 합니다.");
      return;
    }
    const leadDays = f.orderLeadDays.trim() ? Number(f.orderLeadDays) : undefined;
    const body = {
      name: f.name.trim(),
      type: f.type,
      phone: f.phone.trim() || undefined,
      fax: f.fax.trim() || undefined,
      email: f.email.trim() || undefined,
      address: f.address.trim() || undefined,
      businessName: f.businessName.trim() || undefined,
      businessNo: f.businessNo.trim() || undefined,
      ceoName: f.ceoName.trim() || undefined,
      managerName: f.managerName.trim() || undefined,
      managerPhone: f.managerPhone.trim() || undefined,
      hallmarkFactor: hallmark,
      orderLeadDays: leadDays,
      memo: f.memo.trim() || undefined,
      ...(editing.id ? { isActive: f.isActive } : {}),
    };
    setSaving(true);
    setSaveError(null);
    void (async () => {
      try {
        if (editing.id) {
          await bizApiFetch(`/biz/gp/suppliers/${editing.id}`, {
            method: "PATCH",
            body,
            token,
          });
        } else {
          await bizApiFetch("/biz/gp/suppliers", { method: "POST", body, token });
        }
        setEditing(null);
        setReload((n) => n + 1);
      } catch (error) {
        setSaveError(
          error instanceof BizApiError ? error.message : "저장에 실패했습니다.",
        );
      } finally {
        setSaving(false);
      }
    })();
  }, [editing, token]);

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";

  const field = "h-8 px-2 rounded-md border border-line bg-white w-full";
  const label = "text-[12px] font-bold text-caption";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">거래처</h1>
          <span className="text-caption text-[12px]">
            {rows === null ? "불러오는 중…" : `${filtered.length.toLocaleString()}건`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReload((n) => n + 1)}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => setEditing({ id: null, form: EMPTY_FORM })}
              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              거래처 등록
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·사업자명·전화 검색"
            className="h-8 w-56 px-2 rounded-md border border-line bg-white"
          />
          <label className="ml-2 flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-primary"
            />
            <span className="font-semibold">비활성 포함</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {loadError ? (
          <div className="p-6 text-center text-red-600">{loadError}</div>
        ) : rows !== null && filtered.length === 0 ? (
          <div className="p-10 text-center text-caption">
            거래처가 없습니다. 거래처 등록으로 첫 매입처를 올리세요 — 직접등록 입고 폼에서
            인라인으로 만든 거래처도 여기 나타납니다.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>No</th>
                <th className={th}>구분</th>
                <th className={th}>거래처명</th>
                <th className={th}>사업자명</th>
                <th className={th}>대표자</th>
                <th className={th}>전화번호</th>
                <th className={th}>담당자</th>
                <th className={th}>담당연락처</th>
                <th className={`${th} text-right`}>매입해리</th>
                <th className={`${th} text-right`}>주문소요일</th>
                <th className={th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  onDoubleClick={() => setEditing({ id: s.id, form: toForm(s) })}
                  className="border-b border-line/70 cursor-default hover:bg-surface"
                >
                  <td className={`${td} text-right tabular-nums`}>{i + 1}</td>
                  <td className={td}>{GP_SUPPLIER_TYPE_LABEL[s.type]}</td>
                  <td className={`${td} font-semibold`}>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: s.id, form: toForm(s) })}
                      className="text-primary hover:underline"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className={td}>{s.businessName ?? "—"}</td>
                  <td className={td}>{s.ceoName ?? "—"}</td>
                  <td className={td}>{s.phone ?? "—"}</td>
                  <td className={td}>{s.managerName ?? "—"}</td>
                  <td className={td}>{s.managerPhone ?? "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {s.hallmarkFactor != null ? s.hallmarkFactor.toFixed(2) : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {s.orderLeadDays != null ? `${s.orderLeadDays}일` : "—"}
                  </td>
                  <td className={td}>
                    {s.isActive ? (
                      <span className="px-1.5 py-0.5 rounded text-[12px] font-semibold bg-emerald-50 text-emerald-700">
                        활성
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[12px] font-semibold bg-slate-100 text-slate-400">
                        비활성
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
                {editing.id ? "거래처 수정" : "거래처 등록"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-caption hover:text-ink px-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <div className={label}>거래처명 *</div>
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
                <div className={label}>구분</div>
                <select
                  value={editing.form.type}
                  onChange={(e) =>
                    setEditing(
                      (c) =>
                        c && { ...c, form: { ...c.form, type: e.target.value as GpSupplierType } },
                    )
                  }
                  className={dd + " w-full"}
                >
                  {(Object.keys(GP_SUPPLIER_TYPE_LABEL) as GpSupplierType[]).map((t) => (
                    <option key={t} value={t}>
                      {GP_SUPPLIER_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ["사업자명", "businessName"],
                  ["사업자번호", "businessNo"],
                  ["대표자", "ceoName"],
                  ["전화번호", "phone"],
                  ["팩스번호", "fax"],
                  ["담당자", "managerName"],
                  ["담당연락처", "managerPhone"],
                  ["이메일", "email"],
                ] as const
              ).map(([lbl, key]) => (
                <div key={key}>
                  <div className={label}>{lbl}</div>
                  <input
                    value={editing.form[key]}
                    onChange={(e) =>
                      setEditing((c) => c && { ...c, form: { ...c.form, [key]: e.target.value } })
                    }
                    className={field}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <div className={label}>주소</div>
                <input
                  value={editing.form.address}
                  onChange={(e) =>
                    setEditing((c) => c && { ...c, form: { ...c.form, address: e.target.value } })
                  }
                  className={field}
                />
              </div>
              <div>
                <div className={label} title="직접등록 입고 폼의 순환산 프리필로 연결">
                  매입해리 (예 1.10)
                </div>
                <input
                  value={editing.form.hallmarkFactor}
                  onChange={(e) =>
                    setEditing(
                      (c) => c && { ...c, form: { ...c.form, hallmarkFactor: e.target.value } },
                    )
                  }
                  inputMode="decimal"
                  className={field}
                />
              </div>
              <div>
                <div className={label}>주문 소요일</div>
                <input
                  value={editing.form.orderLeadDays}
                  onChange={(e) =>
                    setEditing(
                      (c) => c && { ...c, form: { ...c.form, orderLeadDays: e.target.value } },
                    )
                  }
                  inputMode="numeric"
                  className={field}
                />
              </div>
              <div className="col-span-2">
                <div className={label}>비고</div>
                <textarea
                  value={editing.form.memo}
                  onChange={(e) =>
                    setEditing((c) => c && { ...c, form: { ...c.form, memo: e.target.value } })
                  }
                  rows={2}
                  className="px-2 py-1.5 rounded-md border border-line bg-white w-full resize-none"
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
                  <span className="font-semibold">활성 (해제 = 비활성 처리, 삭제 없음)</span>
                </label>
              ) : null}
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
                disabled={saving}
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
