"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, FilterChip, ListRow } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BellIcon,
  CalendarIcon,
  PhoneIcon,
  XIcon,
} from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";

type ReservationStatus =
  | "PENDING"
  | "WAITLISTED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

/** GET /biz/reservations 응답 항목 — 이름은 서버에서 마스킹, 전화는 원본(연락 용도). */
type ApiReservation = {
  id: string;
  displayNo: string | null;
  visitDate: string | null;
  visitSlot: string | null;
  purpose: string | null;
  status: ReservationStatus;
  customerName: string;
  customerPhone: string | null;
  hasLinkedTransaction: boolean;
  createdAt: string;
};

type Reservation = {
  id: string;
  code: string;
  time: string;
  dateLabel: string;
  datetimeFull: string;
  maskedName: string;
  initial: string;
  phone: string | null;
  purpose: string;
  hasLinkedTransaction: boolean;
  createdLabel: string;
  status: ReservationStatus;
};

const STATUS_META: Record<ReservationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "대기중", tone: "slate" },
  WAITLISTED: { label: "대기목록", tone: "violet" },
  CONFIRMED: { label: "확정", tone: "primary" },
  COMPLETED: { label: "방문완료", tone: "green" },
  CANCELLED: { label: "취소", tone: "slate" },
  NO_SHOW: { label: "노쇼", tone: "red" },
};

