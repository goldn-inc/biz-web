"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionSafe } from "@/lib/reduced-motion";
import type { AnimationItem } from "lottie-web";

/**
 * Lottie 재생기 — 온보딩 비네트 전용.
 *
 * 플레이어는 **동적 import** 한다. lottie-web 은 정적으로 넣으면 온보딩을 안 보는
 * 사용자의 번들에도 실린다. 온보딩은 계정당 사실상 1회 화면이라 그럴 이유가 없다.
 * `lottie_light` 를 쓴다 — 이 파일은 expression·이미지 애셋이 없어 전체 빌드가 필요 없다.
 *
 * JSON 은 번들이 아니라 `public/` 에서 경로로 불러온다(캐시되고 JS 크기에 안 잡힌다).
 */
export function LottiePlayer({
  path,
  active,
  className,
}: {
  path: string;
  active: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      const lottie = (await import("lottie-web/build/player/lottie_light")).default;
      if (disposed) return;
      animRef.current = lottie.loadAnimation({
        container: host,
        renderer: "svg",
        loop: true,
        autoplay: false,
        path,
      });
    })();

    return () => {
      disposed = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [path]);

  // 보이는 슬라이드에서만 재생한다 — 뒤에 선 슬라이드가 계속 돌면 헛되이 프레임을 태운다.
  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    if (reduce) {
      anim.goToAndStop(anim.totalFrames - 1, true);
      return;
    }
    if (active) {
      anim.goToAndPlay(0, true);
    } else {
      anim.stop();
    }
  }, [active, reduce]);

  return <div ref={hostRef} className={className} aria-hidden />;
}
