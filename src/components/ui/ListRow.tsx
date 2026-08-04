"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { INTENSITY } from "@/lib/motion";

type ListRowProps = HTMLMotionProps<"div"> & {
  /** 행을 눌러 상세로 들어가는 목록에만 켠다. 읽기 전용 표에서는 끈다. */
  interactive?: boolean;
};

const FEEDBACK = INTENSITY.signature;

export function ListRow({ className = "", interactive = false, ...props }: ListRowProps) {
  return (
    <motion.div
      whileHover={interactive ? FEEDBACK.hover : undefined}
      whileTap={interactive ? FEEDBACK.tap : undefined}
      className={`flex items-center gap-4 flex-wrap px-4 md:px-5 py-3.5 border-t border-slate-100 ${className}`}
      {...props}
    />
  );
}
