"use client";

import { MotionConfig } from "motion/react";
import { DUR, EASE } from "@/lib/motion";

/**
 * 앱 전역 모션 기본값.
 *
 * `reducedMotion="user"` 를 여기서 한 번 걸면 OS 의 "동작 줄이기" 설정을 모든 motion
 * 컴포넌트가 자동으로 따른다 — 컴포넌트마다 `useReducedMotion()` 을 부르지 않아도 되고,
 * 목록처럼 인스턴스가 많은 곳에서 미디어쿼리 리스너가 행 수만큼 생기는 것도 막는다.
 *
 * 기본 transition 도 토큰으로 고정해, 개별 컴포넌트가 값을 안 적었을 때
 * 제각각인 즉흥값 대신 같은 결로 떨어지게 한다.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DUR.enter, ease: EASE.out }}>
      {children}
    </MotionConfig>
  );
}
