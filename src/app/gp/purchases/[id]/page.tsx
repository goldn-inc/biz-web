"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_PURCHASE_KIND_LABEL,
  gram,
  krw,
  type GpCatalogProduct,
  type GpPurchaseDetail,
  type GpPurchaseLine,
} from "@/lib/gp";

const th = "px-2 py-1.5 text-[12px] font-semibold text-caption text-left whitespace-nowrap";
const thNum = `${th} text-right`;
const td = "px-2 py-1.5 text-[13px]";
const tdNum = `${td} text-right tabular-nums`;
const field = "h-8 w-full px-2 rounded border border-line bg-white text-[13px]";

/** 재고 만들기 폼 — 비우면 라인 값(개당 = 라인 ÷ 수량)을 그대로 쓴다. */
type ItemForm = {
  gpProductId: string;
  count: string;
  weightG: string;
  acquiredUnitCost: string;
};

function perUnit(line: GpPurchaseLine): { weightG: number | null; unitCost: number } {
  return {
    weightG: line.actualWeightG === null ? null : line.actualWeightG / line.quantity,
    unitCost: Math.round(line.totalAmount / line.quantity),
  };
}

/**
 * 매입 전표 상세 — 라인과 미수 요약, 그리고 라인에서 재고를 만드는 곳.
 *
 * 전표 자체는 거래처 원장이라 재고를 만들지 않는다. 여기서 모델을 지정해 만들 때 비로소 재고
 * 개체와 금 원장에 잡히고, 그 라인은 다시 만들 수 없게 잠긴다.
 */
