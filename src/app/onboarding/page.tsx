"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const AUTOPLAY_MS = 4500;

type Slide = {
  icon: React.ReactNode;
  step: string;
  title: string;
  desc: string;
};

const SLIDES: Slide[] = [
  {
    step: "01 / 04",
    title: "예약을 한눈에",
    desc: "고객이 앱에서 예약한 매장 방문 일정이 실시간으로 이 화면에 표시됩니다. 오늘 올 손님을 미리 준비하세요.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-1/2 h-1/2">
        <rect x="3" y="4" width="18" height="18" rx="3" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    ),
  },
  {
    step: "02 / 04",
    title: "거래를 바로 처리",
    desc: "현장 방문 고객의 감정과 매입도 별도 장부 없이 이 화면에서 바로 기록하고 관리합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-1/2 h-1/2">
        <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
        <path d="M7 21h10" />
        <path d="M12 3v18" />
        <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
      </svg>
    ),
  },
  {
    step: "03 / 04",
    title: "쿠폰과 도매 주문까지",
    desc: "쿠폰 적용은 물론, 등급별 도매 상품 주문(도매·도도매 계정 한정)도 한곳에서 처리합니다.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-1/2 h-1/2">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </svg>
    ),
  },
  {
    step: "04 / 04",
    title: "시작하기",
    desc: "별도 회원가입은 필요 없습니다. 발급받은 계정으로 바로 로그인해 시작하세요.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-1/2 h-1/2">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
  },
];

const N = SLIDES.length;

export default function OnboardingPage() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % N);
    }, AUTOPLAY_MS);
  }, []);

  useEffect(() => {
    reset();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reset]);

  const go = useCallback(
    (n: number) => {
      setIndex(((n % N) + N) % N);
      reset();
    },
    [reset],
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? index + 1 : index - 1);
  };

  return (
    <div
      id="onboarding"
      className="min-h-screen flex flex-col select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
          onClick={() => go(N - 1)}
          className="text-sm font-semibold text-caption hover:text-body hover:bg-slate-100 px-3 py-2.5 rounded-xl"
          style={{ visibility: index === N - 1 ? "hidden" : "visible" }}
        >
          건너뛰기
        </button>
      </header>

      <main className="relative flex-1 flex flex-col">
        {SLIDES.map((slide, k) => (
          <div
            key={slide.title}
            className={`slide ${k === index ? "active" : ""} flex-1 flex-col items-center justify-center text-center px-8 md:px-24 gap-5 md:gap-7`}
          >
            <div className="anim-pop w-24 h-24 md:w-36 md:h-36 rounded-3xl bg-orange-50 border border-orange-100 shadow-xl shadow-primary/10 grid place-items-center">
              {slide.icon}
            </div>
            <div className="anim-up d1 text-xs md:text-sm font-bold tracking-widest text-primary">{slide.step}</div>
            <h2 className="anim-up d2 text-2xl md:text-4xl font-extrabold tracking-tight leading-snug m-0">
              {slide.title}
            </h2>
            <p className="anim-up d3 text-[15px] md:text-lg leading-relaxed text-body max-w-sm md:max-w-xl m-0">
              {slide.desc}
            </p>
            {k === N - 1 && (
              <div className="anim-up d4 flex flex-col items-center gap-3.5 mt-1">
                <button
                  onClick={() => router.push("/login")}
                  className="h-14 px-12 rounded-2xl bg-primary hover:bg-primary-light active:scale-[.98] text-white text-base font-bold shadow-lg shadow-primary/30 transition"
                >
                  로그인하기
                </button>
                <div className="text-xs md:text-sm text-caption">관리자에게 발급받은 아이디와 임시 비밀번호로 로그인하세요</div>
              </div>
            )}
          </div>
        ))}

        <button
          aria-label="이전 슬라이드"
          onClick={() => go(index - 1)}
          className="hidden md:grid absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-line shadow-md place-items-center text-body hover:text-primary hover:border-primary-light transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          aria-label="다음 슬라이드"
          onClick={() => go(index + 1)}
          className="hidden md:grid absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white border border-line shadow-md place-items-center text-body hover:text-primary hover:border-primary-light transition"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </main>

      <footer className="flex flex-col items-center gap-3 pb-8 md:pb-10">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((slide, k) => (
            <button key={slide.title} aria-label={`${k + 1}번 슬라이드`} onClick={() => go(k)} className="py-2 px-0.5">
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${k === index ? "w-6 bg-primary" : "w-2 bg-line"}`}
              />
            </button>
          ))}
        </div>
        <div className="text-xs text-caption">좌우로 스와이프하거나 점을 눌러 이동</div>
      </footer>
    </div>
  );
}
