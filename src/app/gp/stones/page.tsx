"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { type GpStoneRow } from "@/lib/gp";

/**
 * GP 스톤 관리(§9.1) — 골드펜 스톤관리 대응: 이름 사전(수량 원장 아님).
 * No·모델건수(클릭 → 카다로그 필터 점프)·스톤명·비고. 삭제 없음(비활성).
 */
export default function GpStonesPage() {
  const { token } = useBizSession();

  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<GpStoneRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{
    id: string | null;
    name: string;
    memo: string;
    isActive: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (includeInactive) params.set("includeInactive", "true");
    void bizApiFetch<{ stones: GpStoneRow[] }>(`/biz/gp/stones?${params.toString()}`, { token })
      .then((r) => {
        if (!cancelled) {
          setRows(r.stones);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof BizApiError ? error.message : "스톤을 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, includeInactive, reload]);

  const filtered = (rows ?? []).filter(
    (s) => !q || s.name.toLowerCase().includes(q.toLowerCase()),
  );

  const save = useCallback(() => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setSaveError("스톤명을 입력하세요.");
      return;
    }
    const body = {
      name: editing.name.trim(),
      memo: editing.memo.trim() || undefined,
      ...(editing.id ? { isActive: editing.isActive } : {}),
    };
    setSaving(true);
    setSaveError(null);
    void (async () => {
      try {
        if (editing.id) {
          await bizApiFetch(`/biz/gp/stones/${editing.id}`, { method: "PATCH", body, token });
        } else {
          await bizApiFetch("/biz/gp/stones", { method: "POST", body, token });
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

  const th = "px-2 py-1.5 text-left font-bold text-[12px] text-caption whitespace-nowrap";
  const td = "px-2 py-1.5 whitespace-nowrap";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-[15px] font-extrabold">스톤 관리</h1>
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
              onClick={() => setEditing({ id: null, name: "", memo: "", isActive: true })}
              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              스톤 등록
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="스톤명 검색 (예: 랩다이아)"
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
            스톤이 없습니다. 스톤 등록으로 첫 이름을 올리거나, 카다로그 폼에서 인라인으로
            만든 스톤도 여기 나타납니다.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
              <tr>
                <th className={th}>No</th>
                <th className={`${th} text-right`}>모델건수</th>
                <th className={th}>스톤명</th>
                <th className={th}>비고</th>
                <th className={th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  onDoubleClick={() =>
                    setEditing({ id: s.id, name: s.name, memo: s.memo ?? "", isActive: s.isActive })
                  }
                  className="border-b border-line/70 cursor-default hover:bg-surface"
                >
                  <td className={`${td} text-right tabular-nums`}>{i + 1}</td>
                  <td className={`${td} text-right`}>
                    {s.productCount > 0 ? (
                      <Link
                        href={`/gp/catalog?stone=${s.id}`}
                        className="font-bold text-red-600 tabular-nums hover:underline"
                        title="이 스톤을 쓰는 모델 보기"
                      >
                        {s.productCount}
                      </Link>
                    ) : (
                      <span className="text-caption tabular-nums">0</span>
                    )}
                  </td>
                  <td className={`${td} font-semibold`}>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: s.id,
                          name: s.name,
                          memo: s.memo ?? "",
                          isActive: s.isActive,
                        })
                      }
                      className="text-primary hover:underline"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className={td}>{s.memo ?? "—"}</td>
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
            className="w-[420px] bg-white rounded-lg border border-line shadow-xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="font-extrabold text-[14px] mb-2">
              {editing.id ? "스톤 수정" : "스톤 등록"}
            </h2>
            <div className="flex flex-col gap-2">
              <div>
                <div className="text-[12px] font-bold text-caption">
                  스톤명 * (예: 랩다이아/조각/3.0)
                </div>
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing((c) => c && { ...c, name: e.target.value })}
                  className="h-8 px-2 rounded-md border border-line bg-white w-full"
                />
              </div>
              <div>
                <div className="text-[12px] font-bold text-caption">비고 (예: 개당 중량 0.02g)</div>
                <input
                  value={editing.memo}
                  onChange={(e) => setEditing((c) => c && { ...c, memo: e.target.value })}
                  className="h-8 px-2 rounded-md border border-line bg-white w-full"
                />
              </div>
              {editing.id ? (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editing.isActive}
                    onChange={(e) => setEditing((c) => c && { ...c, isActive: e.target.checked })}
                    className="accent-primary"
                  />
                  <span className="font-semibold">활성 (해제 = 비활성, 삭제 없음)</span>
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
