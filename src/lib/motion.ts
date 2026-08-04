import type { TargetAndTransition, Transition, Variants } from "motion/react";

/**
 * biz-web 모션 토큰.
 *
 * 지금까지 모션 값이 세 군데에 흩어져 있었다 — PageWipe 의 하드코딩 이징,
 * globals.css 의 `.page-stagger`·온보딩 keyframe, 그리고 컴포넌트별 즉흥값.
 * 값을 여기로 모아 화면들이 같은 결을 참조하게 한다.
 *
 * 성능 규약: 여기 정의된 프리셋은 transform(x·y·scale)과 opacity 만 건드린다.
 * width·height·top 처럼 레이아웃을 다시 계산시키는 속성은 넣지 않는다.
 */

/** 이징 — 기존 구현에서 쓰던 값에 이름을 붙인 것. 새 값을 만들지 않았다. */
export const EASE = {
  /** 진입·정착. `.page-stagger` 와 온보딩 `anim-up` 이 쓰던 값 */
  out: [0.16, 1, 0.3, 1],
  /** 화면을 덮고 걷는 큰 전환. PageWipe 커튼이 쓰던 expo in-out */
  inOut: [0.83, 0, 0.17, 1],
  /** 살짝 튀는 강조. 온보딩 `anim-pop` 이 쓰던 back-out */
  overshoot: [0.34, 1.56, 0.64, 1],
} as const;

/** 지속시간(초). 이름은 용도로 짓는다 — 숫자를 화면에서 직접 쓰지 않기 위함. */
export const DUR = {
  /** 눌림·호버 같은 즉각 피드백 */
  feedback: 0.14,
  /** 카드·행 진입 */
  enter: 0.32,
  /** 페이지 섹션 촤라락(현행 `.page-stagger` 와 동일) */
  section: 0.5,
  /** 커튼 전환 */
  curtain: 0.42,
} as const;

/** 스태거 간격(초)과 상한. 상한이 없으면 긴 목록의 마지막 행이 몇 초 뒤에 뜬다. */
export const STAGGER = {
  tight: 0.03,
  base: 0.06,
  loose: 0.08,
  /** 이 인덱스를 넘는 항목은 지연을 더 늘리지 않는다 */
  maxIndex: 8,
} as const;

/** 스프링 프리셋 — 오버슈트가 필요한 곳에만 쓴다. */
export const SPRING = {
  /** 절제된 정착. 거의 튀지 않음 */
  settle: { type: "spring", stiffness: 420, damping: 34 },
  /** 눈에 보이는 탄성 */
  bouncy: { type: "spring", stiffness: 380, damping: 22 },
} as const satisfies Record<string, Transition>;

/** 인덱스가 커져도 지연이 무한정 늘지 않도록 상한을 건 스태거 지연(초). */
export function staggerDelay(index: number, gap: number = STAGGER.base): number {
  return Math.min(index, STAGGER.maxIndex) * gap;
}

export type MotionIntensity = "subtle" | "signature" | "expressive";

export type IntensityPreset = {
  label: string;
  /** 이 결이 어떤 화면에 맞는지 — PoC 화면에서 그대로 보여준다 */
  summary: string;
  container: Variants;
  item: Variants;
  hover: TargetAndTransition;
  tap: TargetAndTransition;
};

/**
 * 강도 프리셋 3종. 같은 화면에 번갈아 적용해 결을 고르기 위한 것이고,
 * 확정되면 하나만 남기고 나머지는 지운다.
 */
export const INTENSITY: Record<MotionIntensity, IntensityPreset> = {
  subtle: {
    label: "절제",
    summary:
      "정보 밀도가 높은 업무 화면 기준. 이동 6px·투명도 위주라 눈이 덜 피로하고, 하루 종일 보는 화면에 맞다. 대신 '움직인다'는 인상은 약하다.",
    container: {
      hidden: {},
      shown: { transition: { staggerChildren: STAGGER.tight } },
    },
    item: {
      hidden: { opacity: 0, y: 6 },
      shown: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE.out } },
    },
    hover: { y: -1, transition: { duration: DUR.feedback, ease: EASE.out } },
    tap: { scale: 0.99, transition: { duration: DUR.feedback } },
  },
  signature: {
    label: "현재 결 확장",
    summary:
      "지금 biz-web 이 이미 쓰는 값(이동 14px·0.5s·expo out)을 카드·목록 행·버튼까지 넓힌 것. 커튼 전환과 본문 촤라락이 같은 리듬으로 이어져 화면이 하나로 읽힌다.",
    container: {
      hidden: {},
      shown: { transition: { staggerChildren: STAGGER.base } },
    },
    item: {
      hidden: { opacity: 0, y: 14 },
      shown: { opacity: 1, y: 0, transition: { duration: DUR.section, ease: EASE.out } },
    },
    hover: { y: -2, transition: { duration: DUR.feedback, ease: EASE.out } },
    tap: { scale: 0.97, transition: { duration: DUR.feedback } },
  },
  expressive: {
    label: "과감",
    summary:
      "스프링으로 튕기며 자리를 잡고 크기까지 함께 변한다. 손맛이 가장 강하지만, 표가 빽빽한 화면에서는 산만해질 수 있다.",
    container: {
      hidden: {},
      shown: { transition: { staggerChildren: STAGGER.loose } },
    },
    item: {
      hidden: { opacity: 0, y: 24, scale: 0.96 },
      shown: { opacity: 1, y: 0, scale: 1, transition: SPRING.bouncy },
    },
    hover: { y: -4, scale: 1.01, transition: SPRING.settle },
    tap: { scale: 0.94, transition: { duration: DUR.feedback } },
  },
};
