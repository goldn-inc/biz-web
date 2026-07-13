"use client";

import { useState } from "react";
import {
  CouponTagIcon,
  QrIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
} from "@/components/icons";

type CouponResult = "valid" | "used" | "expired";

type UsedInfo = { at: string; store: string; trx: string };

type Coupon = {
  code: string;
  name: string;
  result: CouponResult;
  issuedCustomer: string;
  issuedPhone: string;
  discountLabel: string;
  discountSub: string;
  usedInfo?: UsedInfo;
  reason?: string;
  reasonSub?: string;
};

type OpenTransaction = {
  id: string;
  customer: string;
  stage: string;
  time: string;
  item: string;
  issuedMatch: boolean;
};

type HistoryEntry = {
  name: string;
  meta: string;
  amount: string;
};

type AppliedReceipt = {
  couponName: string;
  discount: string;
  trxLabel: string;
};

const NOW_LABEL = "2026년 7월 10일 (금) · KST · 고객 앱 발급 쿠폰 조회·검증";
const APPLIED_LABEL = "2026년 7월 10일 (금) 16:05 KST";

// TODO(API 연동): 실제로는 POST /coupons/verify 로 코드/QR 페이로드를 검증한다. 지금은 이식 단계라 샘플 쿠폰을 코드로 매핑한다.
const SAMPLE_COUPONS: Coupon[] = [
  {
    code: "GS-7A2K-M9Q4",
    name: "7월 골드 매입 감사 쿠폰",
    result: "valid",
    issuedCustomer: "김○지",
    issuedPhone: "010-****-5678",
    discountLabel: "30,000원 할인",
    discountSub: "정액 · 2026-07-31까지",
  },
  {
    code: "GS-3F8B-K2P7",
    name: "첫 방문 감정비 무료 쿠폰",
    result: "used",
    issuedCustomer: "박○호",
    issuedPhone: "010-****-2214",
    discountLabel: "감정비 무료",
    discountSub: "정액 · 2026-07-31까지",
    usedInfo: {
      at: "2026-07-03 (금) 14:22 KST",
      store: "종로 골드스타 (본 매장)",
      trx: "TRX-20260703-0011",
    },
  },
  {
    code: "GS-9C1D-X5R2",
    name: "6월 은 매입 10% 할인 쿠폰",
    result: "expired",
    issuedCustomer: "이○연",
    issuedPhone: "010-****-9931",
    discountLabel: "정률 10%",
    discountSub: "최대 50,000원",
    reason: "유효기한 만료 — 2026-06-30까지 사용 가능",
    reasonSub: "그 외 사유(해당 매장 미적용, 최소 거래금액 미달 등)도 동일한 형식으로 표시됩니다.",
  },
];

// TODO(API 연동): 진행 중 거래는 GET /transactions?stage=open 으로 조회한다. issuedMatch 는 쿠폰 발급 고객과 거래 고객 일치 여부.
const OPEN_TRANSACTIONS: OpenTransaction[] = [
  {
    id: "TRX-0027",
    customer: "김○지",
    stage: "접수",
    time: "오늘 15:42",
    item: "14K 추정 목걸이 1점",
    issuedMatch: true,
  },
  {
    id: "TRX-0026",
    customer: "박○호",
    stage: "감정중",
    time: "오늘 14:10",
    item: "18K 팔찌",
    issuedMatch: false,
  },
];

const INITIAL_HISTORY: HistoryEntry[] = [
  { name: "7월 골드 매입 감사 쿠폰", meta: "김○지 · 오늘 16:05 · TRX-0027", amount: "-30,000원" },
  { name: "감정비 무료 쿠폰", meta: "정○민 · 어제 15:40 · TRX-0019", amount: "-15,000원" },
  { name: "은 매입 10% 할인", meta: "한○울 · 7/8 13:22 · TRX-0014", amount: "-42,300원" },
];

type ViewState = "idle" | "loading" | "result" | "applied";

