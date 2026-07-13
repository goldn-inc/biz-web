"use client";

import { useMemo, useState } from "react";
import {
  PlusIcon,
  ShieldIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CheckIcon,
  ScaleIcon,
} from "@/components/icons";
import { Badge, Card, Input, ListRow, FilterChip } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";

type Stage = "접수" | "감정중" | "완료";
type DateRange = "today" | "week" | "all";
type LookupResult = "new" | "member" | "returning";
type IdType = "주민등록증" | "운전면허증" | "여권";

type Transaction = {
  id: string;
  time: string;
  range: DateRange;
  name: string;
  phone: string;
  memo: string;
  stage: Stage;
};

type LookupEntry = {
  result: LookupResult;
  name: string;
  birth?: string;
  detail: string;
};

const STAGE_TONE: Record<Stage, BadgeTone> = {
  접수: "slate",
  감정중: "amber",
  완료: "green",
};

const ID_TYPES: IdType[] = ["주민등록증", "운전면허증", "여권"];

// TODO(API 연동): GET /biz/transactions — 매장 현장 매입 접수 목록으로 교체
const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "TRX-0027", time: "15:42", range: "today", name: "김○지", phone: "010-****-5678", memo: "14K 추정 목걸이 1점", stage: "접수" },
  { id: "TRX-0026", time: "14:10", range: "today", name: "박○호", phone: "010-****-2214", memo: "18K 팔찌 · XRF 측정 중", stage: "감정중" },
  { id: "TRX-0025", time: "13:05", range: "today", name: "이○연", phone: "010-****-9031", memo: "순금 골드바 · XRF 측정 중", stage: "감정중" },
  { id: "TRX-0024", time: "11:32", range: "today", name: "정○민", phone: "010-****-7702", memo: "은 수저 세트 · 983,000원 정산", stage: "완료" },
  { id: "TRX-0022", time: "10:08", range: "today", name: "최○아", phone: "010-****-4417", memo: "14K 반지 2점 · 612,000원 정산", stage: "완료" },
  { id: "TRX-0019", time: "7월 8일", range: "week", name: "한○수", phone: "010-****-3390", memo: "18K 귀걸이 1쌍 · 341,000원 정산", stage: "완료" },
];

// TODO(API 연동): GET /biz/customers/lookup?phone= — 회원/재방문 조회로 교체
const MOCK_LOOKUP: Record<string, LookupEntry> = {
  "01012345678": {
    result: "member",
    name: "김○지",
    birth: "1992-03-14",
    detail: "금은마켓 앱 회원 · 2024년 3월 가입 · 실명·생년월일 자동 입력됨",
  },
  "01022222222": {
    result: "returning",
    name: "박○호",
    birth: "1985-11-02",
    detail: "과거 현장거래 3회 · 최근 방문 6월 28일 · 기존 신원정보 자동 입력됨",
  },
};

const DATE_FILTERS: { key: DateRange; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "week", label: "최근 7일" },
  { key: "all", label: "전체" },
];

