"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DUR, EASE as TOKEN_EASE } from "@/lib/motion";

/**
 * 페이지 와이프 — 랜딩페이지식 풀스크린 주황 커튼 전환.
 *
 * 안무(choreography):
 *  1) 웜블랙 커튼이 먼저, 브랜드 주황 커튼이 70ms 뒤따라 화면을 덮는다(스태거 레이어).
 *  2) 이동 중에는 살짝 기울고(skew) 멈출 때 펴진다 — 속도감.
 *  3) 덮인 커튼 위에 목적지 메뉴명이 떠오른다.
 *  4) 라우팅 완료 후 주황이 먼저 빠지고 웜블랙이 뒤따라 걷히며(샌드위치 리빌)
 *     드러난 페이지는 1.03→1 로 살짝 정착(settle)한다.
 * 메뉴마다 덮는 방향이 다르다: 홈=왼쪽, 예약=위에서 내려옴, 거래=오른쪽,
 * 쿠폰=아래에서 올라옴, 카탈로그=왼쪽, 도매=중앙에서 촥 열림. reduced-motion이면 즉시 이동.
 */

type WipeDir = "left" | "right" | "top" | "bottom" | "center";
export type WipePhase = "idle" | "cover" | "hold" | "reveal";

const ROUTE_META: { prefix: string; dir: WipeDir; label: string }[] = [
  { prefix: "/dashboard", dir: "left", label: "홈" },
  { prefix: "/reservations", dir: "top", label: "예약" },
  { prefix: "/transactions", dir: "right", label: "거래" },
  { prefix: "/coupons", dir: "bottom", label: "쿠폰" },
  { prefix: "/catalog", dir: "left", label: "카탈로그 신청" },
  { prefix: "/wholesale", dir: "center", label: "도매 주문" },
  { prefix: "/store-info", dir: "bottom", label: "매장 정보" },
  { prefix: "/more", dir: "right", label: "더보기" },
];

function metaFor(href: string) {
  return ROUTE_META.find((r) => href.startsWith(r.prefix)) ?? { dir: "left" as WipeDir, label: "" };
}

/** 커튼 이징 — expo 계열 in-out. 값은 모션 토큰(`EASE.inOut`)이 원본이다. */
const CURTAIN_EASE = TOKEN_EASE.inOut;

/** 커튼 덮기/걷기 지속시간. 걷을 때가 살짝 길어야 밑이 드러나는 게 자연스럽다. */
const COVER_SEC = 0.3;
const REVEAL_SEC = DUR.curtain;

/** 레이어 스태거 — 웜블랙과 주황이 어긋나 움직여야 샌드위치로 읽힌다. */
const LAYER_LAG_SEC = 0.07;

/** 방향별 [오프스크린(진입 전), 정지, 반대편 관통] 트랜스폼. 이동 중 스큐 → 정지 시 펴짐. */
const T = {
  left: {
    hidden: { x: "-108%", y: 0, skewX: -8, skewY: 0, scaleX: 1, scaleY: 1 },
    shown: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
    exited: { x: "108%", y: 0, skewX: 8, skewY: 0, scaleX: 1, scaleY: 1 },
  },
  right: {
    hidden: { x: "108%", y: 0, skewX: 8, skewY: 0, scaleX: 1, scaleY: 1 },
    shown: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
    exited: { x: "-108%", y: 0, skewX: -8, skewY: 0, scaleX: 1, scaleY: 1 },
  },
  top: {
    hidden: { x: 0, y: "-108%", skewX: 0, skewY: -6, scaleX: 1, scaleY: 1 },
    shown: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
    exited: { x: 0, y: "108%", skewX: 0, skewY: 6, scaleX: 1, scaleY: 1 },
  },
  bottom: {
    hidden: { x: 0, y: "108%", skewX: 0, skewY: 6, scaleX: 1, scaleY: 1 },
    shown: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
    exited: { x: 0, y: "-108%", skewX: 0, skewY: -6, scaleX: 1, scaleY: 1 },
  },
  center: {
    hidden: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 0, scaleY: 1 },
    shown: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 },
    exited: { x: 0, y: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 0 },
  },
} satisfies Record<WipeDir, Record<"hidden" | "shown" | "exited", Record<string, number | string>>>;

type WipeState = { dir: WipeDir; phase: Exclude<WipePhase, "idle">; href: string; label: string } | null;

const WipeContext = createContext<{ navigate: (href: string) => void; phase: WipePhase }>({
  navigate: () => {},
  phase: "idle",
});

export function usePageWipe() {
  return useContext(WipeContext);
}

