"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon, AlertCircleIcon, ScaleIcon } from "@/components/icons";
import { AnimatePresence } from "motion/react";
import { Badge, ListRow, FilterChip } from "@/components/ui";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  DetailPanel,
  RegistrationForm,
  STATUS_META,
  krw,
  kstToday,
  timeLabelOf,
  toDateString,
  type ApiTransaction,
  type TxStatus,
} from "@/components/transactions/PurchaseFlow";

type DateRange = "today" | "week" | "all";

const DATE_FILTERS: { key: DateRange; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "week", label: "최근 7일" },
  { key: "all", label: "전체" },
];

const STATUS_FILTERS: (TxStatus | "ALL")[] = ["ALL", "IN_PROGRESS", "COMPLETED", "CANCELED"];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function rangeOf(range: DateRange): { from: string; to: string } {
  const today = toDateString(kstToday());
  if (range === "today") return { from: today, to: today };
  if (range === "week")
    return { from: toDateString(new Date(kstToday().getTime() - 6 * 86400_000)), to: today };
  // 전체 = biz-web 오픈 이전까지 커버하는 고정 하한
  return { from: "2026-01-01", to: today };
}

/** 거래 목록 + 현장 매입 등록 + 상세(감정·완료/취소) — 사업자용 거래 처리 화면 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageInner />
    </Suspense>
  );
}

function TransactionsPageInner() {
  const { token } = useBizSession();
  const searchParams = useSearchParams();
  // 예약 상세 "거래 시작" 딥링크: /transactions?reservationId=...&phone=...
  const linkedReservationId = searchParams.get("reservationId");
  const linkedPhone = searchParams.get("phone");

  const [view, setView] = useState<"list" | "form">(linkedReservationId ? "form" : "list");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [statusFilter, setStatusFilter] = useState<TxStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 로딩은 "요청 키 ↔ 결과 키 불일치"로 파생(set-state-in-effect 회피, 예약 화면과 동일 패턴)
  const [result, setResult] = useState<{
    key: string;
    transactions?: ApiTransaction[];
    error?: string;
  } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `${dateRange}:${reloadCount}`;
  const loading = result?.key !== requestKey;
  const transactions = (!loading && result?.transactions) || [];
  const loadError = !loading ? (result?.error ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    const range = rangeOf(dateRange);
    void (async () => {
      try {
        const res = await bizApiFetch<{ transactions: ApiTransaction[] }>(
          `/biz/transactions?from=${range.from}&to=${range.to}`,
          { token },
        );
        if (!cancelled) setResult({ key: requestKey, transactions: res.transactions });
      } catch (error) {
        if (!cancelled) {
          setResult({
            key: requestKey,
            error:
              error instanceof BizApiError ? error.message : "거래 목록을 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateRange, requestKey, token]);

  const visible = transactions.filter((t) =>
    statusFilter === "ALL" ? true : t.status === statusFilter,
  );
  const counts = {
    ALL: transactions.length,
    IN_PROGRESS: transactions.filter((t) => t.status === "IN_PROGRESS").length,
    COMPLETED: transactions.filter((t) => t.status === "COMPLETED").length,
    CANCELED: transactions.filter((t) => t.status === "CANCELED").length,
  };

  const todayLabel = (() => {
    const t = kstToday();
    return `${t.getUTCFullYear()}년 ${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 (${WEEKDAYS[t.getUTCDay()]})`;
  })();

  function refreshList() {
    setReloadCount((n) => n + 1);
  }

  if (view === "form") {
    return (
      <RegistrationForm
        token={token}
        reservationId={linkedReservationId}
        initialPhone={linkedPhone}
        onCancel={() => setView("list")}
        onCreated={(id) => {
          refreshList();
          setView("list");
          setSelectedId(id);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">거래</h1>
          <div className="text-sm text-caption mt-1.5">
            {/* 0 은 조회가 성공해 실제로 0건일 때만 — 로딩·실패 중에는 숫자를 단정하지 않는다. */}
            {todayLabel} · KST · {DATE_FILTERS.find((f) => f.key === dateRange)?.label}{" "}
            {loading || loadError ? "—" : `${transactions.length}건`}
          </div>
        </div>
        <button
          onClick={() => setView("form")}
          className="h-12 px-5 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 inline-flex items-center gap-2 transition"
        >
          <PlusIcon className="w-4 h-4" />
          현장 매입 등록
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex bg-white border border-line rounded-xl p-0.5 gap-0.5">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateRange(f.key)}
              className={`h-8 px-3.5 rounded-lg text-xs transition ${
                dateRange === f.key
                  ? "bg-primary text-white font-bold"
                  : "text-caption font-semibold hover:text-body"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {STATUS_FILTERS.map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s === "ALL" ? "전체" : STATUS_META[s].label} {loading || loadError ? "—" : counts[s]}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={refreshList} />
      ) : visible.length === 0 ? (
        <EmptyState onRegister={() => setView("form")} />
      ) : (
        <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
          {visible.map((t, i) => (
            <ListRow key={t.id} index={i} className="first:border-t-0">
              <div className="w-20 shrink-0">
                <div className="text-sm font-extrabold">{timeLabelOf(t.createdAt)}</div>
                <div className="text-xs text-caption uppercase">{t.id.slice(0, 8)}</div>
              </div>
              <div className="flex-1 min-w-32">
                <div className="text-sm font-bold">{t.customerName}</div>
                <div className="text-xs text-caption tabular-nums">{t.customerPhone ?? "-"}</div>
              </div>
              <div className="flex-[2] min-w-36 text-sm text-body">
                {t.status === "COMPLETED" && t.finalPrice != null
                  ? `${t.memo ? `${t.memo} · ` : ""}${krw(t.finalPrice)} 정산`
                  : (t.memo ?? "-")}
              </div>
              <Badge tone={STATUS_META[t.status].tone} className="shrink-0">
                {STATUS_META[t.status].label}
              </Badge>
              <button
                onClick={() => setSelectedId(t.id)}
                className="shrink-0 h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold transition"
              >
                상세보기
              </button>
            </ListRow>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedId && (
          <DetailPanel
            key="tx-detail"
            token={token}
            id={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={refreshList}
          />
        )}
      </AnimatePresence>
    </>
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
      <div className="text-sm font-bold">거래 목록을 불러오지 못했습니다</div>
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

function EmptyState({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="w-full bg-white border border-line rounded-3xl shadow-sm p-12 min-h-[55vh] flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
        <ScaleIcon className="w-8 h-8" />
      </div>
      <div className="text-lg font-extrabold">조건에 맞는 거래가 없습니다</div>
      <p className="text-sm text-caption leading-relaxed m-0">
        현장 방문 고객의 매입·감정을 등록해보세요.
      </p>
      <button
        onClick={onRegister}
        className="mt-2 h-12 px-6 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 inline-flex items-center gap-2 transition"
      >
        <PlusIcon className="w-4 h-4" />
        현장 매입 등록
      </button>
    </div>
  );
}