const STAGE_FILTERS: { key: Stage | "전체"; label: string }[] = [
  { key: "전체", label: "전체" },
  { key: "접수", label: "접수" },
  { key: "감정중", label: "감정중" },
  { key: "완료", label: "완료" },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export default function TransactionsPage() {
  const [view, setView] = useState<"list" | "form">("list");
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [stageFilter, setStageFilter] = useState<Stage | "전체">("전체");

  const visibleTransactions = useMemo(() => {
    return MOCK_TRANSACTIONS.filter((t) => {
      const inRange =
        dateRange === "all" ||
        (dateRange === "week" ? t.range === "today" || t.range === "week" : t.range === "today");
      const inStage = stageFilter === "전체" || t.stage === stageFilter;
      return inRange && inStage;
    });
  }, [dateRange, stageFilter]);

  const stageCounts = useMemo(() => {
    const today = MOCK_TRANSACTIONS.filter((t) => t.range === "today");
    return {
      전체: today.length,
      접수: today.filter((t) => t.stage === "접수").length,
      감정중: today.filter((t) => t.stage === "감정중").length,
      완료: today.filter((t) => t.stage === "완료").length,
    };
  }, []);

  if (view === "form") {
    return <RegistrationForm onCancel={() => setView("list")} />;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">거래</h1>
          <div className="text-sm text-caption mt-1.5">
            2026년 7월 10일 (금) · KST · 오늘 접수 {stageCounts.전체}건
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
                dateRange === f.key ? "bg-primary text-white font-bold" : "text-caption font-semibold hover:text-body"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {STAGE_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            active={stageFilter === f.key}
            onClick={() => setStageFilter(f.key)}
          >
            {f.label} {stageCounts[f.key]}
          </FilterChip>
        ))}
      </div>

      {visibleTransactions.length === 0 ? (
        <EmptyState onRegister={() => setView("form")} />
      ) : (
        <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden">
          {visibleTransactions.map((t) => (
            <ListRow key={t.id} className="first:border-t-0">
              <div className="w-20 shrink-0">
                <div className="text-sm font-extrabold">{t.time}</div>
                <div className="text-xs text-caption">{t.id}</div>
              </div>
              <div className="flex-1 min-w-32">
                <div className="text-sm font-bold">{t.name}</div>
                <div className="text-xs text-caption tabular-nums">{t.phone}</div>
              </div>
              <div className="flex-[2] min-w-36 text-sm text-body">{t.memo}</div>
              <Badge tone={STAGE_TONE[t.stage]} className="shrink-0">
                {t.stage}
              </Badge>
              <button className="shrink-0 h-10 px-4 rounded-xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-xs font-semibold transition">
                상세보기
              </button>
            </ListRow>
          ))}
        </div>
      )}
    </>
  );
}

function EmptyState({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="max-w-md bg-white border border-line rounded-3xl shadow-sm p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
        <ScaleIcon className="w-6 h-6" />
      </div>
      <div className="text-sm font-bold">조건에 맞는 거래가 없습니다</div>
      <p className="text-xs text-caption leading-relaxed m-0">현장 방문 고객의 매입·감정을 등록해보세요.</p>
      <button
        onClick={onRegister}
        className="h-12 px-5 rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/20 inline-flex items-center gap-2 transition"
      >
        <PlusIcon className="w-4 h-4" />
        현장 매입 등록
      </button>
    </div>
  );
}

type Receipt = { id: string; name: string; phone: string; at: string };

