"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { INTENSITY, MotionIntensity } from "@/lib/motion";
import { Badge, BadgeTone } from "@/components/ui/Badge";

/**
 * 모션 강도 비교 PoC — 확정 후 삭제할 화면.
 *
 * 같은 화면 조각(KPI 카드 · 거래 목록 · 액션 버튼)에 강도 프리셋 3종을 번갈아 적용해
 * 결을 눈으로 고르기 위한 것이다. 로그인 셸 `(shell)` 밖에 있어 인증 없이 열린다.
 * 접근 경로: `/dev/motion`
 */

const KPI = [
  { label: "이번 달 매입액", value: "48,320,000", unit: "원", delta: "+12.4%" },
  { label: "예약", value: "17", unit: "건", delta: "+3건" },
  { label: "쿠폰 사용", value: "9", unit: "건", delta: "-1건" },
];

const ROWS: { name: string; item: string; weight: string; amount: string; tone: BadgeTone; status: string }[] = [
  { name: "김도현", item: "골드바 37.5g", weight: "37.5g", amount: "8,152,500", tone: "green", status: "정산완료" },
  { name: "이수민", item: "18K 목걸이", weight: "12.4g", amount: "1,984,000", tone: "amber", status: "감정중" },
  { name: "박준영", item: "실버바 1kg", weight: "1,000g", amount: "1,051,000", tone: "blue", status: "입고" },
  { name: "정하늘", item: "24K 반지", weight: "5.2g", amount: "1,130,800", tone: "green", status: "정산완료" },
  { name: "최민서", item: "14K 팔찌", weight: "9.8g", amount: "1,215,000", tone: "slate", status: "대기" },
];

const ORDER: MotionIntensity[] = ["subtle", "signature", "expressive"];

export default function MotionIntensityPoc() {
  const [intensity, setIntensity] = useState<MotionIntensity>("signature");
  // key 를 바꿔 다시 마운트해야 진입 애니메이션이 처음부터 다시 돈다
  const [runId, setRunId] = useState(0);
  const reduced = Boolean(useReducedMotion());
  const preset = INTENSITY[intensity];

  const replay = (next: MotionIntensity) => {
    setIntensity(next);
    setRunId((n) => n + 1);
  };

  return (
    <main className="min-h-screen bg-surface px-6 py-10 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-caption">
            GOLDSILVER BIZ
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">모션 강도 비교</h1>
          <p className="mt-2 text-sm leading-6 text-body">
            같은 화면에 결을 바꿔가며 적용합니다. 버튼을 누르면 진입 애니메이션이 처음부터 다시
            재생됩니다. 고르신 하나만 남기고 나머지 프리셋은 지웁니다.
          </p>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {ORDER.map((key) => {
            const active = key === intensity;
            return (
              <motion.button
                key={key}
                onClick={() => replay(key)}
                whileHover={reduced ? undefined : preset.hover}
                whileTap={reduced ? undefined : preset.tap}
                className={`h-11 rounded-2xl px-5 text-sm font-bold transition-colors ${
                  active
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "border border-line bg-white text-body hover:border-primary-light hover:text-primary"
                }`}
              >
                {INTENSITY[key].label}
              </motion.button>
            );
          })}
          <motion.button
            onClick={() => setRunId((n) => n + 1)}
            whileHover={reduced ? undefined : preset.hover}
            whileTap={reduced ? undefined : preset.tap}
            className="h-11 rounded-2xl border border-line bg-white px-5 text-sm font-bold text-body hover:border-primary-light hover:text-primary"
          >
            다시 재생
          </motion.button>
        </div>

        <p className="mb-8 min-h-[48px] max-w-3xl text-sm leading-6 text-body">{preset.summary}</p>

        {reduced && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
            OS 에서 &ldquo;동작 줄이기&rdquo;가 켜져 있어 애니메이션이 꺼진 상태로 보입니다. 실제
            화면에서도 이 설정이면 동일하게 정지 상태로 나갑니다.
          </div>
        )}

        <motion.div
          key={`${intensity}-${runId}`}
          variants={preset.container}
          initial={reduced ? false : "hidden"}
          animate="shown"
          className="space-y-8"
        >
          <motion.section variants={preset.item} className="grid gap-4 md:grid-cols-3">
            {KPI.map((k) => (
              <motion.div
                key={k.label}
                variants={preset.item}
                whileHover={reduced ? undefined : preset.hover}
                className="rounded-3xl border border-line bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-bold text-caption">{k.label}</p>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-ink">
                  {k.value}
                  <span className="ml-1 text-sm font-bold text-caption">{k.unit}</span>
                </p>
                <p className="mt-1 text-xs font-bold text-primary">{k.delta}</p>
              </motion.div>
            ))}
          </motion.section>

          <motion.section
            variants={preset.item}
            className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm"
          >
            <div className="px-5 py-4">
              <h2 className="text-base font-extrabold text-ink">최근 거래</h2>
            </div>
            {ROWS.map((r) => (
              <motion.div
                key={r.name}
                variants={preset.item}
                whileHover={reduced ? undefined : preset.hover}
                className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3.5"
              >
                <span className="w-16 text-sm font-bold text-ink">{r.name}</span>
                <span className="flex-1 text-sm text-body">{r.item}</span>
                <span className="text-sm text-caption">{r.weight}</span>
                <span className="w-28 text-right text-sm font-bold text-ink">{r.amount}원</span>
                <Badge tone={r.tone}>{r.status}</Badge>
              </motion.div>
            ))}
          </motion.section>

          <motion.section variants={preset.item} className="flex flex-wrap gap-3">
            <motion.button
              whileHover={reduced ? undefined : preset.hover}
              whileTap={reduced ? undefined : preset.tap}
              className="h-12 rounded-2xl bg-primary px-6 text-sm font-bold text-white shadow-lg shadow-primary/20"
            >
              도매 주문하기
            </motion.button>
            <motion.button
              whileHover={reduced ? undefined : preset.hover}
              whileTap={reduced ? undefined : preset.tap}
              className="h-12 rounded-2xl border border-line bg-white px-6 text-sm font-bold text-body"
            >
              거래 내역 전체보기
            </motion.button>
          </motion.section>
        </motion.div>
      </div>
    </main>
  );
}
