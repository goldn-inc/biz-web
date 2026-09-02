"use client";

import { useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import type { GpMaterialStandard } from "@/lib/gp";

type Draft = { hallmarkFactor: string; applyHallmark: boolean };

/**
 * 재질(순도) 기준 — 해리 설정 표.
 *
 * 여기 값이 시세연동 TAG가·재고 시세원가·매입 라인 기본값을 전부 움직인다. 상품 하나만 다르게
 * 하려면 카다로그의 상품 해리로 덮어쓴다(그쪽이 최우선).
 */
export default function MaterialStandardsPanel() {
  const { token } = useBizSession();
  const [rows, setRows] = useState<GpMaterialStandard[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 조회 실패는 message 와 분리한다 — message 렌더 블록은 rows 가 있을 때의 가지 안이라
  // 실패하면 화면에 영원히 「불러오는 중…」만 남는다.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  function seed(standards: GpMaterialStandard[]) {
    setRows(standards);
    setDrafts(
      Object.fromEntries(
        standards.map((s) => [
          s.purityCode,
          { hallmarkFactor: String(s.hallmarkFactor), applyHallmark: s.applyHallmark },
        ]),
      ),
    );
  }

  useEffect(() => {
    let cancelled = false;
    void bizApiFetch<{ standards: GpMaterialStandard[] }>("/biz/gp/materials", { token })
      .then((res) => {
        if (cancelled) return;
        seed(res.standards);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("재질 기준을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  async function submit() {
    if (!rows) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await bizApiFetch<{ standards: GpMaterialStandard[] }>("/biz/gp/materials", {
        method: "PUT",
        token,
        body: {
          standards: rows.map((row) => ({
            purityCode: row.purityCode,
            hallmarkFactor: Number(drafts[row.purityCode]?.hallmarkFactor ?? row.hallmarkFactor),
            applyHallmark: drafts[row.purityCode]?.applyHallmark ?? row.applyHallmark,
          })),
        },
      });
      seed(res.standards);
      setMessage({ ok: true, text: "저장됐습니다. 이후 계산부터 새 기준이 적용됩니다." });
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
    <section className="mt-8">
      <h2 className="text-[15px] font-extrabold mb-1">재질 기준 — 해리</h2>
      <p className="text-caption text-[12px] mb-4 leading-relaxed">
        시세연동 TAG가와 재고 시세원가, 매입 등록의 순금환산이 전부 이 표를 봅니다. 적용을 끄면
        해리 없이(×1) 계산합니다. 상품 하나만 다르게 하려면 <b>카다로그의 상품 해리</b>로
        덮어쓰세요 — 그쪽이 우선입니다.
      </p>

      {loadError ? (
        <div className="flex flex-col items-start gap-2">
          <div className="text-[12px] font-semibold text-red-600">{loadError}</div>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="h-8 px-3 rounded-md border border-line bg-white text-[12px] font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : !rows ? (
        <div className="text-caption">불러오는 중…</div>
      ) : (
        <div className="max-w-2xl">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-caption text-[12px]">
                <th className="text-left py-2 font-semibold">재질</th>
                <th className="text-right py-2 font-semibold">가격계수</th>
                <th className="text-right py-2 font-semibold">해리</th>
                <th className="text-center py-2 font-semibold w-20">적용</th>
                <th className="text-left py-2 font-semibold pl-3">기준</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.purityCode];
                return (
                  <tr key={row.purityCode} className="border-b border-line/60">
                    <td className="py-2 font-semibold">{row.purityCode}</td>
                    <td className="py-2 text-right tabular-nums text-caption">
                      {row.pricingFactor}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min="0.001"
                        max="9.999"
                        step="0.001"
                        value={draft?.hallmarkFactor ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.purityCode]: {
                              hallmarkFactor: e.target.value,
                              applyHallmark: prev[row.purityCode]?.applyHallmark ?? false,
                            },
                          }))
                        }
                        disabled={!(draft?.applyHallmark ?? false)}
                        className="h-8 w-24 px-2 rounded-md border border-line bg-white text-right tabular-nums disabled:bg-slate-50 disabled:text-caption"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={draft?.applyHallmark ?? false}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.purityCode]: {
                              hallmarkFactor: prev[row.purityCode]?.hallmarkFactor ?? "1",
                              applyHallmark: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="py-2 pl-3 text-[11px] text-caption">
                      {row.isCustom ? "매장 설정" : "기본값"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {message ? (
            <div
              className={`mt-3 text-[12px] font-semibold ${message.ok ? "text-emerald-700" : "text-red-600"}`}
            >
              {message.text}
            </div>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="h-9 px-5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
            >
              {busy ? "저장 중…" : "재질 기준 저장"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