function RegistrationForm({ onCancel }: { onCancel: () => void }) {
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookup, setLookup] = useState<LookupEntry | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [idType, setIdType] = useState<IdType | null>(null);
  const [visualChecked, setVisualChecked] = useState(true);
  const [memo, setMemo] = useState("");

  const [showErrors, setShowErrors] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const nameError = showErrors && name.trim() === "";
  const phoneError = showErrors && phone.trim() === "";

  function handleLookup() {
    const digits = onlyDigits(lookupPhone);
    // TODO(API 연동): 전화번호로 회원/재방문 조회 API 호출
    const entry = MOCK_LOOKUP[digits] ?? null;
    setLookupDone(true);
    setLookup(entry);
    setPhone(lookupPhone);
    if (entry) {
      setName(entry.name);
      setBirth(entry.birth ?? "");
    }
  }

  function handleSubmit() {
    if (name.trim() === "" || phone.trim() === "") {
      setShowErrors(true);
      return;
    }
    // TODO(API 연동): POST /biz/transactions — 접수 등록 후 접수번호 발급
    setReceipt({
      id: "TRX-20260710-0027",
      name: name.trim(),
      phone,
      at: "2026년 7월 10일 (금) 15:42 KST",
    });
  }

  if (receipt) {
    return <SuccessCard receipt={receipt} onBackToList={onCancel} />;
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">현장 매입 등록</h1>
          <div className="text-sm text-caption mt-1.5">고객 신원 확인 후 접수번호를 발급합니다 · KST</div>
        </div>
        <button
          onClick={onCancel}
          className="h-12 px-5 rounded-2xl bg-white border border-line hover:border-primary-light hover:text-primary text-body text-sm font-semibold transition"
        >
          목록으로
        </button>
      </div>

      <div className="flex gap-5 flex-wrap items-start">
        <div className="flex-[1.7] min-w-80 flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StepBadge n={1} active />
              <h2 className="text-base font-extrabold m-0">고객 확인</h2>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                전화번호 조회
              </span>
            </div>

            <div className="flex gap-2.5 flex-wrap">
              <input
                type="tel"
                inputMode="tel"
                placeholder="010-0000-0000"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                className="flex-1 min-w-0 h-[52px] px-4 rounded-2xl border border-line bg-white text-sm outline-none focus:border-primary tabular-nums"
              />
              <button
                onClick={handleLookup}
                className="shrink-0 h-[52px] px-6 rounded-2xl bg-ink hover:bg-body text-white text-sm font-bold transition"
              >
                조회
              </button>
            </div>

            {lookupDone && <LookupBanner lookup={lookup} />}
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StepBadge n={2} active />
              <h2 className="text-base font-extrabold m-0">신원정보</h2>
              <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                특금법 실명확인
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <Field label="실명" required error={nameError} errorText="실명을 입력해주세요">
                <Input
                  placeholder="고객 실명"
                  value={name}
                  error={nameError}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="전화번호" required error={phoneError} errorText="전화번호를 입력해주세요">
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  error={phoneError}
                  className="tabular-nums"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="생년월일" optional>
                <Input
                  placeholder="YYYY-MM-DD"
                  value={birth}
                  className="tabular-nums"
                  onChange={(e) => setBirth(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-body">
                신분증 종류 <span className="text-caption font-medium">(선택)</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {ID_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setIdType(idType === t ? null : t)}
                    className={`h-11 px-[18px] rounded-xl text-sm transition ${
                      idType === t
                        ? "border-2 border-primary bg-orange-50 text-primary font-bold"
                        : "border border-line bg-white hover:border-primary-light text-body font-semibold"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5 bg-surface border border-line rounded-2xl px-4 py-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visualChecked}
                onChange={(e) => setVisualChecked(e.target.checked)}
                className="w-5 h-5 accent-primary mt-0.5"
              />
              <span className="text-sm leading-relaxed text-body">
                <span className="font-bold text-ink">신분증 육안 확인 완료</span>
                <br />
                실물 신분증과 고객 실명이 일치함을 확인했습니다.{" "}
                <span className="text-caption">주민등록번호 전체와 신분증 사본은 수집하지 않습니다.</span>
              </span>
            </label>
          </Card>

          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <StepBadge n={3} active />
              <h2 className="text-base font-extrabold m-0">메모 · 접수 확인</h2>
            </div>
            <textarea
              rows={3}
              placeholder="접수 메모 (예: 14K 추정 목걸이 1점, 골드바 지참)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="px-4 py-3.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-primary resize-y leading-relaxed"
            />
            <button
              onClick={handleSubmit}
              className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition"
            >
              접수하기
            </button>
          </Card>
        </div>

        <div className="flex-1 min-w-72 flex flex-col gap-4">
          <section className="bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3.5">
            <h3 className="text-sm font-extrabold m-0">다음 단계 안내</h3>
            <StageStep n={1} active title="접수" desc="신원확인 후 접수번호 발급 — 지금 단계" showLine />
            <StageStep n={2} title="실물 감정 (XRF)" desc="품목·순도·중량 측정 후 금액 확정" showLine />
            <StageStep n={3} title="정산" desc="고객 동의 후 매입 대금 지급" />
          </section>

          <section className="bg-blue-50 border border-blue-200 rounded-3xl p-5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-extrabold text-blue-700 m-0">특금법 안내</h3>
            </div>
            <p className="text-xs leading-relaxed text-blue-800 m-0">
              특정금융거래법에 따라 귀금속 매입 시 고객 실명확인이 필요합니다. 실명·전화번호만 필수이며,{" "}
              <strong>주민등록번호 전체와 신분증 사본 이미지는 수집·저장하지 않습니다.</strong>
            </p>
          </section>

          <section className="bg-white border border-line rounded-3xl shadow-sm p-5 flex items-center gap-3.5">
            <Stat label="오늘 접수" value={5} />
            <div className="w-px h-9 bg-line" />
            <Stat label="감정중" value={2} tone="text-amber-700" />
            <div className="w-px h-9 bg-line" />
            <Stat label="완료" value={3} tone="text-green-600" />
          </section>
        </div>
      </div>
    </>
  );
}

function LookupBanner({ lookup }: { lookup: LookupEntry | null }) {
  if (!lookup) {
    return (
      <div className="flex items-center gap-3 bg-surface border border-dashed border-slate-300 rounded-2xl px-4 py-3.5">
        <Badge tone="slate" className="shrink-0">
          신규 고객
        </Badge>
        <div className="text-sm text-body leading-relaxed">
          조회 결과가 없습니다. 아래 신원정보를 새로 입력해주세요.
        </div>
      </div>
    );
  }

  if (lookup.result === "member") {
    return (
      <div className="flex items-center gap-3.5 bg-orange-50 border-2 border-orange-100 rounded-2xl px-4 py-3.5 flex-wrap">
        <div className="w-10 h-10 rounded-full bg-white border border-orange-100 grid place-items-center text-sm font-extrabold text-primary shrink-0">
          {lookup.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-36">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold">{lookup.name}</span>
            <span className="text-[11px] font-bold text-white bg-primary rounded-full px-2.5 py-0.5">회원 연결</span>
          </div>
          <div className="text-xs text-caption mt-0.5">{lookup.detail}</div>
        </div>
        <CheckCircleIcon className="w-5 h-5 shrink-0 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3.5 bg-violet-50 border-2 border-violet-200 rounded-2xl px-4 py-3.5 flex-wrap">
      <div className="w-10 h-10 rounded-full bg-white border border-violet-200 grid place-items-center text-sm font-extrabold text-violet-600 shrink-0">
        {lookup.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-36">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold">{lookup.name}</span>
          <span className="text-[11px] font-bold text-white bg-violet-600 rounded-full px-2.5 py-0.5">재방문</span>
        </div>
        <div className="text-xs text-caption mt-0.5">{lookup.detail}</div>
      </div>
    </div>
  );
}

function SuccessCard({ receipt, onBackToList }: { receipt: Receipt; onBackToList: () => void }) {
  return (
    <div className="grid place-items-center py-4">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-11 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-green-50 border-2 border-green-200 grid place-items-center">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">접수가 완료되었습니다</h2>
          <div className="text-sm text-caption mt-2">{receipt.at}</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between">
            <span className="text-xs text-caption">접수번호</span>
            <span className="text-sm font-extrabold text-primary tabular-nums">{receipt.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">고객</span>
            <span className="text-sm font-bold">
              {receipt.name} · {receipt.phone}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">다음 단계</span>
            <span className="text-sm font-bold">실물 감정 (XRF)</span>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          {/* TODO(API 연동): 실물 감정(XRF) 화면으로 이동 — 접수번호 전달 */}
          <button className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition">
            실물 감정으로 이동
          </button>
          <button
            onClick={onBackToList}
            className="h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold transition"
          >
            목록으로 돌아가기
          </button>
        </div>
        <div className="text-xs text-caption leading-relaxed">품목·중량·매입 금액은 감정 단계에서 확정됩니다.</div>
      </div>
    </div>
  );
}

function StepBadge({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={`w-6 h-6 rounded-full text-xs font-extrabold grid place-items-center shrink-0 ${
        active ? "bg-primary text-white" : "bg-slate-100 border border-line text-caption"
      }`}
    >
      {n}
    </span>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  errorText,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: boolean;
  errorText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-body">
        {label} {required && <span className="text-primary">*</span>}
        {optional && <span className="text-caption font-medium">(선택)</span>}
      </label>
      {children}
      {error && errorText && (
        <div className="flex items-center gap-1 text-xs font-semibold text-red-600">
          <AlertCircleIcon className="w-3.5 h-3.5" />
          {errorText}
        </div>
      )}
    </div>
  );
}

function StageStep({
  n,
  title,
  desc,
  active,
  showLine,
}: {
  n: number;
  title: string;
  desc: string;
  active?: boolean;
  showLine?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${n > 1 ? "-mt-3.5" : ""}`}>
      <div className="flex flex-col items-center shrink-0">
        <span
          className={`w-6 h-6 rounded-full text-[11px] font-extrabold grid place-items-center ${
            active ? "bg-primary text-white" : "bg-slate-100 border border-line text-caption"
          }`}
        >
          {n}
        </span>
        {showLine && <span className="w-0.5 flex-1 min-h-5 bg-line" />}
      </div>
      <div className="pb-4">
        <div className={`text-sm font-bold ${active ? "" : "text-body"}`}>{title}</div>
        <div className="text-xs text-caption leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex-1">
      <div className="text-xs font-semibold text-caption">{label}</div>
      <div className={`text-2xl font-extrabold ${tone ?? ""}`}>
        {value}
        <span className="text-sm font-semibold">건</span>
      </div>
    </div>
  );
}
