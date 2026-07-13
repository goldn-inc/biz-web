"use client";

import { useEffect, useState } from "react";
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

type ReservationStatus =
  | "PENDING"
  | "WAITLISTED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

type Reservation = {
  id: string;
  code: string;
  time: string;
  dateLabel: string;
  dateKey: "today" | "week";
  datetimeFull: string;
  /** 고객 개인정보는 항상 마스킹된 형태로만 저장/표시 — 원본 이름·전화 미노출 */
  maskedName: string;
  initial: string;
  maskedPhone: string;
  purpose: string;
  people: number;
  memo: string;
  sourceLabel: string;
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

// TODO(API 연동): GET /biz/reservations?range=&status= 로 교체 — 응답은 이미 마스킹된 필드만 내려받는다
const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: "RSV-20260710-0140",
    code: "RSV-20260710-0140",
    time: "14:30",
    dateLabel: "오늘 7/10",
    dateKey: "today",
    datetimeFull: "2026-07-10 (금) 14:30 KST",
    maskedName: "박○호",
    initial: "박",
    maskedPhone: "010-****-2214",
    purpose: "금 시세 매입 문의",
    people: 1,
    memo: "오늘 금 시세로 목걸이 매입 가능한지 상담 원합니다.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 10일 생성",
    status: "PENDING",
  },
  {
    id: "RSV-20260710-0170",
    code: "RSV-20260710-0170",
    time: "17:00",
    dateLabel: "오늘 7/10",
    dateKey: "today",
    datetimeFull: "2026-07-10 (금) 17:00 KST",
    maskedName: "최○라",
    initial: "최",
    maskedPhone: "010-****-8830",
    purpose: "예물 3종 세트 상담",
    people: 2,
    memo: "결혼 예물 반지·목걸이·귀걸이 세트 견적 상담 희망합니다.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 9일 생성",
    status: "WAITLISTED",
  },
  {
    id: "RSV-20260710-0113",
    code: "RSV-20260710-0113",
    time: "11:00",
    dateLabel: "오늘 7/10",
    dateKey: "today",
    datetimeFull: "2026-07-10 (금) 11:00 KST",
    maskedName: "김○지",
    initial: "김",
    maskedPhone: "010-****-5678",
    purpose: "예물 반지 상담",
    people: 2,
    memo: "봄 예물 반지 사이즈 상담 희망합니다. 커플링 견적도 함께 부탁드려요.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 3일 생성",
    status: "CONFIRMED",
  },
  {
    id: "RSV-20260709-0155",
    code: "RSV-20260709-0155",
    time: "15:30",
    dateLabel: "어제 7/9",
    dateKey: "week",
    datetimeFull: "2026-07-09 (목) 15:30 KST",
    maskedName: "정○민",
    initial: "정",
    maskedPhone: "010-****-7702",
    purpose: "귀금속 감정 의뢰 (2점)",
    people: 1,
    memo: "물려받은 반지 2점 순도 감정 의뢰합니다.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 8일 생성",
    status: "COMPLETED",
  },
  {
    id: "RSV-20260708-0130",
    code: "RSV-20260708-0130",
    time: "13:00",
    dateLabel: "수 7/8",
    dateKey: "week",
    datetimeFull: "2026-07-08 (수) 13:00 KST",
    maskedName: "한○울",
    initial: "한",
    maskedPhone: "010-****-1145",
    purpose: "체인 목걸이 매입 상담",
    people: 1,
    memo: "14K 체인 목걸이 매입 문의드립니다.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 7일 생성",
    status: "CANCELLED",
  },
  {
    id: "RSV-20260708-0103",
    code: "RSV-20260708-0103",
    time: "10:30",
    dateLabel: "수 7/8",
    dateKey: "week",
    datetimeFull: "2026-07-08 (수) 10:30 KST",
    maskedName: "오○석",
    initial: "오",
    maskedPhone: "010-****-6529",
    purpose: "순금 골드바 구매",
    people: 1,
    memo: "순금 골드바 10g 구매 예약합니다.",
    sourceLabel: "소비자 앱 접수",
    createdLabel: "7월 7일 생성",
    status: "NO_SHOW",
  },
];

type DateFilter = "today" | "week" | "custom";
type StatusFilter = "ALL" | ReservationStatus;
type DestructiveAction = "CANCELLED" | "NO_SHOW";

const TERMINAL_STATUSES: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

