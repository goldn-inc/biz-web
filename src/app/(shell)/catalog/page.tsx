"use client";

import { useState } from "react";
import { Badge, Button, FilterChip, Input } from "@/components/ui";
import {
  AlertCircleIcon,
  CatalogIcon,
  ClockIcon,
  HelpCircleIcon,
  ImageIcon,
  PlusIcon,
} from "@/components/icons";

type ApplicationStatus = "pending" | "approved" | "rejected";
type ApplicationKind = "상품" | "서비스";

type CatalogApplication = {
  id: string;
  name: string;
  kind: ApplicationKind;
  appliedAt: string;
  description: string;
  status: ApplicationStatus;
  rejectReason?: string;
};

const INITIAL_APPLICATIONS: CatalogApplication[] = [
  {
    id: "CAT-20260710-0007",
    name: "수제 은수저 세트 (돌선물용)",
    kind: "상품",
    appliedAt: "7/10 신청",
    description: "순은 99.9% 각인 서비스 포함, 제작 5일 소요.",
    status: "pending",
  },
  {
    id: "CAT-20260708-0006",
    name: "돌반지 각인 서비스",
    kind: "서비스",
    appliedAt: "7/8 신청",
    description: "구매 반지에 이름·날짜 레이저 각인, 당일 처리.",
    status: "pending",
  },
  {
    id: "CAT-20260701-0005",
    name: "14K 커플링 맞춤 제작",
    kind: "상품",
    appliedAt: "7/1 신청",
    description: "디자인 상담 후 2주 제작, 사이즈 교환 1회 무료.",
    status: "approved",
  },
  {
    id: "CAT-20260628-0004",
    name: "18K 목걸이 리폼 서비스",
    kind: "서비스",
    appliedAt: "6/28 신청",
    description: "끊어진 체인 복원·길이 조정, 도금 마감 포함.",
    status: "approved",
  },
  {
    id: "CAT-20260620-0003",
    name: "순은 수저 답례품 세트",
    kind: "상품",
    appliedAt: "6/20 신청",
    description: "돌·백일 답례용 케이스 포장, 10세트 이상 할인.",
    status: "approved",
  },
  {
    id: "CAT-20260612-0002",
    name: "순금 골드바 소분 판매",
    kind: "상품",
    appliedAt: "6/12 신청",
    description: "10g 단위 소분 판매 희망.",
    status: "rejected",
    rejectReason:
      "시세 연동 중량 거래 품목은 카탈로그 대상이 아닙니다. 가공품으로 범위를 조정해 재신청해주세요.",
  },
];

type FilterKey = "all" | ApplicationStatus;

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: "slate" | "green" | "red"; cardBorder: string; cardBg: string }
> = {
  pending: { label: "대기중", tone: "slate", cardBorder: "border-slate-300", cardBg: "bg-white" },
  approved: { label: "승인", tone: "green", cardBorder: "border-green-200", cardBg: "bg-white" },
  rejected: { label: "반려", tone: "red", cardBorder: "border-red-200", cardBg: "bg-red-50/40" },
};

type FormState = {
  kind: ApplicationKind;
  name: string;
  description: string;
  priceMin: string;
  priceMax: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  kind: "상품",
  name: "",
  description: "",
  priceMin: "",
  priceMax: "",
  note: "",
};

type View = "list" | "form" | "done";

