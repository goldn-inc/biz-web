import type { TargetAndTransition, Transition, Variants } from "motion/react";

/**
 * biz-web 모션 토큰.
 *
 * 값이 컴포넌트마다 즉흥적으로 흩어지지 않도록 여기 모아 두고 화면들이 같은 결을 참조하게 한다.
 * 페이지 이동 전환은 없앴으므로(2026-08-12) 여기 남은 값은 화면 안에서 도는 것들뿐이다.
 *
 * 성능 규약: 여기 정의된 프리셋은 transform(x·y·scale)과 opacity 만 건드린다.
 * width·height·top 처럼 레이아웃을 다시 계산시키는 속성은 넣지 않는다.
 */

/** 이징 — 기존 구현에서 쓰던 값에 이름을 붙인 것. 새 값을 만들지 않았다. */
export const EASE = {
  /** 진입·정착 */
  out: [0.16, 1, 0.3, 1],
  /** 살짝 튀는 강조. 온보딩 `anim-pop` 이 쓰던 back-out */
  overshoot: [0.34, 1.56, 0.64, 1],
} as const;

/** 지속시간(초). 이름은 용도로 짓는다 — 숫자를 화면에서 직접 쓰지 않기 위함. */
export const DUR = {
  /** 눌림·호버 같은 즉각 피드백 */
  feedback: 0.14,
  /** 카드·행 진입 */
  enter: 0.32,
  /** 목록·섹션이 순차로 떠오르는 진입 */
  section: 0.5,
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

/**
 * 진입 — 목록·그리드가 순차로 떠오르는 결.
 *
 * 부모에 `container`, 각 항목에 `item` 을 준다.
 *
 * 주의 — 항목이 많은 목록은 `staggerChildren` 만으로는 마지막 행이 한참 뒤에 뜬다.
 * 그런 곳은 `custom` + `staggerDelay()` 로 지연 상한을 걸어야 한다.
 */
export const ENTER = {
  container: {
    hidden: {},
    shown: { transition: { staggerChildren: STAGGER.base } },
  },
  item: {
    hidden: { opacity: 0, y: 14 },
    shown: { opacity: 1, y: 0, transition: { duration: DUR.section, ease: EASE.out } },
  },
} satisfies Record<"container" | "item", Variants>;

/**
 * 진입(지연 상한판) — 행 수를 예측할 수 없는 목록용.
 * `custom={index}` 를 함께 넘긴다. `STAGGER.maxIndex` 를 넘는 행은 지연이 더 늘지 않는다.
 */
export const ENTER_CAPPED = {
  hidden: { opacity: 0, y: 14 },
  shown: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR.section, ease: EASE.out, delay: staggerDelay(index) },
  }),
} satisfies Variants;

/** 호버·눌림 피드백. 색 전환은 CSS 가 맡고 여기서는 위치·크기만 건드린다. */
export const FEEDBACK = {
  hover: { y: -2, transition: { duration: DUR.feedback, ease: EASE.out } },
  tap: { scale: 0.97, transition: { duration: DUR.feedback } },
} satisfies Record<"hover" | "tap", TargetAndTransition>;
