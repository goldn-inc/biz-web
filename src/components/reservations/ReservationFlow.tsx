"use client";

/**
 * 예약 상세·상태변경 공용 컴포넌트 — 예약 페이지와 대시보드(오늘 예약 바로 처리)가 함께 쓴다.
 * reservations/page.tsx 에서 추출(2026-07-23) — 마크업·동작은 원본 그대로.
 */

import Link from "next/link";
import { Badge, Button, Dialog, SidePanel } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { AlertCircleIcon, AlertTriangleIcon, PhoneIcon, XIcon } from "@/components/icons";

export type ReservationStatus =
  | "PENDING"
  | "WAITLISTED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

/** GET /biz/reservations 응답 항목 — 이름은 서버에서 마스킹, 전화는 원본(연락 용도). */
export type ApiReservation = {
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

export type Reservation = {
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

export const RESERVATION_STATUS_META: Record<
  ReservationStatus,
  { label: string; tone: BadgeTone }
> = {
  PENDING: { label: "대기중", tone: "slate" },
  WAITLISTED: { label: "대기목록", tone: "violet" },
  CONFIRMED: { label: "확정", tone: "primary" },
  COMPLETED: { label: "방문완료", tone: "green" },
  CANCELLED: { label: "취소", tone: "slate" },
  NO_SHOW: { label: "노쇼", tone: "red" },
};

/** delivery_schedules.visit_purpose 어휘 → 라벨 (mobile visit-history 와 동일 매핑) */
const PURPOSE_LABEL: Record<string, string> = {
  buy_gold: "최고가 매입",
  sell: "팔래요",
  purchase: "살래요",
  other: "매장 방문",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** KST(UTC+9) 오늘 — 서버 kstTodayString 과 동일 규약 */
export function kstToday(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateLabelOf(visitDate: string | null): string {
  if (!visitDate) return "-";
  const today = toDateString(kstToday());
  const d = new Date(`${visitDate}T00:00:00Z`);
  const short = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  if (visitDate === today) return `오늘 ${short}`;
  return `${WEEKDAYS[d.getUTCDay()]} ${short}`;
}

export function toReservation(api: ApiReservation): Reservation {
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

export type DestructiveAction = "CANCELLED" | "NO_SHOW";

export const TERMINAL_STATUSES: ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export function ReservationDetailPanel({
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
  const meta = RESERVATION_STATUS_META[reservation.status];
  const isTerminal = TERMINAL_STATUSES.includes(reservation.status);
  const needsResponse = reservation.status === "PENDING" || reservation.status === "WAITLISTED";

  return (
    <SidePanel
      onClose={onClose}
      label="예약 상세"
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
    </SidePanel>
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

export function ReservationConfirmDialog({
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
    <Dialog
      role="alertdialog"
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
    </Dialog>
  );
}
