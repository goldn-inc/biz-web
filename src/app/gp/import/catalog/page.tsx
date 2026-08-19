"use client";

import { useCallback, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiUpload, BizApiError } from "@/lib/api";
import { gram, krw, type GpCatalogImportResult } from "@/lib/gp";

const th = "px-2 py-1.5 text-[12px] font-semibold text-caption text-left whitespace-nowrap";
const thNum = `${th} text-right`;
const td = "px-2 py-1.5 text-[13px] whitespace-nowrap";
const tdNum = `${td} text-right tabular-nums`;

/**
 * 카다로그 이관 — 골드펜 「엑셀저장 → 기본정보」 파일 한 장으로 모델을 한 번에 등록한다.
 *
 * 재고 이관과 같은 규율: 파일을 고르면 검증만 하고(DB 무변경), 오류가 0일 때만 반영 버튼이 열린다.
 * 스톤정보 시트는 받지 않는다 — 알값이 기본정보의 메인/보조 단가에 이미 갈라져 있다.
 */
export default function GpCatalogImportPage() {
  const { token } = useBizSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<GpCatalogImportResult | null>(null);
  const [busy, setBusy] = useState<"verify" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (target: File, commit: boolean) => {
      setBusy(commit ? "commit" : "verify");
      setError(null);
      try {
        const form = new FormData();
        form.append("file", target);
        const res = await bizApiUpload<GpCatalogImportResult>(
          `/biz/gp/import/catalog${commit ? "?commit=true" : ""}`,
          form,
          token,
        );
        setResult(res);
      } catch (err) {
        setError(err instanceof BizApiError ? err.message : "파일을 처리하지 못했습니다.");
        if (commit) setResult(null);
      } finally {
        setBusy(null);
      }
    },
    [token],
  );

  const onPick = (picked: File | null) => {
    setFile(picked);
    setResult(null);
    setError(null);
    if (picked) void send(picked, false);
  };

  const committed = result?.committed === true;
  const canCommit = result !== null && !committed && result.errorRows === 0 && result.validRows > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-line bg-white">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-extrabold">카다로그 이관</h1>
          <span className="text-caption text-[12px]">
            골드펜 「엑셀저장 → 기본정보」 파일을 그대로 올리세요 — 스톤정보 시트는 필요 없습니다
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ml-auto h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
          >
            엑셀 선택
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="flex-1 overflow-auto px-4 py-4">
        {error ? (
          <div className="mb-3 px-3 py-2 rounded-md bg-red-50 text-red-700 text-[13px] font-semibold">
            {error}
          </div>
        ) : null}

        {!file ? (
          <div className="text-caption text-[13px] leading-relaxed max-w-2xl">
            <p className="mb-2 font-semibold text-body">올리기 전에 알아두실 것</p>
            <ul className="list-disc pl-4 flex flex-col gap-1">
              <li>
                모델번호가 <b>품번</b>으로 그대로 들어갑니다. 이미 같은 품번이 카다로그에 있으면 그
                행은 오류로 표시되고, 파일 전체가 반영되지 않습니다.
              </li>
              <li>
                <b>비고사항</b>은 줄바꿈까지 원문 그대로 모델 메모로 들어갑니다(주문 시 유의사항도
                함께).
              </li>
              <li>
                알값은 <b>메인/보조 스톤 단가</b>가 각각 들어가 소비자가 계산에 반영됩니다.
              </li>
              <li>
                재질 칸이 빈 행은 실버바이거나 이름에 순도가 적힌 경우만 자동으로 채우고, 나머지는
                오류로 표시합니다 — 재질이 틀리면 가격과 순금 환산이 조용히 어긋납니다.
              </li>
              <li>사진은 옮겨지지 않습니다(엑셀에 경로만 있고 이미지는 골드펜에 있습니다).</li>
            </ul>
          </div>
        ) : null}

        {result ? (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Stat label="전체 행" value={`${result.totalRows}`} />
              <Stat label="정상" value={`${result.validRows}`} />
              <Stat label="오류" value={`${result.errorRows}`} warn={result.errorRows > 0} />
              <Stat label="새 모델" value={`${result.summary.newProducts}`} />
              <Stat label="새 거래처" value={`${result.summary.newSuppliers}`} />
              <Stat label="메모 있음" value={`${result.summary.withMemo}`} />
              <Stat
                label="중량 없음"
                value={`${result.summary.withoutWeight}`}
                warn={result.summary.withoutWeight > 0}
              />

              <div className="ml-auto flex items-center gap-2">
                {committed ? (
                  <span className="text-emerald-700 font-bold text-[13px]">
                    반영 완료 — 모델 {result.validRows}건이 카다로그에 들어갔습니다
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!canCommit || busy !== null}
                    onClick={() => file && void send(file, true)}
                    className="h-8 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-40"
                  >
                    {busy === "commit" ? "반영 중…" : "반영하기"}
                  </button>
                )}
                {result.reportUrl ? (
                  <a
                    href={result.reportUrl}
                    className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface inline-flex items-center"
                  >
                    결과 내려받기
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(result.summary.byPurity).map(([purity, count]) => (
                <span
                  key={purity}
                  className="px-2 py-0.5 rounded-full bg-surface text-[12px] font-semibold"
                >
                  {purity} {count}건
                </span>
              ))}
            </div>

            {result.notices.length > 0 ? (
              <ul className="mb-3 px-3 py-2 rounded-md bg-amber-50 text-amber-800 text-[12px] flex flex-col gap-1">
                {result.notices.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            ) : null}

            {result.errors.length > 0 ? (
              <div className="mb-4">
                <div className="font-bold text-[13px] mb-1 text-red-700">
                  고쳐야 할 행 {result.errorRows}건 — 엑셀에서 고친 뒤 다시 올려주세요
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-line">
                      <th className={th}>행</th>
                      <th className={th}>열</th>
                      <th className={th}>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={`${e.line}-${i}`} className="border-b border-line/60">
                        <td className={`${td} tabular-nums`}>{e.line}</td>
                        <td className={td}>{e.column || "—"}</td>
                        <td className={`${td} whitespace-normal`}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="font-bold text-[13px] mb-1">
              미리보기 (앞 {result.preview.length}행)
            </div>
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
                <tr>
                  <th className={th}>행</th>
                  <th className={th}>품번</th>
                  <th className={th}>품명</th>
                  <th className={th}>분류</th>
                  <th className={th}>순도</th>
                  <th className={thNum}>중량(g)</th>
                  <th className={thNum}>공임</th>
                  <th className={thNum}>메인알</th>
                  <th className={thNum}>보조알</th>
                  <th className={th}>매입처</th>
                  <th className={th}>메모</th>
                </tr>
              </thead>
              <tbody>
                {result.preview.map((p) => (
                  <tr key={p.line} className="border-b border-line/60">
                    <td className={`${td} tabular-nums text-caption`}>{p.line}</td>
                    <td className={`${td} tabular-nums`}>{p.code ?? "—"}</td>
                    <td className={`${td} font-semibold`}>{p.name}</td>
                    <td className={td}>{p.category}</td>
                    <td className={td}>{p.purityCode}</td>
                    <td className={tdNum}>{p.weightGram === null ? "—" : gram(p.weightGram)}</td>
                    <td className={tdNum}>{krw(p.laborFee)}</td>
                    <td className={tdNum}>{krw(p.mainStoneFee)}</td>
                    <td className={tdNum}>{krw(p.subStoneFee)}</td>
                    <td className={td}>{p.supplierName ?? "—"}</td>
                    <td className={td}>
                      {p.hasMemo ? (
                        <span className="px-1 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">
                          있음
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : busy === "verify" ? (
          <div className="text-caption text-[13px]">검증 중…</div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`px-2.5 py-1 rounded-md border ${warn ? "border-red-200 bg-red-50" : "border-line bg-white"}`}
    >
      <span className="text-[11px] text-caption mr-1.5">{label}</span>
      <span className={`text-[13px] font-bold tabular-nums ${warn ? "text-red-700" : ""}`}>
        {value}
      </span>
    </div>
  );
}
