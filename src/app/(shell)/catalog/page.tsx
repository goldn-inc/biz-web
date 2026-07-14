"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, FilterChip, Input } from "@/components/ui";
import {
  AlertCircleIcon,
  CatalogIcon,
  ClockIcon,
  HelpCircleIcon,
  ImageIcon,
  PlusIcon,
} from "@/components/icons";
import { useBizSession } from "@/components/shell/BizSessionProvider";
import { bizApiFetch, bizApiUpload, BizApiError } from "@/lib/api";

type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";
type ApplicationKind = "PRODUCT" | "SERVICE";

/** GET /biz/catalog 항목 — 서버가 imageUrls(공개 URL)까지 내려준다. */
type ApiCatalogItem = {
  id: string;
  kind: ApplicationKind;
  name: string;
  description: string;
  priceMinKrw: number | null;
  priceMaxKrw: number | null;
  note: string | null;
  imageKeys: string[];
  imageUrls: string[];
  status: ApplicationStatus;
  rejectReason: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<ApplicationKind, string> = { PRODUCT: "상품", SERVICE: "서비스" };

type FilterKey = "all" | ApplicationStatus;

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: "slate" | "green" | "red"; cardBorder: string; cardBg: string }
> = {
  PENDING: { label: "대기중", tone: "slate", cardBorder: "border-slate-300", cardBg: "bg-white" },
  APPROVED: { label: "승인", tone: "green", cardBorder: "border-green-200", cardBg: "bg-white" },
  REJECTED: { label: "반려", tone: "red", cardBorder: "border-red-200", cardBg: "bg-red-50/40" },
};

type UploadedImage = { key: string; url: string };

type FormState = {
  kind: ApplicationKind;
  name: string;
  description: string;
  priceMin: string;
  priceMax: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  kind: "PRODUCT",
  name: "",
  description: "",
  priceMin: "",
  priceMax: "",
  note: "",
};

type View = "list" | "form" | "done";

