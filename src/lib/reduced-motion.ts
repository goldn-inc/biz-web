"use client";

import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";

/**
 * 마운트 여부. 서버 스냅샷이 false 라 **첫 클라이언트 렌더가 서버와 같아진다.**
 * effect 안에서 setState 를 부르는 흔한 방식 대신 이걸 쓴다 — 그쪽은 lint
 * (react-hooks/set-state-in-effect)가 막고, 렌더를 한 번 더 돌리는 것도 같다.
 */
const subscribeToNothing = () => () => {};

/**
 * 하이드레이션에 안전한 「동작 줄이기」 값.
 *
 * `useReducedMotion()` 은 서버에서 항상 false 로 나오고 클라이언트에서는 첫 렌더부터
 * 실제 설정을 읽는다. 그 값으로 렌더 결과를 가르면 감쇠 모션을 켠 사용자에게서
 * 하이드레이션이 어긋나고, React 는 **어긋난 속성을 고쳐 주지 않는다**
 * ("This won't be patched up"). 그러면 오히려 그 사용자 화면에 서버가 그린
 * 「안 줄인」 애니메이션이 그대로 남는다 — 줄이려던 것과 정반대다.
 *
 * 그래서 마운트 전에는 서버와 같은 값(false)을 쓰고 마운트 직후 실제 값으로 넘어간다.
 * 한 프레임 동안 애니메이션이 도는 것은 감수한다 — 속성이 영영 어긋난 채 남는 것보다 낫다.
 */
export function useReducedMotionSafe(): boolean {
  const reduced = useReducedMotion();
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  return mounted && Boolean(reduced);
}
