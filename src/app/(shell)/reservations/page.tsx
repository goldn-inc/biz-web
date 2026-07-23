"use client";

import { useEffect, useState } from "react";
import { Badge, FilterChip, ListRow } from "@/components/ui";
import { AlertCircleIcon, BellIcon, CalendarIcon } from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  RESERVATION_STATUS_META as STATUS_META,
  ReservationConfirmDialog as ConfirmDialog,
  ReservationDetailPanel as DetailPanel,
  kstToday,
  toDateString,
  toReservation,
  type ApiReservation,
  type DestructiveAction,
  type Reservation,
  type ReservationStatus,
} from "@/components/reservations/ReservationFlow";

const STATUS_FILTERS: ReservationStatus[] = [
  "PENDING",
  "WAITLISTED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** KST 기준 이번주 월~일 */
function weekRange(): { from: string; to: string } {
  const today = kstToday();
  const day = today.getUTCDay(); // KST 로 밀어놨으니 UTC getter 사용
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getTime() + mondayOffset * 86400_000);
  const sunday = new Date(monday.getTime() + 6 * 86400_000);
  return { from: toDateString(monday), to: toDateString(sunday) };
}

type DateFilter = "today" | "week" | "custom";
type StatusFilter = "ALL" | ReservationStatus;

/** 예약 목록 + 상세 슬라이드오버 + 취소/노쇼 확인 다이얼로그를 포함한 사업자용 예약 관리 화면 */
export default function ReservationsPage() {
  const { token } = useBizSession();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ action: DestructiveAction; target: Reservation } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 로딩은 "현재 요청 키와 결과 키의 불일치"로 파생 — effect 내 동기 setState 없이
  // (react-hooks/set-state-in-effect) 날짜 필터 변경 시 자동으로 스켈레톤이 뜬다.
  const [result, setResult] = useState<{
    key: string;
    reservations?: Reservation[];
    error?: string;
  } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => weekRange());
  const requestKey =
    dateFilter === "custom"
      ? `custom:${customRange.from}:${customRange.to}:${reloadCount}`
      : `${dateFilter}:${reloadCount}`;
  const loading = result?.key !== requestKey;
  const reservations = (!loading && result?.reservations) || [];
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    const range =
      dateFilter === "today"
        ? { from: toDateString(kstToday()), to: toDateString(kstToday()) }
        : dateFilter === "custom"
          ? customRange
          : weekRange();
    void (async () => {
      try {
        const res = await bizApiFetch<{ reservations: ApiReservation[] }>(
          `/biz/reservations?from=${range.from}&to=${range.to}`,
          { token },
        );
        if (!cancelled) {
          setResult({ key: requestKey, reservations: res.reservations.map(toReservation) });
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error:
              error instanceof BizApiError ? error.message : "예약 목록을 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFilter, customRange, requestKey, token]);

  const visible = reservations.filter((r) =>
    statusFilter === "ALL" ? true : r.status === statusFilter,
  );

  const priority = visible.filter((r) => r.status === "PENDING" || r.status === "WAITLISTED");
  const rest = visible.filter((r) => r.status !== "PENDING" && r.status !== "WAITLISTED");

  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  const todayLabel = (() => {
    const t = kstToday();
    return `${t.getUTCFullYear()}년 ${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 (${WEEKDAYS[t.getUTCDay()]})`;
  })();

  function resetFilters() {
    setStatusFilter("ALL");
    setDateFilter("week");
  }

  async function applyStatus(id: string, status: ReservationStatus) {
    setActionError(null);
    try {
      await bizApiFetch<{ ok: true }>(`/biz/reservations/${id}/status`, {
        method: "PATCH",
        body: { status },
        token,
      });
      setResult((prev) =>
        prev?.reservations
          ? {
              ...prev,
              reservations: prev.reservations.map((r) => (r.id === id ? { ...r, status } : r)),
            }
          : prev,
      );
      return true;
    } catch (error) {
      setActionError(
        error instanceof BizApiError ? error.message : "상태를 변경하지 못했습니다.",
      );
      return false;
    }
  }

  async function handleConfirm(r: Reservation) {
    if (await applyStatus(r.id, "CONFIRMED")) setSelectedId(null);
  }

  async function handleComplete(r: Reservation) {
    if (await applyStatus(r.id, "COMPLETED")) setSelectedId(null);
  }

  async function confirmDialog() {
    if (!dialog) return;
    const ok = await applyStatus(dialog.target.id, dialog.action);
    setDialog(null);
    if (ok) setSelectedId(null);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">예약</h1>
          <div className="text-sm text-caption mt-1.5">
            {todayLabel} · KST ·{" "}
            {dateFilter === "today" ? "오늘" : dateFilter === "week" ? "이번주" : "선택기간"}{" "}
            {reservations.length}건
          </div>
        </div>
        <button
          aria-label="알림"
          className="relative w-11 h-11 rounded-2xl bg-white border border-line grid place-items-center text-body hover:text-primary hover:border-primary-light shrink-0"
        >
          <BellIcon className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary ring-2 ring-white" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-bold text-caption mr-0.5">상태</span>
          <FilterChip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>
            전체 {reservations.length}
          </FilterChip>
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {STATUS_META[s].label}
            </FilterChip>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-bold text-caption mr-0.5">날짜</span>
          <div className="flex bg-white border border-line rounded-xl p-0.5 gap-0.5">
            <DateToggle active={dateFilter === "today"} onClick={() => setDateFilter("today")}>
              오늘
            </DateToggle>
            <DateToggle active={dateFilter === "week"} onClick={() => setDateFilter("week")}>
              이번주
            </DateToggle>
            <DateToggle active={dateFilter === "custom"} onClick={() => setDateFilter("custom")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              직접선택
            </DateToggle>
          </div>
          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="조회 시작일"
                value={customRange.from}
                max={customRange.to}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setCustomRange((prev) => ({ from: v, to: v > prev.to ? v : prev.to }));
                }}
                className="h-8 px-2.5 rounded-lg bg-white border border-line text-xs font-semibold text-body focus:border-primary-light focus:outline-none"
              />
              <span className="text-xs text-caption">~</span>
              <input
                type="date"
                aria-label="조회 종료일"
                value={customRange.to}
                min={customRange.from}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setCustomRange((prev) => ({ from: v < prev.from ? v : prev.from, to: v }));
                }}
                className="h-8 px-2.5 rounded-lg bg-white border border-line text-xs font-semibold text-body focus:border-primary-light focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">{actionError}</p>
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => setReloadCount((n) => n + 1)} />
      ) : visible.length === 0 ? (
        <EmptyState onReset={resetFilters} />
      ) : (
        <>
          {priority.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <h2 className="text-sm font-extrabold text-body m-0">
                  우선 확인 필요 · {priority.length}건
                </h2>
                <span className="text-xs text-caption">
                  대기중·대기목록 예약은 응답 전까지 상단에 고정됩니다
                </span>
              </div>
              <div className="bg-white border-2 border-orange-100 rounded-3xl shadow-sm shadow-primary/5 overflow-hidden">
                {priority.map((r) => (
                  <ReservationRow key={r.id} reservation={r} onOpen={() => setSelectedId(r.id)} />
                ))}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-body m-0">전체 예약</h2>
              <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
                {rest.map((r) => (
                  <ReservationRow key={r.id} reservation={r} onOpen={() => setSelectedId(r.id)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selected && (
        <DetailPanel
          reservation={selected}
          onClose={() => setSelectedId(null)}
          onConfirm={() => void handleConfirm(selected)}
          onComplete={() => void handleComplete(selected)}
          onNoShow={() => setDialog({ action: "NO_SHOW", target: selected })}
          onCancel={() => setDialog({ action: "CANCELLED", target: selected })}
        />
      )}

      {dialog && (
        <ConfirmDialog
          action={dialog.action}
          target={dialog.target}
          onClose={() => setDialog(null)}
          onConfirm={() => void confirmDialog()}
        />
      )}
    </>
  );
}

function ReservationRow({
  reservation,
  onOpen,
}: {
  reservation: Reservation;
  onOpen: () => void;
}) {
  const meta = STATUS_META[reservation.status];
  return (
    <ListRow>
      <div className="w-20 shrink-0">
        <div className="text-sm font-extrabold">{reservation.time}</div>
        <div className="text-xs text-caption">{reservation.dateLabel}</div>
      </div>
      <div className="flex-1 min-w-32">
        <div className="text-sm font-bold">{reservation.maskedName}</div>
        <div className="text-xs text-caption tabular-nums">{reservation.phone ?? "-"}</div>
      </div>
      <div className="flex-[2] min-w-36 text-sm text-body">{reservation.purpose}</div>
      <Badge tone={meta.tone} className="shrink-0">
        {meta.label}
      </Badge>
      <button
        onClick={onOpen}
        className="shrink-0 h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold"
      >
        상세보기
      </button>
    </ListRow>
  );
}

function DateToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3.5 rounded-lg text-xs inline-flex items-center gap-1.5 transition ${
        active ? "bg-primary text-white font-bold" : "text-caption font-semibold hover:text-body"
      }`}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3">
      <div className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-12 rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-50 grid place-items-center text-red-500">
        <AlertCircleIcon className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold">예약 목록을 불러오지 못했습니다</div>
      <p className="text-xs text-caption leading-relaxed m-0">{message}</p>
      <button
        onClick={onRetry}
        className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold"
      >
        다시 시도
      </button>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="bg-white border border-line rounded-3xl shadow-sm p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
        <CalendarIcon className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold">조건에 맞는 예약이 없습니다</div>
      <p className="text-xs text-caption leading-relaxed m-0">필터를 바꾸거나 날짜 범위를 넓혀보세요.</p>
      <button
        onClick={onReset}
        className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold"
      >
        필터 초기화
      </button>
    </div>
  );
}