export default function CouponsPage() {
  const [code, setCode] = useState("");
  const [view, setView] = useState<ViewState>("idle");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string>(OPEN_TRANSACTIONS[0].id);
  const [receipt, setReceipt] = useState<AppliedReceipt | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(INITIAL_HISTORY);
  const [notFound, setNotFound] = useState(false);

  function lookup(rawCode: string) {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) return;
    setView("loading");
    setNotFound(false);
    // TODO(API 연동): 검증 요청을 실제 백엔드로 보낸다. 여기서는 조회 로딩만 흉내낸다.
    window.setTimeout(() => {
      const match = SAMPLE_COUPONS.find((c) => c.code === normalized);
      if (!match) {
        setCoupon(null);
        setNotFound(true);
        setView("result");
        return;
      }
      setCoupon(match);
      setSelectedTxId(OPEN_TRANSACTIONS[0].id);
      setView("result");
    }, 600);
  }

  function handleQrScan() {
    // TODO(API 연동): QR 스캐너(카메라) 연동. 지금은 UI affordance만 — 유효 샘플 쿠폰을 조회한다.
    setCode("GS-7A2K-M9Q4");
    lookup("GS-7A2K-M9Q4");
  }

  function applyToTransaction() {
    if (!coupon || coupon.result !== "valid") return;
    const tx = OPEN_TRANSACTIONS.find((t) => t.id === selectedTxId) ?? OPEN_TRANSACTIONS[0];
    // TODO(API 연동): POST /transactions/:id/coupons 로 쿠폰을 거래에 적용(정산 시 차감).
    setReceipt({
      couponName: coupon.name,
      discount: coupon.discountLabel,
      trxLabel: `${tx.id} · ${tx.customer} · ${tx.stage}`,
    });
    setHistory((prev) => [
      { name: coupon.name, meta: `${tx.customer} · 방금 · ${tx.id}`, amount: `-${coupon.discountLabel.replace(" 할인", "")}` },
      ...prev,
    ]);
    setView("applied");
  }

  function resetLookup() {
    setCode("");
    setCoupon(null);
    setReceipt(null);
    setNotFound(false);
    setView("idle");
  }

  return (
    <>
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight m-0">쿠폰 적용</h1>
        <div className="text-sm text-caption mt-1.5">{NOW_LABEL}</div>
      </div>

      {view === "applied" && receipt ? (
        <AppliedCard receipt={receipt} onReset={resetLookup} />
      ) : (
        <>
          <div className="flex gap-5 flex-wrap items-start">
            <section className="flex-[1.6] min-w-80 bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 flex flex-col gap-3.5">
              <h2 className="text-base font-extrabold m-0">쿠폰 조회</h2>
              <form
                className="flex gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  lookup(code);
                }}
              >
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="쿠폰 코드 입력 (예: GS-XXXX-XXXX)"
                  className="flex-1 min-w-0 h-[52px] px-4 rounded-2xl border border-line bg-white text-sm outline-none focus:border-primary tracking-wider"
                />
                <button
                  type="submit"
                  className="shrink-0 h-[52px] px-6 rounded-2xl bg-ink hover:bg-body text-white text-sm font-bold disabled:opacity-50"
                  disabled={view === "loading" || code.trim().length === 0}
                >
                  조회
                </button>
              </form>
              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-line" />
                <span className="text-xs font-semibold text-caption">또는</span>
                <span className="flex-1 h-px bg-line" />
              </div>
              <button
                type="button"
                onClick={handleQrScan}
                disabled={view === "loading"}
                className="h-[52px] rounded-2xl border-2 border-dashed border-slate-300 bg-surface hover:border-primary-light hover:text-primary text-body text-sm font-bold inline-flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <QrIcon className="w-5 h-5" />
                QR 스캔으로 조회
              </button>
              <div className="text-xs text-caption leading-relaxed">
                샘플 코드: <span className="tabular-nums font-semibold">GS-7A2K-M9Q4</span>(유효) ·{" "}
                <span className="tabular-nums font-semibold">GS-3F8B-K2P7</span>(사용됨) ·{" "}
                <span className="tabular-nums font-semibold">GS-9C1D-X5R2</span>(만료)
              </div>
            </section>

            <section className="flex-1 min-w-72 bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-1.5">
              <h3 className="text-sm font-extrabold m-0 mb-2">최근 적용 이력</h3>
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 text-center py-6">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 grid place-items-center text-slate-400">
                    <CouponTagIcon className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold">아직 적용한 쿠폰이 없습니다</div>
                  <p className="text-xs text-caption m-0">쿠폰을 조회해 거래에 적용하면 이력이 쌓입니다.</p>
                </div>
              ) : (
                history.map((h, i) => (
                  <div key={`${h.meta}-${i}`} className="flex items-center gap-3 py-2.5 border-t border-slate-100">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 grid place-items-center text-primary shrink-0">
                      <CouponTagIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{h.name}</div>
                      <div className="text-xs text-caption">{h.meta}</div>
                    </div>
                    <div className="text-sm font-extrabold text-primary shrink-0 tabular-nums">{h.amount}</div>
                  </div>
                ))
              )}
            </section>
          </div>

          {view === "loading" && <LoadingCard />}

          {view === "result" && notFound && <NotFoundCard code={code} />}

          {view === "result" && coupon?.result === "valid" && (
            <ValidCard
              coupon={coupon}
              transactions={OPEN_TRANSACTIONS}
              selectedTxId={selectedTxId}
              onSelectTx={setSelectedTxId}
              onApply={applyToTransaction}
            />
          )}

          {view === "result" && coupon?.result === "used" && coupon.usedInfo && <UsedCard coupon={coupon} />}

          {view === "result" && coupon?.result === "expired" && <ExpiredCard coupon={coupon} />}
        </>
      )}
    </>
  );
}

