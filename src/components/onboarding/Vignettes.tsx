"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
    useTransform,
  type MotionValue,
} from "motion/react";
import { useReducedMotionSafe } from "@/lib/reduced-motion";
import { LottiePlayer } from "./LottiePlayer";

/**
 * 온보딩 슬라이드별 자동 재생 비네트 — b2b_mobile `OnboardingVignettes` 의 웹 이식.
 *
 * 모바일은 Reanimated 의 `interpolate(t, input, output, CLAMP)` 로 0~100 루프를 돌린다.
 * Motion 의 `useTransform(t, input, output)` 이 같은 모양이고 기본이 clamp 라 키프레임을
 * 그대로 옮겼다. 타임라인 구간 값도 모바일과 동일하다.
 *
 * 성능: 모든 변화는 transform·opacity·backgroundColor 로만 준다. 진행선은 모바일이
 * `width: %` 를 쓰지만 웹에서 width 는 레이아웃을 다시 계산시키므로 `scaleX` 로 바꿨다.
 * 값은 MotionValue 라 React 렌더를 타지 않는다.
 */

const LOOP_MS = 3400;

const INK = "#111111";
const CAPTION = "#767676";
const PRIMARY = "#ea580c";
const PRIMARY_SOFT = "#ffedd5";
const OFF = "#e8e8e8";
const OFF_TEXT = "#cccccc";

/** 0→100 을 선형으로 무한 반복. 비활성 슬라이드는 0 에 세워두고, 동작 줄이기면 완료 상태로 정지. */
function useCycle(active: boolean, durationMs: number = LOOP_MS): MotionValue<number> {
  const reduce = useReducedMotionSafe();
  const t = useMotionValue(reduce ? 100 : 0);

  useEffect(() => {
    if (reduce) {
      t.set(100);
      return;
    }
    if (!active) {
      t.set(0);
      return;
    }
    t.set(0);
    const controls = animate(t, 100, {
      duration: durationMs / 1000,
      ease: "linear",
      repeat: Infinity,
      repeatType: "loop",
    });
    return () => controls.stop();
  }, [active, reduce, durationMs, t]);

  return t;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-sm aspect-[4/3] rounded-3xl bg-surface border border-line overflow-hidden grid place-items-center">
      {children}
    </div>
  );
}

/**
 * 1) 예약 카드 팝 → 확정 버튼 프레스 → 오늘 예약 요약 시트 슬라이드업.
 * b2b_mobile 의 시세·발주 비네트와 같은 타임라인이되, biz-web 1번 슬라이드 문구가
 * "예약을 한눈에" 라 내용을 예약으로 맞췄다.
 */
export function ReservationVignette({ active }: { active: boolean }) {
  const t = useCycle(active);

  const cardOpacity = useTransform(t, [0, 10], [0, 1]);
  const cardScale = useTransform(t, [0, 10], [0.9, 1]);
  const btnScale = useTransform(t, [42, 46, 58, 62], [1, 0.94, 0.94, 1]);
  const dimOpacity = useTransform(t, [58, 65, 92, 100], [0, 0.28, 0.28, 0]);
  const sheetY = useTransform(t, [58, 68, 90, 100], [64, 0, 0, 64]);

  return (
    <Frame>
      <motion.div
        style={{ opacity: cardOpacity, scale: cardScale }}
        className="w-[220px] rounded-2xl bg-white shadow-sm p-4"
      >
        <div className="text-xs font-bold" style={{ color: CAPTION }}>
          오늘 14:30 · 방문 예약
        </div>
        <div className="mt-1 text-[22px] font-extrabold" style={{ color: INK }}>
          김도현 고객
        </div>
        <motion.div
          style={{ scale: btnScale }}
          className="mt-2.5 h-[38px] rounded-xl bg-primary grid place-items-center text-white text-[13.5px] font-extrabold"
        >
          예약 확정
        </motion.div>
      </motion.div>

      <motion.div
        style={{ opacity: dimOpacity }}
        className="absolute inset-0 bg-black pointer-events-none"
      />
      <motion.div
        style={{ y: sheetY }}
        className="absolute left-6 right-6 bottom-0 rounded-t-3xl bg-white p-4 pointer-events-none shadow-lg"
      >
        <div className="mx-auto mb-2.5 h-1 w-8 rounded-full bg-line" />
        <div className="text-sm font-extrabold" style={{ color: INK }}>
          오늘 예약 5건
        </div>
        <div className="mt-0.5 text-xs" style={{ color: CAPTION }}>
          확정 3 · 대기 2
        </div>
      </motion.div>
    </Frame>
  );
}

const LIGHTUP_ICONS = [
  { label: "감정", from: 0, to: 8 },
  { label: "매입", from: 8, to: 16 },
  { label: "정산", from: 16, to: 24 },
];

/** 2) 감정·매입·정산 3단계가 순차 점등 후 78~90 구간에서 함께 꺼진다. */
export function IconLightupVignette({ active }: { active: boolean }) {
  const t = useCycle(active);

  return (
    <Frame>
      <div className="flex items-center gap-[18px]">
        {LIGHTUP_ICONS.map((icon) => (
          <IconDot key={icon.label} label={icon.label} t={t} from={icon.from} to={icon.to} />
        ))}
      </div>
    </Frame>
  );
}

