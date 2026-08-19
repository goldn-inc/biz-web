"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  GP_CATEGORY_LABEL,
  GP_EVENT_LABEL,
  GP_METAL_LABEL,
  GP_PURITIES_BY_METAL,
  GP_SOURCE_LABEL,
  GP_STATUS_LABEL,
  gram,
  krw,
  kstDateTime,
  type GpItemDetail,
  type GpProductLite,
} from "@/lib/gp";

const field = "h-8 px-2 rounded-md border border-line bg-white w-full";
const label = "text-[12px] font-bold text-caption";

type EditForm = {
  weightG: string;
  purityCode: string;
  acquiredUnitCost: string;
  acquiredLaborFee: string;
  gpProductId: string;
};

/**
 * GP 재고 상세(§8.1) — 개체 카드 + 이력 타임라인 + 액션.
 * 골드펜 「수정」 대응: DIRECT 개체만 수정 허용(도매 유래는 본사 실측 write-once),
 * 「삭제」 대응: VOID(사유 필수) — 행이 사라지는 경로는 없다.
 */
export default function GpItemDetailPage() {
  const { token } = useBizSession();
  const params = useParams<{ serial: string }>();
  const router = useRouter();
  const serial = decodeURIComponent(params.serial);

  const [data, setData] = useState<GpItemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [products, setProducts] = useState<GpProductLite[]>([]);

  const load = useCallback(() => {
    void bizApiFetch<GpItemDetail>(`/biz/gp/items/${encodeURIComponent(serial)}`, { token })
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((error) =>
        setLoadError(
          error instanceof BizApiError ? error.message : "개체를 불러오지 못했습니다.",
        ),
      );
  }, [serial, token]);
  useEffect(load, [load]);

  useEffect(() => {
    void bizApiFetch<{ products: GpProductLite[] }>("/biz/gp/products", { token })
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [token]);

  /** 액션 공통 — 성공 시 재조회, 메시지는 상단 배너로. */
  const run = useCallback(
    (path: string, body?: unknown, doneMsg?: string) => {
      setBusy(true);
      setActionError(null);
      setActionMsg(null);
      void (async () => {
        try {
          await bizApiFetch(`/biz/gp/items/${encodeURIComponent(serial)}${path}`, {
            method: path === "" ? "PATCH" : "POST",
            body,
            token,
          });
          if (doneMsg) setActionMsg(doneMsg);
          setVoidOpen(false);
          setEditOpen(false);
          load();
        } catch (error) {
          setActionError(
            error instanceof BizApiError ? error.message : "처리에 실패했습니다.",
          );
        } finally {
          setBusy(false);
        }
      })();
    },
    [serial, token, load],
  );

  const openEdit = useCallback(() => {
    if (!data) return;
    setEditForm({
      weightG: data.weightG != null ? String(data.weightG) : "",
      purityCode: data.purityCode,
      acquiredUnitCost: data.acquiredUnitCost != null ? String(data.acquiredUnitCost) : "",
      acquiredLaborFee: data.acquiredLaborFee != null ? String(data.acquiredLaborFee) : "",
      gpProductId: data.gpProductId,
    });
    setEditOpen(true);
  }, [data]);

  const submitEdit = useCallback(() => {
    if (!editForm || !data) return;
    const weight = Number(editForm.weightG);
    if (!Number.isFinite(weight) || weight <= 0) {
      setActionError("실중량(g)을 입력하세요.");
      return;
    }
    run(
      "",
      {
        weightG: weight,
        purityCode: editForm.purityCode,
        ...(editForm.acquiredUnitCost.trim()
          ? { acquiredUnitCost: Number(editForm.acquiredUnitCost) }
          : {}),
        ...(editForm.acquiredLaborFee.trim()
          ? { acquiredLaborFee: Number(editForm.acquiredLaborFee) }
          : {}),
        ...(editForm.gpProductId !== data.gpProductId
          ? { gpProductId: editForm.gpProductId }
          : {}),
      },
      "수정했습니다. 순중량 변화분은 금 원장에 자동 보정됐습니다.",
    );
  }, [editForm, data, run]);

  /** 모델 재연결 후보 — 같은 재질만(원장 재질이 얽힘, §8.1). */
  const productOptions = useMemo(
    () => (data ? products.filter((p) => p.metalType === data.metalType) : []),
    [products, data],
  );

  const statusChip: Record<string, string> = {
    IN_STOCK: "bg-emerald-50 text-emerald-700",
    RENTED: "bg-amber-50 text-amber-700",
    SOLD: "bg-slate-100 text-slate-500",
    ADJUSTED_OUT: "bg-red-50 text-red-600",
    VOID: "bg-slate-100 text-slate-400 line-through",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white">
      <div className="px-4 pt-3 pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-8 px-2 rounded-md border border-line text-body hover:bg-surface"
            title="뒤로"
          >
            ←
          </button>
          <h1 className="text-[15px] font-extrabold font-mono">{serial}</h1>
          {data ? (
            <span
              className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${statusChip[data.status]}`}
            >
              {GP_STATUS_LABEL[data.status]}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/gp/inventory"
              className="h-8 px-3 inline-flex items-center rounded-md border border-line text-body hover:bg-surface"
            >
              재고 목록
            </Link>
          </div>
        </div>
      </div>

      {actionMsg ? (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700 text-[13px]">
          {actionMsg}
        </div>
      ) : null}
      {actionError ? (
        <div className="mx-4 mt-3 px-3 py-2 rounded-md bg-red-50 text-red-600 text-[13px]">
          {actionError}
        </div>
      ) : null}

      {loadError ? (
        <div className="p-6 text-center text-red-600">{loadError}</div>
      ) : !data ? (
        <div className="p-6 text-center text-caption">불러오는 중…</div>
      ) : (
        <div className="p-4 flex gap-4 items-start">
          {/* 개체 카드 */}
          <div className="w-[380px] shrink-0 rounded-lg border border-line p-4">
            <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 text-[13px]">
              {(
                [
                  ["품명", data.productName],
                  ["분류", GP_CATEGORY_LABEL[data.category]],
                  ["재질", GP_METAL_LABEL[data.metalType]],
                  ["순도", data.purityCode === "UNKNOWN" ? "미상" : data.purityCode],
                  ["실중량", `${gram(data.weightG)}g`],
                  ["순중량", `${gram(data.pureGram)}g`],
                  ["매입원가", krw(data.acquiredUnitCost)],
                  ["매입공임", krw(data.acquiredLaborFee)],
                  [
                    data.tagPriceSource === "SPOT" ? "소비자가(TAG, 시세)" : "소비자가(TAG)",
                    krw(data.tagPriceSource === "SPOT" ? data.linkedTagPrice : data.tagPrice),
                  ],
                  ["입고 경로", GP_SOURCE_LABEL[data.source]],
                  [
                    "입고처",
                    data.supplierName ?? (data.source === "WHOLESALE" ? "본사(도매)" : "—"),
                  ],
                  ["입고일", kstDateTime(data.receivedAt)],
                  ["판매일", kstDateTime(data.soldAt)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-caption">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            {/* 액션 — 상태에 따라 노출(§8.1) */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run("/label", undefined, "라벨을 인쇄 대기열에 넣었습니다.")
                }
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface disabled:opacity-50"
                title="바코드 라벨 인쇄 큐잉"
              >
                라벨 출력
              </button>
              {data.status === "IN_STOCK" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("/rent", undefined, "대여 처리했습니다.")}
                  className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface disabled:opacity-50"
                >
                  대여
                </button>
              ) : null}
              {data.status === "RENTED" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("/rent-return", undefined, "반납 처리했습니다.")}
                  className="h-8 px-3 rounded-md bg-amber-500 hover:bg-amber-400 text-white font-bold disabled:opacity-50"
                >
                  대여 반납
                </button>
              ) : null}
              {data.status === "IN_STOCK" && data.source === "DIRECT" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={openEdit}
                  className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
                >
                  수정
                </button>
              ) : null}
              {data.status === "IN_STOCK" || data.status === "ADJUSTED_OUT" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setVoidReason("");
                    setVoidOpen(true);
                  }}
                  className="h-8 px-3 rounded-md border border-red-200 text-red-600 font-semibold hover:bg-red-50 disabled:opacity-50"
                >
                  VOID(오등록)
                </button>
              ) : null}
            </div>
            {data.source === "WHOLESALE" ? (
              <p className="mt-2 text-[12px] text-caption">
                도매 유래 개체는 본사 실측이 기준이라 수정할 수 없습니다.
              </p>
            ) : null}
          </div>

          {/* 이력 타임라인 */}
          <div className="flex-1 min-w-0 rounded-lg border border-line p-4">
            <div className="text-[12px] font-bold text-caption mb-2">
              이력 ({data.events.length})
            </div>
            <ul className="flex flex-col">
              {data.events.map((ev, i) => (
                <li key={i} className="flex items-start gap-2 border-b border-line/60 py-1.5">
                  <span className="font-semibold whitespace-nowrap">
                    {GP_EVENT_LABEL[ev.eventType] ?? ev.eventType}
                  </span>
                  {ev.metadata && typeof ev.metadata.reason === "string" ? (
                    <span className="text-[12px] text-caption truncate">
                      — {ev.metadata.reason}
                    </span>
                  ) : null}
                  <span className="ml-auto text-caption tabular-nums whitespace-nowrap text-[12px]">
                    {kstDateTime(ev.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* VOID 모달 — 사유 필수 */}
      {voidOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
          onMouseDown={() => setVoidOpen(false)}
        >
          <div
            className="w-[420px] bg-white rounded-lg border border-line shadow-xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="font-extrabold text-[14px] mb-1">VOID — 오등록 종결</h2>
            <p className="text-[12px] text-caption mb-2">
              행은 사라지지 않고 무효 상태로 남습니다. 재고에서 VOID 하면 입고 때 기입된 금
              원장이 반대 기입됩니다.
            </p>
            <input
              autoFocus
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="사유 (필수)"
              className={field}
            />
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy || !voidReason.trim()}
                onClick={() =>
                  run("/void", { reason: voidReason.trim() }, "VOID 처리했습니다.")
                }
                className="h-8 px-4 rounded-md bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
              >
                VOID 확정
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* DIRECT 개체 수정 모달(§8.1) */}
      {editOpen && editForm && data ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 flex items-center justify-center"
          onMouseDown={() => setEditOpen(false)}
        >
          <div
            className="w-[440px] bg-white rounded-lg border border-line shadow-xl p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="font-extrabold text-[14px] mb-1">개체 수정</h2>
            <p className="text-[12px] text-caption mb-2">
              순중량이 변하면 변화분이 금 원장에 자동 보정 기입됩니다(수정 이력이 남습니다).
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <div className={label}>실중량(g)</div>
                <input
                  value={editForm.weightG}
                  onChange={(e) =>
                    setEditForm((c) => c && { ...c, weightG: e.target.value })
                  }
                  inputMode="decimal"
                  className={field}
                />
              </div>
              <div>
                <div className={label}>순도</div>
                <select
                  value={editForm.purityCode}
                  onChange={(e) =>
                    setEditForm((c) => c && { ...c, purityCode: e.target.value })
                  }
                  className={field}
                >
                  {GP_PURITIES_BY_METAL[data.metalType].map((p) => (
                    <option key={p} value={p}>
                      {p === "UNKNOWN" ? "미상" : p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={label}>매입원가(원)</div>
                <input
                  value={editForm.acquiredUnitCost}
                  onChange={(e) =>
                    setEditForm((c) => c && { ...c, acquiredUnitCost: e.target.value })
                  }
                  inputMode="numeric"
                  className={field}
                />
              </div>
              <div>
                <div className={label}>매입공임(원)</div>
                <input
                  value={editForm.acquiredLaborFee}
                  onChange={(e) =>
                    setEditForm((c) => c && { ...c, acquiredLaborFee: e.target.value })
                  }
                  inputMode="numeric"
                  className={field}
                />
              </div>
              <div className="col-span-2">
                <div className={label}>모델 (같은 재질만)</div>
                <select
                  value={editForm.gpProductId}
                  onChange={(e) =>
                    setEditForm((c) => c && { ...c, gpProductId: e.target.value })
                  }
                  className={field}
                >
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.purityCode === "UNKNOWN" ? "미상" : p.purityCode})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="h-8 px-3 rounded-md border border-line text-body hover:bg-surface"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitEdit}
                className="h-8 px-4 rounded-md bg-primary hover:bg-primary-light text-white font-bold disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
