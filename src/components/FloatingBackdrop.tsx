"use client";

import { motion, useReducedMotion } from "motion/react";

/** 오브 1개 정의 — 위치는 %(뷰포트 기준), 크기 px, 표류 폭 px. */
type OrbDef = {
  size: number;
  left: string;
  top: string;
  color: string;
  opacity: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
};

const ORBS: OrbDef[] = [
  { size: 340, left: "-6%", top: "-8%", color: "#f59e0b", opacity: 0.14, dx: 36, dy: 28, duration: 11, delay: 0 },
  { size: 260, left: "78%", top: "6%", color: "#ea580c", opacity: 0.12, dx: -30, dy: 34, duration: 13, delay: 1.2 },
  { size: 220, left: "8%", top: "68%", color: "#fbbf24", opacity: 0.13, dx: 28, dy: -26, duration: 10, delay: 0.6 },
  { size: 300, left: "70%", top: "72%", color: "#f97316", opacity: 0.1, dx: -34, dy: -30, duration: 14, delay: 2 },
  { size: 140, left: "44%", top: "34%", color: "#fde68a", opacity: 0.18, dx: 22, dy: 20, duration: 8, delay: 0.3 },
];

/** 위로 떠오르며 반짝이는 장식 글리프. */
const SPARKLES: { glyph: string; left: string; top: string; size: number; duration: number; delay: number }[] = [
  { glyph: "金", left: "12%", top: "24%", size: 22, duration: 7, delay: 0 },
  { glyph: "✦", left: "84%", top: "40%", size: 16, duration: 6, delay: 1.5 },
  { glyph: "銀", left: "72%", top: "18%", size: 18, duration: 8, delay: 0.8 },
  { glyph: "✦", left: "22%", top: "78%", size: 14, duration: 6.5, delay: 2.2 },
  { glyph: "金", left: "58%", top: "84%", size: 20, duration: 7.5, delay: 3 },
];

/**
 * 온보딩·로그인 공용 배경 장식 — 떠다니는 골드 오브(blur) + 반짝이 글리프.
 * 부모에 `relative isolate overflow-hidden` 필요. reduced-motion이면 정적 렌더.
 */
export function FloatingBackdrop() {
  const reduced = Boolean(useReducedMotion());

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            width: o.size,
            height: o.size,
            left: o.left,
            top: o.top,
            background: o.color,
            opacity: o.opacity,
          }}
          animate={
            reduced
              ? undefined
              : { x: [0, o.dx, 0], y: [0, o.dy, 0], scale: [1, 1.08, 1] }
          }
          transition={{ duration: o.duration, delay: o.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {SPARKLES.map((s, i) => (
        <motion.span
          key={i}
          className="absolute select-none font-bold text-primary"
          style={{ left: s.left, top: s.top, fontSize: s.size, opacity: 0.14 }}
          animate={reduced ? undefined : { y: [0, -18, 0], opacity: [0.08, 0.22, 0.08], rotate: [0, 8, 0] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          {s.glyph}
        </motion.span>
      ))}
    </div>
  );
}