function IconDot({
  label,
  t,
  from,
  to,
}: {
  label: string;
  t: MotionValue<number>;
  from: number;
  to: number;
}) {
  const backgroundColor = useTransform(
    t,
    [from, to, 78, 90],
    [OFF, PRIMARY_SOFT, PRIMARY_SOFT, OFF],
  );
  const y = useTransform(t, [from, to, 78, 90], [0, -6, -6, 0]);
  const color = useTransform(t, [from, to, 78, 90], [OFF_TEXT, PRIMARY, PRIMARY, OFF_TEXT]);

  return (
    <motion.div
      style={{ backgroundColor, y }}
      className="w-[68px] h-[68px] rounded-full grid place-items-center"
    >
      <motion.span style={{ color }} className="text-[16.5px] font-extrabold">
        {label}
      </motion.span>
    </motion.div>
  );
}

const TIMELINE_STEPS = [
  { label: "요청", at: 0, msg: "발주가 접수되었어요" },
  { label: "확정", at: 22, msg: "본사가 발주를 확정했어요" },
  { label: "발송", at: 44, msg: "상품 발송을 시작했어요" },
  { label: "수령", at: 66, msg: "매장 도착 — 수령을 확인해주세요" },
];

/** 3) 발주 타임라인 — 스텝이 하나씩 차오르고 아래 알림 메시지가 스텝마다 교체된다. */
export function TimelineVignette({ active }: { active: boolean }) {
  const t = useCycle(active, 10500);

  return (
    <Frame>
      <div className="flex flex-col items-center">
        <div className="w-[264px] rounded-2xl bg-white shadow-sm px-4 py-[18px]">
          <div className="mb-4 text-[12.5px] font-extrabold" style={{ color: CAPTION }}>
            발주 진행 상황
          </div>
          <div className="flex items-center">
            {TIMELINE_STEPS.map((step, idx) => (
              <TimelineSegment
                key={step.label}
                t={t}
                at={step.at}
                label={step.label}
                lineTo={idx < TIMELINE_STEPS.length - 1 ? TIMELINE_STEPS[idx + 1].at : null}
              />
            ))}
          </div>
        </div>

        <div className="relative mt-3.5 w-[264px] h-[52px]">
          {TIMELINE_STEPS.map((step, idx) => (
            <TimelineMessage
              key={step.label}
              t={t}
              at={step.at}
              out={idx < TIMELINE_STEPS.length - 1 ? TIMELINE_STEPS[idx + 1].at : 88}
              text={step.msg}
            />
          ))}
        </div>
      </div>
    </Frame>
  );
}

function TimelineSegment({
  t,
  at,
  label,
  lineTo,
}: {
  t: MotionValue<number>;
  at: number;
  label: string;
  lineTo: number | null;
}) {
  const scale = useTransform(t, [at, at + 4, 88, 96], [0.75, 1, 1, 0.75]);
  const backgroundColor = useTransform(t, [at, at + 4, 88, 96], [OFF, PRIMARY, PRIMARY, OFF]);
  // 라인은 width 대신 scaleX — 웹에서 width 애니메이션은 매 프레임 레이아웃을 다시 잡는다
  const lineScale = useTransform(t, [at + 4, lineTo ?? at + 4], [0, 1]);
  const lineOpacity = useTransform(t, [88, 96], [1, 0]);

  return (
    <>
      <div className="flex flex-col items-center">
        <motion.div style={{ scale, backgroundColor }} className="w-3.5 h-3.5 rounded-full" />
        <div className="mt-2 text-[11px] font-bold" style={{ color: CAPTION }}>
          {label}
        </div>
      </div>
      {lineTo !== null && (
        <div className="flex-1 mx-1 mb-[23px] h-0.5 bg-line overflow-hidden">
          <motion.div
            style={{ scaleX: lineScale, opacity: lineOpacity, transformOrigin: "left center" }}
            className="h-0.5 w-full bg-primary"
          />
        </div>
      )}
    </>
  );
}

function TimelineMessage({
  t,
  at,
  out,
  text,
}: {
  t: MotionValue<number>;
  at: number;
  out: number;
  text: string;
}) {
  const opacity = useTransform(t, [at + 1, at + 6, out - 3, out], [0, 1, 1, 0]);
  const y = useTransform(t, [at + 1, at + 6, out - 3, out], [12, 0, 0, -8]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-0 flex items-center gap-2.5 rounded-2xl bg-white shadow-sm px-3.5 py-3"
    >
      <div
        className="w-7 h-7 rounded-full grid place-items-center shrink-0"
        style={{ backgroundColor: PRIMARY_SOFT }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
      </div>
      <div className="text-[12.5px] font-extrabold" style={{ color: INK }}>
        {text}
      </div>
    </motion.div>
  );
}

/**
 * 4) 시작하기 — 종이비행기 Lottie 루프.
 * b2b_mobile 이 쓰는 `paper-plane.json` 을 그대로 가져와 모바일과 같은 움직임을 쓴다.
 * 손으로 만든 SVG 궤적 버전은 폐기했다 — 같은 인상이 안 났다.
 */
export function StartVignette({ active }: { active: boolean }) {
  return (
    <Frame>
      <LottiePlayer path="/lottie/paper-plane.json" active={active} className="w-64 h-64" />
    </Frame>
  );
}
