"use client";

import { useEffect, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { gram, krw } from "@/lib/gp";
import MaterialStandardsPanel from "@/components/gp/MaterialStandardsPanel";

type OpeningStatus = {
  cash: { hasOpening: boolean; balance: number };
  gold: { hasOpening: boolean; balance: number };
  silver: { hasOpening: boolean; balance: number };
};

/**
 * GP 기초 설정 — 개시 잔액(이관 C안: 개업/전환 시 수기 1회 + 조정 이력).
 * OPENING 이 이미 있으면 저장은 "목표값과 현 잔액의 차"를 조정 행으로 남긴다(append-only).
 */
export default function GpSettingsPage() {
  const { token } = useBizSession();
  const [status, setStatus] = useState<OpeningStatus | null>(null);
  const [cash, setCash] = useState("");
  const [gold, setGold] = useState("");
  const [silver, setSilver] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 조회 실패는 message 와 분리한다 — message 렌더 블록은 status 가 있을 때의 가지 안이라
  // 실패하면 화면에 영원히 「불러오는 중…」만 남는다.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void bizApiFetch<OpeningStatus>("/biz/gp/settings/opening", { token })
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("개시 상태를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  async function submit() {
    if (cash === "" && gold === "" && silver === "") {
      setMessage({ ok: false, text: "설정할 값을 하나 이상 입력해 주세요." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await bizApiFetch<OpeningStatus>("/biz/gp/settings/opening", {
        method: "POST",
        token,
        body: {
          ...(cash !== "" ? { cashAmount: Math.round(Number(cash)) } : {}),
          ...(gold !== "" ? { goldPureGram: Number(gold) } : {}),
          ...(silver !== "" ? { silverPureGram: Number(silver) } : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        },
      });
      setStatus(next);
      setCash("");
      setGold("");
      setSilver("");
      setMemo("");
      setMessage({ ok: true, text: "저장됐습니다. 시재 원장에 행이 추가됐습니다." });
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof BizApiError ? e.message : "저장에 실패했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  const rows = status
    ? ([
        ["현금", krw(status.cash.balance), status.cash.hasOpening, cash, setCash, "원"],
        ["금 순중량", `${gram(status.gold.balance)}g`, status.gold.hasOpening, gold, setGold, "g"],
        [
          "은 순중량",
          `${gram(status.silver.balance)}g`,
          status.silver.hasOpening,
          silver,
          setSilver,
          "g",
        ],
      ] as const)
    : [];

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="max-w-3xl px-6 py-5">
        <h1 className="text-[15px] font-extrabold mb-1">기초 설정 — 개시 잔액</h1>
        <p className="text-caption text-[12px] mb-4 leading-relaxed">
          개업(또는 이 프로그램 전환) 시점의 현금·금·은 시재를 한 번 입력합니다. 이미 개시가 있으면
          입력값과 현 잔액의 <b>차이만 조정 행</b>으로 남습니다 — 원장은 수정 대신 행 추가로만
          움직입니다.
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
        ) : !status ? (
          <div className="text-caption">불러오는 중…</div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(([label, current, hasOpening, value, setter, unit]) => (
              <div key={label} className="flex items-center gap-3 border-b border-line/60 pb-3">
                <div className="w-28">
                  <div className="font-semibold">{label}</div>
                  <div className="text-[11px] text-caption">
                    {hasOpening ? "개시 있음" : "개시 없음"}
                  </div>
                </div>
                <div className="w-36 text-right tabular-nums text-caption">현재 {current}</div>
                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step={unit === "원" ? "1" : "0.001"}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={hasOpening ? "목표 잔액" : "개시 잔액"}
                    className="h-8 w-40 px-2 rounded-md border border-line bg-white text-right tabular-nums"
                  />
                  <span className="text-caption w-6">{unit}</span>
                </div>
              </div>
            ))}

            <label className="flex items-center gap-3">
              <span className="w-28 font-semibold">메모</span>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 2026-08-10 개업 실사 기준"
                className="h-8 flex-1 px-2 rounded-md border border-line bg-white"
              />
            </label>

            {message ? (
              <div
                className={`text-[12px] font-semibold ${message.ok ? "text-emerald-700" : "text-red-600"}`}
              >
                {message.text}
              </div>
            ) : null}

            <div>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="h-9 px-5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
              >
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}

        <MaterialStandardsPanel />
      </div>
    </div>
  );
}
