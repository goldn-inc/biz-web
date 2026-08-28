"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, type PanInfo } from "motion/react";
import { useReducedMotionSafe } from "@/lib/reduced-motion";
import { FloatingBackdrop } from "@/components/FloatingBackdrop";
import { DUR, EASE, SPRING } from "@/lib/motion";
import {
  ReservationVignette,
  IconLightupVignette,
  TimelineVignette,
  StartVignette,
} from "@/components/onboarding/Vignettes";

type Slide = {
  Vignette: (props: { active: boolean }) => React.ReactNode;
  step: string;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    step: "01 / 04",
    title: "예약을 한눈에",
    desc: "고객이 앱에서 예약한 매장 방문 일정이 실시간으로 이 화면에 표시됩니다. 오늘 올 손님을 미리 준비하세요.",
    Vignette: ReservationVignette,
  },
  {
    step: "02 / 04",
    title: "거래를 바로 처리",
    desc: "현장 방문 고객의 감정과 매입도 별도 장부 없이 이 화면에서 바로 기록하고 관리합니다.",
    Vignette: IconLightupVignette,
  },
  {
    step: "03 / 04",
    title: "쿠폰과 도매 주문까지",
    desc: "쿠폰 적용은 물론, 등급별 도매 상품 주문(도매·도도매 계정 한정)도 한곳에서 처리합니다.",
    Vignette: TimelineVignette,
  },
  {
    step: "04 / 04",
    title: "시작하기",
    desc: "별도 회원가입은 필요 없습니다. 발급받은 계정으로 바로 로그인해 시작하세요.",
    Vignette: StartVignette,
  },
];

const N = SLIDES.length;

/** 손가락을 이만큼 끌었거나 이 속도를 넘기면 다음 장으로 넘긴다. b2b_mobile 페이징과 같은 기준. */
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 400;

/** 슬라이드 안 요소들이 순차로 떠오르는 결. 활성 슬라이드에서만 재생된다. */
const SLIDE_CONTENT = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const POP = {
  hidden: { opacity: 0, scale: 0.55 },
  shown: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: EASE.overshoot } },
};

const RISE = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR.section, ease: EASE.out } },
};

export default function OnboardingPage() {
  const router = useRouter();
  const reduced = Boolean(useReducedMotionSafe());
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const isLast = index === N - 1;

  const go = useCallback((n: number) => {
    setIndex(Math.max(0, Math.min(N - 1, n)));
  }, []);

  const goLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  /** 끌어놓은 거리와 속도로 넘길지 되돌릴지 정한다. 어느 쪽도 아니면 제자리로 튕겨 돌아온다. */
  const onDragEnd = (_event: unknown, info: PanInfo) => {
    const passed =
      Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_VELOCITY;
    if (!passed) return;
    go(info.offset.x < 0 ? index + 1 : index - 1);
  };

  return (
    <div
      id="onboarding"
      className="relative isolate min-h-screen flex flex-col select-none overflow-hidden"
    >
      <FloatingBackdrop />

      <header className="flex items-center justify-between px-5 py-4 md:px-9 md:py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center text-white text-sm font-extrabold">
            金
          </div>
          <div className="text-base font-bold tracking-tight">
            금은마켓 <span className="text-primary">BIZ</span>
          </div>
        </div>
        <button
          onClick={goLogin}
          className="text-sm font-semibold text-caption hover:text-body hover:bg-slate-100 px-3 py-2.5 rounded-xl"
          style={{ visibility: isLast ? "hidden" : "visible" }}
        >
          건너뛰기
        </button>
      </header>

      <main className="relative flex-1 flex flex-col overflow-hidden">
        {/* 가로 트랙 — 손가락을 따라 밀리고, 놓으면 가까운 장으로 붙는다 */}
        <motion.div
          ref={trackRef}
          className="flex flex-1 cursor-grab active:cursor-grabbing"
          drag={reduced ? false : "x"}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={onDragEnd}
          animate={{ x: `-${index * 100}%` }}
          transition={SPRING.settle}
        >
          {SLIDES.map((slide, k) => (
            <motion.div
              key={slide.title}
              className="w-full shrink-0 flex flex-col items-center justify-center text-center px-8 md:px-24 gap-5 md:gap-7"
              variants={SLIDE_CONTENT}
              initial="hidden"
              animate={k === index ? "shown" : "hidden"}
            >
              <motion.div variants={POP} className="w-full flex justify-center">
                <slide.Vignette active={k === index} />
              </motion.div>
              <motion.div
                variants={RISE}
                className="text-xs md:text-sm font-bold tracking-widest text-primary"
              >
                {slide.step}
              </motion.div>
              <motion.h2
                variants={RISE}
                className="text-2xl md:text-4xl font-extrabold tracking-tight leading-snug m-0"
              >
                {slide.title}
              </motion.h2>
              <motion.p
                variants={RISE}
                className="text-[15px] md:text-lg leading-relaxed text-body max-w-sm md:max-w-xl m-0"
              >
                {slide.desc}
              </motion.p>
            </motion.div>
          ))}
        </motion.div>

        <button
          aria-label="이전 슬라이드"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="hidden md:grid absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-line shadow-md place-items-center text-body hover:text-primary hover:border-primary-light transition disabled:opacity-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          aria-label="다음 슬라이드"
          onClick={() => go(index + 1)}
          disabled={isLast}
          className="hidden md:grid absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-line shadow-md place-items-center text-body hover:text-primary hover:border-primary-light transition disabled:opacity-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </main>

      <footer className="flex flex-col items-center gap-4 px-8 pb-8 md:pb-10">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((slide, k) => (
            <button key={slide.title} aria-label={`${k + 1}번 슬라이드`} onClick={() => go(k)} className="py-2 px-0.5">
              <motion.span
                className="block h-2 rounded-full bg-line"
                animate={{ width: k === index ? 24 : 8, backgroundColor: k === index ? "#ea580c" : "#e2e8f0" }}
                transition={{ duration: DUR.enter, ease: EASE.out }}
              />
            </button>
          ))}
        </div>

        {/* 진행 버튼은 항상 자리를 지킨다 — 마지막 장에서만 나타나면 어디까지 왔는지가 흐려진다 */}
        <motion.button
          onClick={() => (isLast ? goLogin() : go(index + 1))}
          whileTap={{ scale: 0.97 }}
          animate={{ backgroundColor: isLast ? "#ea580c" : "#111111" }}
          transition={{ duration: DUR.enter, ease: EASE.out }}
          className="h-14 w-full max-w-sm rounded-2xl text-white text-base font-bold shadow-lg shadow-primary/20"
        >
          {isLast ? "로그인하기" : "다음"}
        </motion.button>

        <div className="text-xs md:text-sm text-caption text-center">
          {isLast
            ? "관리자에게 발급받은 아이디와 임시 비밀번호로 로그인하세요"
            : "좌우로 밀거나 점을 눌러 이동"}
        </div>
      </footer>
    </div>
  );
}