export function PageWipeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduced = Boolean(useReducedMotion());
  const [wipe, setWipe] = useState<WipeState>(null);

  // 전 메뉴 라우트 선워밍 — 커튼이 덮인 채 기다리는 시간(컴파일/로드)을 최소화
  useEffect(() => {
    const t = setTimeout(() => {
      for (const r of ROUTE_META) router.prefetch(r.prefix);
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  const navigate = useCallback(
    (href: string) => {
      if (pathname.startsWith(href)) return;
      if (reduced || wipe) {
        router.push(href);
        return;
      }
      const { dir, label } = metaFor(href);
      setWipe({ dir, phase: "cover", href, label });
    },
    [pathname, reduced, wipe, router],
  );

  // 덮인 상태(hold)에서 라우트가 실제로 바뀌면 걷기 시작.
  // dev 컴파일 지연 등으로 못 바뀌어도 2.5s 후엔 강제로 걷는다(화면 잠김 방지).
  useEffect(() => {
    if (wipe?.phase !== "hold") return;
    const toReveal = () => setWipe((w) => (w ? { ...w, phase: "reveal" } : w));
    if (pathname.startsWith(wipe.href)) {
      // 새 페이지가 한 프레임 그려진 뒤 걷어야 밑이 비어 보이지 않는다
      const t = setTimeout(toReveal, 90);
      return () => clearTimeout(t);
    }
    const t = setTimeout(toReveal, 2500);
    return () => clearTimeout(t);
  }, [wipe, pathname]);

  const covering = wipe?.phase === "cover";
  const revealing = wipe?.phase === "reveal";
  const t = wipe ? T[wipe.dir] : null;

  return (
    <WipeContext.Provider value={{ navigate, phase: wipe?.phase ?? "idle" }}>
      {children}
      <AnimatePresence>
        {wipe && t && (
          <div key="wipe" className="fixed inset-0 z-[80] overflow-hidden pointer-events-auto">
            {/* 레이어 1 — 웜블랙: 덮을 때 앞장, 걷힐 때 마지막(샌드위치 바깥면) */}
            <motion.div
              className="absolute -inset-[6%]"
              style={{ background: "#17120e", transformOrigin: "50% 50%" }}
              initial={t.hidden}
              animate={revealing ? t.exited : t.shown}
              transition={{
                duration: revealing ? REVEAL_SEC : COVER_SEC,
                delay: revealing ? LAYER_LAG_SEC + 0.01 : 0,
                ease: CURTAIN_EASE,
              }}
              onAnimationComplete={() => {
                if (revealing) setWipe(null);
              }}
            />
            {/* 레이어 2 — 브랜드 주황: 덮을 때 70ms 뒤따르고, 걷힐 때 먼저 빠진다 */}
            <motion.div
              className="absolute -inset-[6%]"
              style={{
                background: "linear-gradient(135deg, #fb923c 0%, #ea580c 55%, #c2410c 100%)",
                transformOrigin: "50% 50%",
              }}
              initial={t.hidden}
              animate={revealing ? t.exited : t.shown}
              transition={{
                duration: revealing ? REVEAL_SEC - 0.02 : COVER_SEC,
                delay: revealing ? 0 : LAYER_LAG_SEC,
                ease: CURTAIN_EASE,
              }}
              onAnimationComplete={() => {
                if (covering && wipe) {
                  router.push(wipe.href);
                  setWipe({ ...wipe, phase: "hold" });
                }
              }}
            />
            {/* 목적지 타이포 — 커튼 위에 떠오른다 */}
            <motion.div
              className="absolute inset-0 grid place-items-center select-none"
              initial={{ opacity: 0 }}
              animate={revealing ? { opacity: 0 } : { opacity: 1 }}
              transition={{ duration: revealing ? 0.16 : 0.3, delay: revealing ? 0 : 0.16 }}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm grid place-items-center text-white text-xl font-extrabold"
                  initial={{ y: 18, opacity: 0, scale: 0.8 }}
                  animate={revealing ? { opacity: 0 } : { y: 0, opacity: 1, scale: 1 }}
                  transition={{ duration: 0.38, delay: revealing ? 0 : 0.18, ease: TOKEN_EASE.out }}
                >
                  金
                </motion.div>
                <motion.div
                  className="text-white text-3xl md:text-4xl font-extrabold tracking-tight"
                  initial={{ y: 26, opacity: 0 }}
                  animate={revealing ? { opacity: 0 } : { y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: revealing ? 0 : 0.22, ease: TOKEN_EASE.out }}
                >
                  {wipe.label}
                </motion.div>
                <motion.div
                  className="text-white/60 text-[11px] font-bold tracking-[0.35em] uppercase"
                  initial={{ y: 14, opacity: 0 }}
                  animate={revealing ? { opacity: 0 } : { y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: revealing ? 0 : 0.28, ease: TOKEN_EASE.out }}
                >
                  GOLDSILVER BIZ
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </WipeContext.Provider>
  );
}