/** 예약 목록 + 상세 슬라이드오버 + 취소/노쇼 확인 다이얼로그를 포함한 사업자용 예약 관리 화면 */
export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>(MOCK_RESERVATIONS);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ action: DestructiveAction; target: Reservation } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO(API 연동): 실제 fetch 로딩으로 교체 — 지금은 스켈레톤 노출용 지연
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const visible = reservations.filter((r) => {
    // 직접선택(custom)은 실제 달력 연동 전까지 이번주와 동일 범위로 취급
    const dateOk = dateFilter === "today" ? r.dateKey === "today" : true;
    const statusOk = statusFilter === "ALL" ? true : r.status === statusFilter;
    return dateOk && statusOk;
  });

  const priority = visible.filter((r) => r.status === "PENDING" || r.status === "WAITLISTED");
  const rest = visible.filter((r) => r.status !== "PENDING" && r.status !== "WAITLISTED");

  const selected = reservations.find((r) => r.id === selectedId) ?? null;

  function resetFilters() {
    setStatusFilter("ALL");
    setDateFilter("week");
  }

  function applyStatus(id: string, status: ReservationStatus) {
    // TODO(API 연동): PATCH /biz/reservations/{id}/status { status } + 고객 알림 발송
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  function handleComplete(r: Reservation) {
    applyStatus(r.id, "COMPLETED");
    setSelectedId(null);
  }

  function confirmDialog() {
    if (!dialog) return;
    applyStatus(dialog.target.id, dialog.action);
    setDialog(null);
    setSelectedId(null);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">예약</h1>
          <div className="text-sm text-caption mt-1.5">
            2026년 7월 10일 (금) · KST · 이번주 {reservations.length}건
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
            {/* TODO(API 연동): 직접선택 시 날짜 범위 피커 연동 */}
            <DateToggle active={dateFilter === "custom"} onClick={() => setDateFilter("custom")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              직접선택
            </DateToggle>
          </div>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
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
          onComplete={() => handleComplete(selected)}
          onNoShow={() => setDialog({ action: "NO_SHOW", target: selected })}
          onCancel={() => setDialog({ action: "CANCELLED", target: selected })}
        />
      )}

      {dialog && (
        <ConfirmDialog
          action={dialog.action}
          target={dialog.target}
          onClose={() => setDialog(null)}
          onConfirm={confirmDialog}
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
        <div className="text-xs text-caption tabular-nums">{reservation.maskedPhone}</div>
      </div>
      <div className="flex-[2] min-w-36 text-sm text-body">{reservation.purpose}</div>
      <Badge tone={meta.tone} className="shrink-0">
        {meta.label} {reservation.status}
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
  onComplete,
  onNoShow,
  onCancel,
}: {
  reservation: Reservation;
  onClose: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}) {
  const meta = STATUS_META[reservation.status];
  const isTerminal = TERMINAL_STATUSES.includes(reservation.status);

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
              {meta.label} {reservation.status}
            </Badge>
            <div className="text-xs text-caption">
              {reservation.sourceLabel} · {reservation.createdLabel}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-3">
            <DetailRow label="예약일시" value={reservation.datetimeFull} />
            <DetailRow label="방문목적" value={reservation.purpose} />
            <DetailRow label="인원" value={`${reservation.people}명`} />
            <div className="border-t border-line pt-3 flex flex-col gap-1.5">
              <span className="text-xs text-caption">요청 메모</span>
              <span className="text-sm leading-relaxed text-body">{reservation.memo}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-sm font-extrabold text-body m-0">고객 정보</h3>
            <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl px-[18px] py-4">
              <div className="w-11 h-11 rounded-full bg-orange-50 border border-orange-100 grid place-items-center text-base font-extrabold text-primary shrink-0">
                {reservation.initial}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">{reservation.maskedName}</div>
                <div className="text-xs text-caption tabular-nums">{reservation.maskedPhone}</div>
              </div>
              <button
                // TODO(API 연동): 마스킹 해제 없이 서버 릴레이 통화 요청
                className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                전화
              </button>
            </div>
            <div className="text-xs text-caption leading-relaxed">
              고객 개인정보 보호를 위해 이름·전화번호는 마스킹된 형태로만 제공됩니다.
            </div>
          </div>

          {isTerminal ? (
            <div className="bg-surface border border-line rounded-2xl px-[18px] py-4 text-xs text-caption leading-relaxed">
              이미 {meta.label} 처리된 예약입니다. 추가 상태 변경은 할 수 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-sm font-extrabold text-body m-0">상태 변경</h3>
              <Button className="h-[52px] rounded-2xl" onClick={onComplete}>
                방문완료 처리 (COMPLETED)
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
                취소·노쇼 처리는 확인 후 되돌릴 수 없으며 고객에게 알림이 발송됩니다.
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
            {isNoShow ? "노쇼(NO_SHOW) 처리할까요?" : "예약을 취소(CANCELLED)할까요?"}
          </h3>
          <p className="text-sm leading-relaxed text-body mt-2 m-0">
            {target.maskedName} · {when} 예약을{" "}
            {isNoShow ? "노쇼로 처리합니다" : "취소합니다"}. 처리 후에는 되돌릴 수 없으며, 고객에게
            {isNoShow ? " 알림이" : " 취소 알림이"} 발송됩니다.
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