function LoadingCard() {
  return (
    <div className="w-full max-w-xl bg-white border border-line rounded-3xl shadow-sm p-5 flex flex-col gap-3">
      <div className="h-[52px] rounded-2xl bg-slate-100 animate-pulse" />
      <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
    </div>
  );
}

function NotFoundCard({ code }: { code: string }) {
  return (
    <div className="max-w-xl bg-white border-2 border-amber-200 rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-amber-50 px-5 py-3 border-b border-dashed border-amber-300">
        <AlertTriangleIcon className="w-[18px] h-[18px] text-amber-700" />
        <span className="text-sm font-extrabold text-amber-700">적용할 수 없는 쿠폰입니다</span>
        <span className="ml-auto text-xs text-amber-800 tabular-nums">{code.trim().toUpperCase()}</span>
      </div>
      <div className="p-5">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-white bg-amber-700 rounded-full px-2.5 py-0.5">사유</span>
            <span className="text-sm font-bold text-amber-800">존재하지 않는 쿠폰 코드입니다</span>
          </div>
          <div className="text-xs text-amber-800 leading-relaxed">코드를 다시 확인하거나 QR로 조회해주세요.</div>
        </div>
      </div>
    </div>
  );
}

function ValidCard({
  coupon,
  transactions,
  selectedTxId,
  onSelectTx,
  onApply,
}: {
  coupon: Coupon;
  transactions: OpenTransaction[];
  selectedTxId: string;
  onSelectTx: (id: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="max-w-xl bg-white border-2 border-orange-100 rounded-3xl shadow-lg shadow-primary/5 overflow-hidden">
      <div className="flex items-center gap-2.5 bg-orange-50 px-5 py-3 border-b border-dashed border-orange-300">
        <CheckCircleIcon className="w-[18px] h-[18px] text-primary" />
        <span className="text-sm font-extrabold text-primary">유효한 쿠폰입니다</span>
        <span className="ml-auto text-xs text-orange-900/60 tabular-nums">{coupon.code}</span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-primary grid place-items-center text-white shrink-0 shadow-lg shadow-primary/30">
            <CouponTagIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-44">
            <div className="text-base font-extrabold">{coupon.name}</div>
            <div className="text-xs text-caption">
              발급 고객 {coupon.issuedCustomer} · {coupon.issuedPhone}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold text-primary">{coupon.discountLabel}</div>
            <div className="text-xs text-caption">{coupon.discountSub}</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-extrabold text-body">적용할 거래 선택</div>
          {transactions.map((tx) => {
            const selected = tx.id === selectedTxId;
            return (
              <label
                key={tx.id}
                className={`flex items-center gap-3 border-2 rounded-2xl px-4 py-3 cursor-pointer ${
                  selected ? "border-primary bg-orange-50" : "border-line bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="tx"
                  checked={selected}
                  onChange={() => onSelectTx(tx.id)}
                  className="w-[18px] h-[18px] accent-primary"
                />
                <div className="flex-1">
                  <div className={`text-sm font-bold ${selected ? "" : "text-body"}`}>
                    {tx.id} · {tx.customer} · {tx.stage}
                  </div>
                  <div className="text-xs text-caption">
                    {tx.time} · {tx.item}
                  </div>
                </div>
                {tx.issuedMatch && (
                  <span className="text-[11px] font-bold text-primary bg-white border border-orange-100 rounded-full px-2.5 py-0.5 shrink-0">
                    발급 고객 일치
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onApply}
          className="h-14 rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25"
        >
          거래에 적용
        </button>
      </div>
    </div>
  );
}

function UsedCard({ coupon }: { coupon: Coupon }) {
  const used = coupon.usedInfo!;
  return (
    <div className="max-w-xl bg-white border-2 border-red-200 rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-red-50 px-5 py-3 border-b border-dashed border-red-300">
        <XCircleIcon className="w-[18px] h-[18px] text-red-600" />
        <span className="text-sm font-extrabold text-red-600">이미 사용된 쿠폰입니다</span>
        <span className="ml-auto text-xs text-red-700 tabular-nums">{coupon.code}</span>
      </div>
      <div className="p-5 flex flex-col gap-3.5">
        <div className="flex gap-4 items-center flex-wrap opacity-75">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-line grid place-items-center text-caption shrink-0">
            <CouponTagIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-44">
            <div className="text-base font-extrabold line-through text-caption">{coupon.name}</div>
            <div className="text-xs text-caption">
              발급 고객 {coupon.issuedCustomer} · {coupon.issuedPhone}
            </div>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-4 py-3.5 flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-xs text-caption">사용 일시</span>
            <span className="text-sm font-bold">{used.at}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">사용 매장</span>
            <span className="text-sm font-bold">{used.store}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-caption">적용 거래</span>
            <span className="text-sm font-bold tabular-nums">{used.trx}</span>
          </div>
        </div>
        <div className="text-sm text-red-700 leading-relaxed">
          사용 완료된 쿠폰은 재사용할 수 없습니다. 고객에게 사용 이력을 안내해주세요.
        </div>
      </div>
    </div>
  );
}

function ExpiredCard({ coupon }: { coupon: Coupon }) {
  return (
    <div className="max-w-xl bg-white border-2 border-amber-200 rounded-3xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-amber-50 px-5 py-3 border-b border-dashed border-amber-300">
        <AlertTriangleIcon className="w-[18px] h-[18px] text-amber-700" />
        <span className="text-sm font-extrabold text-amber-700">적용할 수 없는 쿠폰입니다</span>
        <span className="ml-auto text-xs text-amber-800 tabular-nums">{coupon.code}</span>
      </div>
      <div className="p-5 flex flex-col gap-3.5">
        <div className="flex gap-4 items-center flex-wrap opacity-75">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-line grid place-items-center text-caption shrink-0">
            <CouponTagIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-44">
            <div className="text-base font-extrabold text-caption">{coupon.name}</div>
            <div className="text-xs text-caption">
              {coupon.discountLabel} · {coupon.discountSub} · 발급 고객 {coupon.issuedCustomer}
            </div>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold text-white bg-amber-700 rounded-full px-2.5 py-0.5">사유</span>
            <span className="text-sm font-bold text-amber-800">{coupon.reason}</span>
          </div>
          {coupon.reasonSub && <div className="text-xs text-amber-800 leading-relaxed">{coupon.reasonSub}</div>}
        </div>
      </div>
    </div>
  );
}

function AppliedCard({ receipt, onReset }: { receipt: AppliedReceipt; onReset: () => void }) {
  return (
    <div className="w-full grid place-items-center">
      <div className="w-full max-w-lg bg-white border border-line rounded-3xl shadow-lg p-8 md:p-10 flex flex-col items-center gap-[18px] text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-green-50 border-2 border-green-200 grid place-items-center">
          <CheckIcon className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold m-0">쿠폰이 적용되었습니다</h2>
          <div className="text-sm text-caption mt-2">{APPLIED_LABEL}</div>
        </div>
        <div className="w-full bg-surface border border-line rounded-2xl p-[18px] flex flex-col gap-2.5 text-left">
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">쿠폰</span>
            <span className="text-sm font-bold">{receipt.couponName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">할인</span>
            <span className="text-sm font-extrabold text-primary">{receipt.discount}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">적용 거래</span>
            <span className="text-sm font-bold tabular-nums">{receipt.trxLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-xs text-caption">반영 시점</span>
            <span className="text-sm font-bold">감정 후 정산 금액에서 차감</span>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          {/* TODO(API 연동): 해당 거래 상세로 라우팅(/transactions/:id) */}
          <button
            type="button"
            className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-sm font-bold shadow-lg shadow-primary/25"
          >
            해당 거래로 이동
          </button>
          <button
            type="button"
            onClick={onReset}
            className="h-12 rounded-2xl bg-white border border-line hover:bg-slate-100 text-body text-sm font-semibold"
          >
            다른 쿠폰 조회
          </button>
        </div>
      </div>
    </div>
  );
}