const STATUS_FILTERS: ReservationStatus[] = [
  "PENDING",
  "WAITLISTED",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

/** delivery_schedules.visit_purpose 어휘 → 라벨 (mobile visit-history 와 동일 매핑) */
const PURPOSE_LABEL: Record<string, string> = {
  buy_gold: "최고가 매입",
  sell: "팔래요",
  purchase: "살래요",
  other: "매장 방문",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** KST(UTC+9) 오늘 — 서버 kstTodayString 과 동일 규약 */
function kstToday(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** KST 기준 이번주 월~일 */
function weekRange(): { from: string; to: string } {
  const today = kstToday();
  const day = today.getUTCDay(); // KST 로 밀어놨으니 UTC getter 사용
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getTime() + mondayOffset * 86400_000);
  const sunday = new Date(monday.getTime() + 6 * 86400_000);
  return { from: toDateString(monday), to: toDateString(sunday) };
}

function dateLabelOf(visitDate: string | null): string {
  if (!visitDate) return "-";
  const today = toDateString(kstToday());
  const d = new Date(`${visitDate}T00:00:00Z`);
  const short = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  if (visitDate === today) return `오늘 ${short}`;
  return `${WEEKDAYS[d.getUTCDay()]} ${short}`;
}

function toReservation(api: ApiReservation): Reservation {
  const d = api.visitDate ? new Date(`${api.visitDate}T00:00:00Z`) : null;
  const created = new Date(api.createdAt);
  return {
    id: api.id,
    code: api.displayNo ?? api.id.slice(0, 8).toUpperCase(),
    time: api.visitSlot ?? "-",
    dateLabel: dateLabelOf(api.visitDate),
    datetimeFull: d
      ? `${api.visitDate} (${WEEKDAYS[d.getUTCDay()]}) ${api.visitSlot ?? ""} KST`.trim()
      : "-",
    maskedName: api.customerName,
    initial: api.customerName.charAt(0) || "고",
    phone: api.customerPhone,
    purpose: (api.purpose && PURPOSE_LABEL[api.purpose]) || api.purpose || "매장 방문",
    hasLinkedTransaction: api.hasLinkedTransaction,
    createdLabel: `${created.getMonth() + 1}월 ${created.getDate()}일 생성`,
    status: api.status,
  };
}

type DateFilter = "today" | "week" | "custom";
type StatusFilter = "ALL" | ReservationStatus;
type DestructiveAction = "CANCELLED" | "NO_SHOW";

const TERMINAL_STATUSES: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

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
  const rangeMode = dateFilter === "today" ? "today" : "week";
  const requestKey = `${rangeMode}:${reloadCount}`;
  const loading = result?.key !== requestKey;
  const reservations = (!loading && result?.reservations) || [];
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    // 직접선택(custom)은 달력 연동 전까지 이번주와 동일 범위로 취급
    const range =
      rangeMode === "today"
        ? { from: toDateString(kstToday()), to: toDateString(kstToday()) }
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
  }, [rangeMode, requestKey, token]);

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
            {todayLabel} · KST · {dateFilter === "today" ? "오늘" : "이번주"} {reservations.length}건
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
            {/* TODO: 직접선택 날짜 범위 피커 — 현재는 이번주와 동일 범위 */}
            <DateToggle active={dateFilter === "custom"} onClick={() => setDateFilter("custom")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              직접선택
            </DateToggle>
          </div>
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

function DetailPanel({
  reservation,
  onClose,
  onConfirm,
  onComplete,
  onNoShow,
  onCancel,
}: {
  reservation: Reservation;
  onClose: () => void;
  onConfirm: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}) {
  const meta = STATUS_META[reservation.status];
  const isTerminal = TERMINAL_STATUSES.includes(reservation.status);
  const needsResponse = reservation.status === "PENDING" || reservation.status === "WAITLISTED";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="예약 상세"
        className="relative w-full lg:w-[460px] lg:h-full mt-auto lg:mt-0 bg-white lg:border-l border-line rounded-t-3xl lg:rounded-none shadow-2xl overflow-y-auto max-h-[88%] lg:max-h-full flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-line">
          <div>
            <div className="text-xs font-semibold text-caption">{reservation.code}</div>
            <h2 className="text-lg font-extrabold m-0">예약 상세</h2>
          </div>
          <button
            aria-label="닫기"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-line grid place-items-center text-body"
          >
            <XIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Badge tone={meta.tone} className="px-3.5 py-1.5">
              {meta.label}
            </Badge>
            <div className="text-xs text-caption">소비자 앱 접수 · {reservation.createdLabel}</div>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-3">
            <DetailRow label="예약일시" value={reservation.datetimeFull} />
            <DetailRow label="방문목적" value={reservation.purpose} />
            <DetailRow
              label="연결 거래"
              value={reservation.hasLinkedTransaction ? "연결된 거래 있음" : "없음"}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-extrabold text-body m-0">고객 정보</h3>
            <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl px-[18px] py-4">
              <div className="w-11 h-11 rounded-full bg-orange-50 border border-orange-100 grid place-items-center text-base font-extrabold text-primary shrink-0">
                {reservation.initial}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">{reservation.maskedName}</div>
                <div className="text-xs text-caption tabular-nums">{reservation.phone ?? "-"}</div>
              </div>
              {reservation.phone && (
                <a
                  href={`tel:${reservation.phone}`}
                  className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <PhoneIcon className="w-3.5 h-3.5" />
                  전화
                </a>
              )}
            </div>
            <div className="text-xs text-caption leading-relaxed">
              고객 개인정보 보호를 위해 이름은 마스킹된 형태로만 제공됩니다.
            </div>
          </div>

          {!reservation.hasLinkedTransaction &&
            reservation.status !== "CANCELLED" &&
            reservation.status !== "NO_SHOW" && (
              <Link
                href={`/transactions?reservationId=${reservation.id}${
                  reservation.phone ? `&phone=${encodeURIComponent(reservation.phone)}` : ""
                }`}
                className="h-[52px] rounded-2xl bg-ink hover:bg-body text-white text-sm font-bold grid place-items-center"
              >
                거래 시작 — 현장 매입 등록
              </Link>
            )}

          {isTerminal ? (
            <div className="bg-surface border border-line rounded-2xl px-[18px] py-4 text-xs text-caption leading-relaxed">
              이미 {meta.label} 처리된 예약입니다. 추가 상태 변경은 할 수 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-sm font-extrabold text-body m-0">상태 변경</h3>
              {needsResponse && (
                <Button className="h-[52px] rounded-2xl" onClick={onConfirm}>
                  예약 확정
                </Button>
              )}
              <Button
                className={`h-[52px] rounded-2xl ${needsResponse ? "bg-white !text-body border border-line hover:bg-slate-50" : ""}`}
                onClick={onComplete}
              >
                방문완료 처리
              </Button>
              <div className="flex gap-2.5">
                <button
                  onClick={onNoShow}
                  className="flex-1 h-12 rounded-2xl bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold"
                >
                  노쇼 처리
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold"
                >
                  예약 취소
                </button>
              </div>
              <div className="text-xs text-caption leading-relaxed">
                취소·노쇼 처리는 확인 후 되돌릴 수 없습니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-caption">{label}</span>
      <span className="text-sm font-bold text-right">{value}</span>
    </div>
  );
}

function ConfirmDialog({
  action,
  target,
  onClose,
  onConfirm,
}: {
  action: DestructiveAction;
  target: Reservation;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isNoShow = action === "NO_SHOW";
  const when = `${target.dateLabel.replace(/^\S+\s/, "")} ${target.time}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5 bg-slate-900/45">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 flex flex-col gap-4"
      >
        <div
          className={`w-12 h-12 rounded-2xl grid place-items-center border ${
            isNoShow ? "bg-red-50 border-red-200 text-red-600" : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          {isNoShow ? (
            <AlertTriangleIcon className="w-[22px] h-[22px]" />
          ) : (
            <AlertCircleIcon className="w-[22px] h-[22px]" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-extrabold m-0">
            {isNoShow ? "노쇼 처리할까요?" : "예약을 취소할까요?"}
          </h3>
          <p className="text-sm leading-relaxed text-body mt-2 m-0">
            {target.maskedName} · {when} 예약을{" "}
            {isNoShow ? "노쇼로 처리합니다" : "취소합니다"}. 처리 후에는 되돌릴 수 없습니다.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold"
          >
            돌아가기
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-12 rounded-2xl text-white text-sm font-bold ${
              isNoShow ? "bg-red-600 hover:bg-red-500" : "bg-amber-700 hover:bg-amber-600"
            }`}
          >
            {isNoShow ? "노쇼 처리" : "예약 취소"}
          </button>
        </div>
      </div>
    </div>
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