/** "180,000" → 180000. 빈/비정상 입력은 undefined(미지정). */
function parseKrw(raw: string): number | undefined {
  const n = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function appliedLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} 신청`;
}

export default function CatalogPage() {
  const { token } = useBizSession();
  const [items, setItems] = useState<ApiCatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [submitted, setSubmitted] = useState<ApiCatalogItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // react-hooks/set-state-in-effect 룰 때문에 콜백 대신 effect 내 IIFE + reloadKey 재조회 패턴.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        const res = await bizApiFetch<{ items: ApiCatalogItem[] }>("/biz/catalog", { token });
        if (!alive) return;
        setItems(res.items);
        setLoadError(null);
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof BizApiError ? e.message : "신청 목록을 불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, reloadKey]);

  const list = items ?? [];
  const counts = {
    all: list.length,
    PENDING: list.filter((a) => a.status === "PENDING").length,
    APPROVED: list.filter((a) => a.status === "APPROVED").length,
    REJECTED: list.filter((a) => a.status === "REJECTED").length,
  };

  const visible = filter === "all" ? list : list.filter((a) => a.status === filter);

  function openNewForm() {
    setForm(EMPTY_FORM);
    setImages([]);
    setFormError(null);
    setView("form");
  }

  function openReapplyForm(app: ApiCatalogItem) {
    setForm({
      kind: app.kind,
      name: app.name,
      description: app.description,
      priceMin: app.priceMinKrw !== null ? String(app.priceMinKrw) : "",
      priceMax: app.priceMaxKrw !== null ? String(app.priceMaxKrw) : "",
      note: "",
    });
    // 반려 건의 기존 이미지 키는 자기 매장 소유라 재사용 가능.
    setImages(app.imageKeys.map((key, i) => ({ key, url: app.imageUrls[i] ?? "" })));
    setFormError(null);
    setView("form");
  }

  async function submitForm() {
    if (!token || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await bizApiFetch<ApiCatalogItem>("/biz/catalog", {
        method: "POST",
        token,
        body: {
          kind: form.kind,
          name: form.name.trim(),
          description: form.description.trim(),
          priceMinKrw: parseKrw(form.priceMin),
          priceMaxKrw: parseKrw(form.priceMax),
          note: form.note.trim() || undefined,
          imageKeys: images.map((img) => img.key),
        },
      });
      setSubmitted(created);
      setView("done");
      reload();
    } catch (e) {
      setFormError(e instanceof BizApiError ? e.message : "신청 접수에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "form") {
    return (
      <ApplicationForm
        form={form}
        setForm={setForm}
        images={images}
        setImages={setImages}
        token={token}
        submitting={submitting}
        error={formError}
        onSubmit={() => void submitForm()}
        onCancel={() => setView("list")}
      />
    );
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
        <FilterChip active={filter === "PENDING"} onClick={() => setFilter("PENDING")}>
          대기중 {counts.PENDING}
        </FilterChip>
        <FilterChip active={filter === "APPROVED"} onClick={() => setFilter("APPROVED")}>
          승인 {counts.APPROVED}
        </FilterChip>
        <FilterChip active={filter === "REJECTED"} onClick={() => setFilter("REJECTED")}>
          반려 {counts.REJECTED}
        </FilterChip>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex gap-2 items-center text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          {loadError}
          <button onClick={reload} className="ml-auto text-xs font-bold underline">
            다시 시도
          </button>
        </div>
      ) : items === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-3xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
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
  app: ApiCatalogItem;
  onReapply: () => void;
}) {
  const meta = STATUS_META[app.status];
  const thumb = app.imageUrls[0];
  return (
    <div className={`${app.status === "REJECTED" ? "bg-red-50/40" : "bg-white"} border-2 ${meta.cardBorder} rounded-3xl p-[18px] flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white border border-line grid place-items-center text-caption shrink-0 overflow-hidden">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- R2 공개 URL, next/image 도메인 설정 없이 직결
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate">{app.name}</div>
            <div className="text-xs text-caption">
              {KIND_LABEL[app.kind]} · {appliedLabel(app.createdAt)}
            </div>
          </div>
        </div>
        <Badge tone={meta.tone} className="shrink-0">
          {meta.label}
        </Badge>
      </div>
      <div className="text-sm text-body leading-relaxed">{app.description}</div>
      {app.status === "REJECTED" && app.rejectReason && (
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
  token,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  images: UploadedImage[];
  setImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
  token: string | null;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canSubmit =
    form.name.trim().length > 0 && form.description.trim().length > 0 && !submitting && !uploading;

  async function handleFile(file: File) {
    if (!token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await bizApiUpload<UploadedImage>("/biz/catalog/images", fd, token);
      setImages((prev) => [...prev, res]);
    } catch (e) {
      setUploadError(e instanceof BizApiError ? e.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

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
              {(["PRODUCT", "SERVICE"] as const).map((kind) => {
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
                    {KIND_LABEL[kind]}
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
              이미지 <span className="text-caption font-medium">(최대 5장, 10MB 이하)</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2.5 flex-wrap">
              {images.map((img) => (
                <div
                  key={img.key}
                  className="relative w-24 h-24 rounded-2xl bg-slate-100 border border-line grid place-items-center text-slate-400 overflow-hidden"
                >
                  {img.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2 공개 URL 직결
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-7 h-7" />
                  )}
                  <button
                    aria-label="이미지 삭제"
                    onClick={() => setImages((prev) => prev.filter((x) => x.key !== img.key))}
                    className="absolute top-1 right-1 w-[22px] h-[22px] rounded-full bg-ink text-white grid place-items-center text-[11px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-surface hover:border-primary-light hover:text-primary text-caption text-xs font-semibold flex flex-col items-center justify-center gap-1 transition disabled:opacity-50"
                >
                  <PlusIcon className="w-5 h-5" />
                  {uploading ? "업로드 중…" : "추가"}
                </button>
              )}
            </div>
            {uploadError ? (
              <div className="text-xs text-red-600 font-semibold">{uploadError}</div>
            ) : null}
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

          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 flex gap-2 items-center text-sm text-red-700">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <Button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-14 rounded-2xl text-base shadow-primary/25"
          >
            {submitting ? "제출 중…" : "신청 제출"}
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
  application: ApiCatalogItem;
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
            <span className="text-sm font-extrabold text-primary tabular-nums">
              {application.id.slice(0, 8).toUpperCase()}
            </span>
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