export default function CatalogPage() {
  const [applications, setApplications] = useState<CatalogApplication[]>(INITIAL_APPLICATIONS);
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<number[]>([1]);
  const [submitted, setSubmitted] = useState<CatalogApplication | null>(null);

  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  const visible = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  function openNewForm() {
    setForm(EMPTY_FORM);
    setImages([1]);
    setView("form");
  }

  function openReapplyForm(app: CatalogApplication) {
    setForm({
      kind: app.kind,
      name: app.name,
      description: app.description,
      priceMin: "",
      priceMax: "",
      note: "",
    });
    setImages([1]);
    setView("form");
  }

  function submitForm() {
    // TODO(API 연동): POST /biz/catalog-applications — 승인 대기 상태로 접수
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const seq = String(counts.all + 1).padStart(4, "0");
    const created: CatalogApplication = {
      id: `CAT-${stamp}-${seq}`,
      name: form.name.trim() || "무제 신청",
      kind: form.kind,
      appliedAt: `${now.getMonth() + 1}/${now.getDate()} 신청`,
      description: form.description.trim(),
      status: "pending",
    };
    setApplications((prev) => [created, ...prev]);
    setSubmitted(created);
    setView("done");
  }

  if (view === "form") {
    return <ApplicationForm form={form} setForm={setForm} images={images} setImages={setImages} onSubmit={submitForm} onCancel={() => setView("list")} />;
  }

  if (view === "done" && submitted) {
    return (
      <SubmissionDone
        application={submitted}
        onBackToList={() => setView("list")}
        onApplyAnother={openNewForm}
      />
    );
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">카탈로그 신청</h1>
          <div className="text-sm text-caption mt-1.5">
            매장 취급 상품·서비스를 신청하면 관리자 승인 후 노출됩니다
          </div>
        </div>
        <Button onClick={openNewForm} className="inline-flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          신규 신청
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          전체 {counts.all}
        </FilterChip>
        <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")}>
          대기중 {counts.pending}
        </FilterChip>
        <FilterChip active={filter === "approved"} onClick={() => setFilter("approved")}>
          승인 {counts.approved}
        </FilterChip>
        <FilterChip active={filter === "rejected"} onClick={() => setFilter("rejected")}>
          반려 {counts.rejected}
        </FilterChip>
      </div>

      {visible.length === 0 ? (
        <EmptyState onNew={openNewForm} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 items-start">
          {visible.map((app) => (
            <ApplicationCard key={app.id} app={app} onReapply={() => openReapplyForm(app)} />
          ))}
        </div>
      )}
    </>
  );
}