export default function GpPurchaseDetailPage() {
  const { token } = useBizSession();
  const params = useParams<{ id: string }>();
  const purchaseId = params.id;

  const [detail, setDetail] = useState<GpPurchaseDetail | null>(null);
  const [products, setProducts] = useState<GpCatalogProduct[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ line: GpPurchaseLine; form: ItemForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    void bizApiFetch<GpPurchaseDetail>(`/biz/gp/purchases/${purchaseId}`, { token })
      .then((res) => {
        setDetail(res);
        setLoadError(null);
      })
      .catch((error) =>
        setLoadError(error instanceof BizApiError ? error.message : "전표를 불러오지 못했습니다."),
      );
  }, [purchaseId, token]);

  useEffect(() => {
    load();
    void bizApiFetch<{ products: GpCatalogProduct[] }>("/biz/gp/products", { token })
      .then((res) => setProducts(res.products))
      .catch(() => setMessage({ ok: false, text: "카다로그를 불러오지 못했습니다." }));
  }, [load, token]);

  /* 라인 재질과 같은 순도의 모델을 위로 올린다 — 수백 개 중에서 고르는 일이라 순서가 곧 속도다. */
  const candidates = useMemo(() => {
    const purity = target?.line.purityCode;
    if (!purity) return products;
    return [...products].sort(
      (a, b) => (a.purityCode === purity ? 0 : 1) - (b.purityCode === purity ? 0 : 1),
    );
  }, [products, target]);

  function openForm(line: GpPurchaseLine) {
    const unit = perUnit(line);
    setMessage(null);
    setTarget({
      line,
      form: {
        gpProductId: "",
        count: String(line.quantity),
        weightG: unit.weightG === null ? "" : unit.weightG.toFixed(3),
        acquiredUnitCost: String(unit.unitCost),
      },
    });
  }

  async function submit() {
    if (!target) return;
    if (!target.form.gpProductId) {
      setMessage({ ok: false, text: "만들 재고의 모델을 고르세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await bizApiFetch<{ serials: string[] }>(
        `/biz/gp/purchases/${purchaseId}/lines/${target.line.id}/items`,
        {
          method: "POST",
          token,
          body: {
            gpProductId: target.form.gpProductId,
            count: Number(target.form.count) || undefined,
            weightG: target.form.weightG ? Number(target.form.weightG) : undefined,
            acquiredUnitCost: target.form.acquiredUnitCost
              ? Number(target.form.acquiredUnitCost)
              : undefined,
          },
        },
      );
      setTarget(null);
      setMessage({
        ok: true,
        text: `재고 ${res.serials.length}건 생성 — ${res.serials.join(", ")}`,
      });
      load();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof BizApiError ? error.message : "재고를 만들지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div className="text-[13px] text-red-600">{loadError}</div>
        <Link href="/gp/purchases" className="text-[13px] text-primary underline">
          매입 등록으로
        </Link>
      </div>
    );
  }
  if (!detail) return <div className="p-6 text-[13px] text-caption">불러오는 중…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[18px] font-extrabold">매입 전표 {detail.purchaseNo}</h1>
        <Link href="/gp/purchases" className="text-[13px] text-primary underline">
          매입 등록으로
        </Link>
      </div>
      <div className="mt-1 text-[13px] text-body">
        {detail.purchaseDate} · {detail.supplierName ?? "—"}
        {detail.memo ? ` · ${detail.memo}` : ""}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
        {(
          [
            ["매입 전 미수", detail.summary.before],
            ["매입", detail.summary.purchase],
            ["결제 및 반품", detail.summary.settled],
            ["매입 후 미수", detail.summary.after],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="px-3 py-2 rounded-md border border-line bg-white">
            <div className="text-[12px] text-caption">{label}</div>
            <div className="font-bold tabular-nums">{krw(value.amount)}</div>
            <div className="text-[12px] text-caption tabular-nums">{gram(value.pureGram)}g</div>
          </div>
        ))}
      </div>

      {message ? (
        <div
          className={`mt-3 text-[13px] ${message.ok ? "text-emerald-700" : "text-red-600"}`}
          role="status"
        >
          {message.text}
        </div>
      ) : null}

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th className={th}>No</th>
            <th className={th}>구분</th>
            <th className={th}>비고사항</th>
            <th className={th}>재질</th>
            <th className={thNum}>실중량(g)</th>
            <th className={thNum}>해리</th>
            <th className={thNum}>순금(g)</th>
            <th className={thNum}>수량</th>
            <th className={thNum}>단가</th>
            <th className={thNum}>합계</th>
            <th className={th}>재고</th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((line) => (
            <tr key={line.id} className="border-b border-line/60">
              <td className={td}>{line.lineNo}</td>
              <td className={td}>{GP_PURCHASE_KIND_LABEL[line.kind]}</td>
              <td className={td}>{line.note ?? "—"}</td>
              <td className={td}>{line.purityCode ?? "—"}</td>
              <td className={tdNum}>{gram(line.actualWeightG)}</td>
              <td className={tdNum}>
                {line.hallmarkFactor === null ? "—" : line.hallmarkFactor.toFixed(3)}
              </td>
              <td className={tdNum}>{gram(line.pureGram)}</td>
              <td className={tdNum}>{line.quantity}</td>
              <td className={tdNum}>{krw(line.unitPrice)}</td>
              <td className={tdNum}>{krw(line.totalAmount)}</td>
              <td className={td}>
                {line.itemCount > 0 ? (
                  <span className="text-[12px] font-semibold text-emerald-700">
                    {line.itemCount}건 생성됨
                  </span>
                ) : line.kind === "PURCHASE" ? (
                  <button
                    type="button"
                    onClick={() => openForm(line)}
                    className="h-7 px-2 rounded border border-primary text-primary text-[12px] font-semibold"
                  >
                    재고 만들기
                  </button>
                ) : (
                  <span className="text-caption text-[12px]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {target ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6">
          <div className="w-[520px] max-w-full rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-[15px] font-extrabold">
              재고 만들기 — {target.line.lineNo}번 라인
            </h2>
            <p className="mt-1 text-[12px] text-caption">
              라인에는 모델이 없어 카다로그에서 골라야 합니다. 개당 중량·원가는 라인 값을 수량으로
              나눈 값이며, 다르면 고쳐서 저장하세요. 저장하면 금 원장에도 함께 잡힙니다.
            </p>

            <label className="mt-3 block text-[12px] text-caption">모델</label>
            <select
              className={field}
              value={target.form.gpProductId}
              onChange={(e) =>
                setTarget({ ...target, form: { ...target.form, gpProductId: e.target.value } })
              }
            >
              <option value="">선택</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ""}
                  {p.name} · {p.purityCode}
                </option>
              ))}
            </select>

            <div className="mt-3 grid grid-cols-3 gap-3">
              {(
                [
                  ["개수", "count"],
                  ["개당 실중량(g)", "weightG"],
                  ["개당 원가(원)", "acquiredUnitCost"],
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[12px] text-caption">{label}</label>
                  <input
                    className={`${field} text-right tabular-nums`}
                    inputMode="decimal"
                    value={target.form[key]}
                    onChange={(e) =>
                      setTarget({ ...target, form: { ...target.form, [key]: e.target.value } })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="h-9 px-3 rounded border border-line text-[13px]"
                disabled={busy}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                className="h-9 px-4 rounded bg-primary text-white text-[13px] font-semibold disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "만드는 중…" : "재고 만들기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
