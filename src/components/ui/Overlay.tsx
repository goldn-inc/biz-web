"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { DUR, EASE } from "@/lib/motion";

/**
 * 모달 공용 셸 — 배경 페이드 + 패널 진입/퇴장.
 *
 * 퇴장 애니메이션이 돌려면 호출부에서 `<AnimatePresence>` 로 감싸야 한다.
 * 감싸지 않으면 진입만 보이고 닫을 때는 즉시 사라진다(동작 자체는 정상).
 *
 * 이 컴포넌트들은 클릭 이후에만 마운트되므로 SSR 을 타지 않는다 —
 * `useIsDesktop` 이 첫 렌더에 false 로 시작해도 하이드레이션 불일치가 생기지 않는다.
 */

const BACKDROP = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};

const BACKDROP_TRANSITION = { duration: DUR.enter, ease: EASE.out };

/** lg 브레이크포인트(1024px) — 사이드 패널이 오른쪽 서랍인지 하단 시트인지를 가른다. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

type SidePanelProps = {
  onClose: () => void;
  /** 스크린리더용 이름 */
  label: string;
  /** 패널 자체의 클래스 — 호출부의 기존 스타일을 그대로 넘긴다 */
  className: string;
  /** 배경보다 위에 겹치는 다른 오버레이가 있으면 올린다 */
  z?: string;
  children: ReactNode;
};

/** 데스크톱은 오른쪽 서랍, 모바일은 하단 시트. 들어온 방향으로 되돌아 나간다. */
export function SidePanel({ onClose, label, className, z = "z-40", children }: SidePanelProps) {
  const isDesktop = useIsDesktop();
  const offscreen = isDesktop ? { x: "100%", y: 0 } : { x: 0, y: "100%" };

  return (
    <div className={`fixed inset-0 ${z} flex justify-end`}>
      <motion.div
        className="absolute inset-0 bg-slate-900/45"
        onClick={onClose}
        aria-hidden
        variants={BACKDROP}
        initial="hidden"
        animate="shown"
        exit="hidden"
        transition={BACKDROP_TRANSITION}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={className}
        initial={offscreen}
        animate={{ x: 0, y: 0 }}
        exit={offscreen}
        transition={{ duration: DUR.enter, ease: EASE.out }}
      >
        {children}
      </motion.div>
    </div>
  );
}

type DialogProps = {
  /**
   * 넘기면 배경 클릭으로 닫힌다. 파기성 확인창(alertdialog)에는 넘기지 않는 게 맞다 —
   * 실수로 배경을 눌러 창이 닫히면 사용자가 무엇을 선택했는지 모호해진다.
   */
  onClose?: () => void;
  role?: "dialog" | "alertdialog";
  label?: string;
  className: string;
  z?: string;
  children: ReactNode;
};

/** 화면 가운데 확인창. 살짝 작게 들어와 제자리에서 커지며 시선을 잡는다. */
export function Dialog({
  onClose,
  role = "dialog",
  label,
  className,
  z = "z-50",
  children,
}: DialogProps) {
  return (
    <motion.div
      className={`fixed inset-0 ${z} grid place-items-center p-5 bg-slate-900/45`}
      onClick={onClose}
      variants={BACKDROP}
      initial="hidden"
      animate="shown"
      exit="hidden"
      transition={BACKDROP_TRANSITION}
    >
      <motion.div
        role={role}
        aria-modal="true"
        aria-label={label}
        className={className}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: DUR.enter, ease: EASE.out }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

type ScrollDialogProps = {
  label: string;
  className: string;
  z?: string;
  children: ReactNode;
};

/**
 * 내용이 길어 스크롤되는 모달 — 세로 가운데가 아니라 위쪽에 붙는다.
 * 배경 클릭으로 닫지 않는다(작성 중인 폼이 실수로 날아가면 안 된다).
 */
export function ScrollDialog({ label, className, z = "z-40", children }: ScrollDialogProps) {
  return (
    <motion.div
      className={`fixed inset-0 ${z} overflow-y-auto bg-slate-900/45`}
      variants={BACKDROP}
      initial="hidden"
      animate="shown"
      exit="hidden"
      transition={BACKDROP_TRANSITION}
    >
      <div className="min-h-full p-4 md:p-8 grid place-items-start justify-center">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={className}
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          transition={{ duration: DUR.enter, ease: EASE.out }}
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
}
