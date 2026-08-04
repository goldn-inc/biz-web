"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { ENTER_CAPPED, FEEDBACK } from "@/lib/motion";

type ListRowProps = Omit<HTMLMotionProps<"div">, "custom"> & {
  /** 행을 눌러 상세로 들어가는 목록에만 켠다. 읽기 전용 표에서는 끈다. */
  interactive?: boolean;
  /**
   * 목록 안 순서. 넘기면 순차 진입이 붙는다(지연 상한 포함).
   * 생략하면 진입 애니메이션 없이 그대로 그려진다 — 단건 표시용.
   */
  index?: number;
};

export function ListRow({ className = "", interactive = false, index, ...props }: ListRowProps) {
  return (
    <motion.div
      variants={index === undefined ? undefined : ENTER_CAPPED}
      custom={index}
      initial={index === undefined ? undefined : "hidden"}
      animate={index === undefined ? undefined : "shown"}
      whileHover={interactive ? FEEDBACK.hover : undefined}
      whileTap={interactive ? FEEDBACK.tap : undefined}
      className={`flex items-center gap-4 flex-wrap px-4 md:px-5 py-3.5 border-t border-slate-100 ${className}`}
      {...props}
    />
  );
}
