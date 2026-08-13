"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiDownload, bizApiFetch, bizApiUpload, BizApiError } from "@/lib/api";
import {
  GP_CATEGORY_LABEL,
  GP_METAL_LABEL,
  gram,
  krw,
  kstDateTime,
  type GpImportHistoryRow,
  type GpImportResult,
} from "@/lib/gp";

/**
 * 초기 재고 이관(CSV) — 기존 프로그램·수기 장부를 쓰던 매장이 보유 재고를 한 번에 넣는 화면.
 *
 * 2단계로 나눠 놓은 이유: 대량 쓰기는 반드시 사고가 나는데, 되돌리는 비용이 확인하는 비용보다
 * 훨씬 크다. 그래서 파일을 고르면 먼저 검증만 하고(DB 무변경), 오류가 0건일 때만 반영 버튼이 열린다.
 */
export default function GpImportPage() {
  const { token } = useBizSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<GpImportResult | null>(null);
  const [busy, setBusy] = useState<"verify" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GpImportHistoryRow[]>([]);

  const loadHistory = useCallback(() => {
    void bizApiFetch<{ imports: GpImportHistoryRow[] }>("/biz/gp/import/history", { token })
      .then((r) => setHistory(r.imports))
      .catch(() => setHistory([]));
  }, [token]);
  useEffect(loadHistory, [loadHistory]);

  const send = useCallback(
    async (target: File, commit: boolean) => {
      setBusy(commit ? "commit" : "verify");
      setError(null);
      try {
        const form = new FormData();
        form.append("file", target);
        const res = await bizApiUpload<GpImportResult>(
          `/biz/gp/import${commit ? "?commit=true" : ""}`,
          form,
          token,
        );
        setResult(res);
        if (commit) loadHistory();
      } catch (err) {
        setError(err instanceof BizApiError ? err.message : "파일을 처리하지 못했습니다.");
        if (commit) setResult(null);
      } finally {
        setBusy(null);
      }
    },
    [token, loadHistory],
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
          <h1 className="text-[15px] font-extrabold">초기 재고 이관</h1>
          <span className="text-caption text-[12px]">
            보유 재고를 CSV 한 장으로 등록합니다 — 도매 입고분은 자동으로 들어오므로 올리지 마세요
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void bizApiDownload(
                  "/biz/gp/import/template",
                  "gp-import-template.csv",
                  token,
                ).catch(() => setError("템플릿을 내려받지 못했습니다."));
              }}
              className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
            >
              템플릿 내려받기
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              CSV 선택
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="flex-1 overflow-auto bg-white px-4 py-3 flex flex-col gap-3">
        {file === null ? (
          <div className="max-w-2xl">
            <div className="rounded-lg border border-line p-4 leading-relaxed">
              <div className="font-bold mb-2">올리기 전에</div>
              <ol className="list-decimal pl-5 flex flex-col gap-1 text-body">
                <li>
                  템플릿을 내려받아 열 이름을 맞춰주세요. <b>모델명·재질·순도</b>는 필수이고
                  나머지는 비워도 됩니다.
                </li>
                <li>
                  엑셀에서 저장할 때 파일 형식을 <b>&quot;CSV UTF-8(쉼표로 분리)&quot;</b>로
                  골라주세요. 그냥 CSV 로 저장하면 한글이 깨져서 올라가지 않습니다.
                </li>
                <li>
                  <b>한 줄이 물건 하나</b>입니다. 같은 반지가 5개면 5줄로 적어주세요.
                </li>
                <li>
                  파일을 고르면 먼저 검사만 합니다. 재고에 실제로 들어가는 건 확인 후 버튼을
                  누를 때입니다.
                </li>
              </ol>
            </div>
          </div>
        ) : null}

        {busy === "verify" ? <div className="text-caption">파일을 검사하는 중…</div> : null}
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            {error}
          </div>
        ) : null}

        {result ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{result.fileName}</span>
              <span className="text-caption tabular-nums">{result.totalRows.toLocaleString()}행</span>
              {result.errorRows > 0 ? (
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold tabular-nums">
                  오류 {result.errorRows.toLocaleString()}행
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
                  오류 없음
                </span>
              )}
              {committed ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                  반영 완료
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-1.5">
                {result.reportUrl ? (
                  <a
                    href={result.reportUrl}
                    className="h-8 px-3 inline-flex items-center rounded-md border border-line hover:bg-surface"
                  >
                    결과 리포트 받기
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={!canCommit || busy !== null}
                  onClick={() => file && void send(file, true)}
                  className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:bg-slate-300"
                >
                  {busy === "commit"
                    ? "반영 중…"
                    : `재고에 반영 (${result.validRows.toLocaleString()}개)`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Stat label="등록될 개체" value={result.validRows.toLocaleString()} />
              <Stat label="새 모델" value={result.summary.newProducts.toLocaleString()} />
              <Stat label="새 거래처" value={result.summary.newSuppliers.toLocaleString()} />
              <Stat label="순금" value={`${gram(result.summary.goldPureGram)}g`} />
              <Stat label="순은" value={`${gram(result.summary.silverPureGram)}g`} />
              <Stat label="매입원가 합계" value={krw(result.summary.acquiredCostTotal)} />
              {result.summary.unconvertibleCount > 0 ? (
                <Stat
                  label="순금 환산 불가"
                  value={`${result.summary.unconvertibleCount.toLocaleString()}개`}
                  warn
                />
              ) : null}
            </div>

            {result.notices.length > 0 ? (
              <ul className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-blue-900 list-disc pl-8 flex flex-col gap-0.5">
                {result.notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            {result.errors.length > 0 ? (
              <div className="rounded-md border border-red-200 overflow-hidden">
                <div className="px-3 py-1.5 bg-red-50 text-red-700 font-bold">
                  고쳐야 하는 행 — 엑셀의 행 번호와 같습니다
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full border-collapse">
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={`${e.line}-${e.column}-${i}`} className="border-t border-line/60">
                          <td className="px-3 py-1 w-16 tabular-nums text-caption">{e.line}행</td>
                          <td className="px-3 py-1 w-24 font-semibold">{e.column}</td>
                          <td className="px-3 py-1">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {result.preview.length > 0 ? (
              <div className="rounded-md border border-line overflow-hidden">
                <div className="px-3 py-1.5 bg-surface font-bold">
                  미리보기 — 앞 {result.preview.length}행
                </div>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_var(--color-line)]">
                      <tr className="text-left text-caption">
                        <th className="px-3 py-1.5 font-semibold">행</th>
                        <th className="px-3 py-1.5 font-semibold">모델명</th>
                        <th className="px-3 py-1.5 font-semibold">분류</th>
                        <th className="px-3 py-1.5 font-semibold">재질·순도</th>
                        <th className="px-3 py-1.5 font-semibold text-right">중량</th>
                        <th className="px-3 py-1.5 font-semibold text-right">순금</th>
                        <th className="px-3 py-1.5 font-semibold text-right">매입원가</th>
                        <th className="px-3 py-1.5 font-semibold">거래처</th>
                        <th className="px-3 py-1.5 font-semibold">바코드</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview.map((r) => (
                        <tr key={r.line} className="border-t border-line/60">
                          <td className="px-3 py-1 tabular-nums text-caption">{r.line}</td>
                          <td className="px-3 py-1 font-semibold">{r.productName}</td>
                          <td className="px-3 py-1">{GP_CATEGORY_LABEL[r.category]}</td>
                          <td className="px-3 py-1">
                            {GP_METAL_LABEL[r.metalType]} {r.purityCode}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">{gram(r.weightG)}</td>
                          <td className="px-3 py-1 text-right tabular-nums">{gram(r.pureGram)}</td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {krw(r.acquiredUnitCost)}
                          </td>
                          <td className="px-3 py-1">{r.supplierName ?? "—"}</td>
                          <td className="px-3 py-1 tabular-nums">{r.externalBarcode ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {history.length > 0 ? (
          <div className="rounded-md border border-line overflow-hidden max-w-3xl">
            <div className="px-3 py-1.5 bg-surface font-bold">이관 이력</div>
            <table className="w-full border-collapse">
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-line/60">
                    <td className="px-3 py-1 text-caption tabular-nums w-36">
                      {kstDateTime(h.createdAt)}
                    </td>
                    <td className="px-3 py-1 font-semibold">{h.fileName}</td>
                    <td className="px-3 py-1 text-right tabular-nums w-28">
                      {h.createdItems.toLocaleString()}개 등록
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`px-3 py-1.5 rounded-md border ${
        warn ? "border-amber-300 bg-amber-50" : "border-line bg-surface"
      }`}
    >
      <div className="text-[11px] text-caption">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