/** 신청 카드 — 상태별 테두리/배경 색 + 반려 시 사유·재신청 버튼 노출. */
function ApplicationCard({
  app,
  onReapply,
}: {
  app: CatalogApplication;
  onReapply: () => void;
}) {
  const meta = STATUS_META[app.status];
  return (
    <div className={`${meta.cardBg} border-2 ${meta.cardBorder} rounded-3xl p-[18px] flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white border border-line grid place-items-center text-caption shrink-0">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate">{app.name}</div>
            <div className="text-xs text-caption">
              {app.kind} · {app.appliedAt}
            </div>
          </div>
        </div>
        <Badge tone={meta.tone} className="shrink-0">
          {meta.label}
        </Badge>
      </div>
      <div className="text-sm text-body leading-relaxed">{app.description}</div>
      {app.status === "rejected" && app.rejectReason && (
        <>
          <div className="bg-white border border-red-200 rounded-xl px-3.5 py-3 flex gap-2 items-start">
            <AlertCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
            <div className="text-xs leading-relaxed text-red-700">
              <span className="font-extrabold">반려 사유</span> · {app.rejectReason}
            </div>
          </div>
          <button
            onClick={onReapply}
            className="self-start h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold transition"
          >
            수정 후 재신청
          </button>
        </>
      )}
    </div>
  );
}

/** 신규/재신청 폼 — 제출 시 승인 대기 상태로 접수된다(매장주 자체 승인 불가). */
function ApplicationForm({
  form,
  setForm,
  images,
  setImages,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  images: number[];
  setImages: React.Dispatch<React.SetStateAction<number[]>>;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const canSubmit = form.name.trim().length > 0 && form.description.trim().length > 0;

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">신규 신청</h1>
        <button
          onClick={onCancel}
          className="h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold transition"
        >
          목록으로
        </button>
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <section className="flex-[1.7] min-w-80 bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              유형 <span className="text-primary">*</span>
            </label>
            <div className="flex gap-2">
              {(["상품", "서비스"] as const).map((kind) => {
                const active = form.kind === kind;
                return (
                  <button
                    key={kind}
                    onClick={() => setForm((f) => ({ ...f, kind }))}
                    className={`flex-1 h-11 rounded-xl text-sm transition ${
                      active
                        ? "border-2 border-primary bg-orange-50 text-primary font-bold"
                        : "border border-line bg-white hover:border-primary-light text-body font-semibold"
                    }`}
                  >
                    {kind}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              상품/서비스명 <span className="text-primary">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 수제 은수저 세트 (돌선물용)"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              설명 <span className="text-primary">*</span>
            </label>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="소재·제작 기간·포함 서비스 등 소비자에게 노출될 설명"
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              이미지 <span className="text-caption font-medium">(최대 5장)</span>
            </label>
            <div className="flex gap-2.5 flex-wrap">
              {/* TODO(API 연동): 실제 파일 업로더(R2 presign)로 교체 — 지금은 placeholder */}
              {images.map((id) => (
                <div
                  key={id}
                  className="relative w-24 h-24 rounded-2xl bg-slate-100 border border-line grid place-items-center text-slate-400"
                >
                  <ImageIcon className="w-7 h-7" />
                  <button
                    aria-label="이미지 삭제"
                    onClick={() => setImages((prev) => prev.filter((x) => x !== id))}
                    className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-ink text-white grid place-items-center text-[11px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button
                  onClick={() => setImages((prev) => [...prev, (prev.at(-1) ?? 0) + 1])}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-surface hover:border-primary-light hover:text-primary text-caption text-xs font-semibold flex flex-col items-center justify-center gap-1 transition"
                >
                  <PlusIcon className="w-5 h-5" />
                  추가
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              희망 가격대 <span className="text-caption font-medium">(선택)</span>
            </label>
            <div className="flex items-center gap-2.5">
              <Input
                value={form.priceMin}
                onChange={(e) => setForm((f) => ({ ...f, priceMin: e.target.value }))}
                inputMode="numeric"
                placeholder="180,000"
                className="flex-1 min-w-0 text-right tabular-nums"
              />
              <span className="text-sm text-caption shrink-0">원 ~</span>
              <Input
                value={form.priceMax}
                onChange={(e) => setForm((f) => ({ ...f, priceMax: e.target.value }))}
                inputMode="numeric"
                placeholder="220,000"
                className="flex-1 min-w-0 text-right tabular-nums"
              />
              <span className="text-sm text-caption shrink-0">원</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-body">
              비고 <span className="text-caption font-medium">(선택)</span>
            </label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="관리자에게 전달할 참고사항"
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
          </div>

          <Button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-14 rounded-2xl text-base shadow-primary/25"
          >
            신청 제출
          </Button>
        </section>

        <div className="flex-1 min-w-72 flex flex-col gap-4">
          <section className="bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3">
            <h3 className="text-sm font-extrabold m-0">승인 절차</h3>
            <div className="text-sm text-body leading-relaxed">
              제출 → 관리자 검토(영업일 1~3일) → 승인 시 소비자 앱 매장 페이지에 노출됩니다. 반려 시
              사유와 함께 수정 후 재신청할 수 있습니다.
            </div>
          </section>
          <section className="bg-surface border border-line rounded-3xl p-5 flex gap-2.5 items-start">
            <HelpCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-caption" />
            <p className="text-xs leading-relaxed text-caption m-0">
              시세 연동 품목(순금·순은 중량 거래)은 카탈로그 신청 대상이 아닙니다. 가공품·서비스만
              신청해주세요.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

/** 접수 완료 화면 — 신청번호·항목·상태(대기중) 요약. */
function SubmissionDone({
  application,
  onBackToList,
  onApplyAnother,
}: {
  application: CatalogApplication;
  onBackToList: () => void;
  onApplyAnother: () => void;
}) {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-10 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-orange-50 border-2 border-orange-100 grid place-items-center text-primary">
          <ClockIcon className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">신청이 접수되었습니다</h2>
          <p className="text-sm leading-relaxed text-body mt-2 m-0">
            관리자 승인을 기다리고 있습니다.
            <br />
            검토는 영업일 기준 1~3일 소요됩니다.
          </p>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">신청번호</span>
            <span className="text-sm font-extrabold text-primary tabular-nums">{application.id}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">항목</span>
            <span className="text-sm font-bold">{application.name}</span>
          </div>
          <div className="flex justify-between gap-3 items-center">
            <span className="text-xs text-caption">상태</span>
            <Badge tone="slate">대기중</Badge>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <Button onClick={onBackToList} className="h-[52px] shadow-primary/25">
            신청 목록으로
          </Button>
          <Button variant="secondary" onClick={onApplyAnother} className="hover:bg-slate-100">
            다른 항목 신청
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 빈 상태 — 필터 결과가 없거나 신청 이력이 없을 때. */
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="w-full max-w-sm bg-white border border-line rounded-3xl shadow-sm p-7 flex flex-col items-center gap-2.5 text-center">
        <div className="w-11 h-11 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
          <CatalogIcon className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold">아직 신청한 항목이 없습니다</div>
        <p className="text-xs text-caption m-0">첫 상품·서비스를 신청해보세요.</p>
        <Button onClick={onNew} className="inline-flex items-center gap-2 mt-1">
          <PlusIcon className="w-4 h-4" />
          신규 신청
        </Button>
      </div>
    </div>
  );
}
