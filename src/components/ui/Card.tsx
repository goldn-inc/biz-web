"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { FEEDBACK } from "@/lib/motion";

type CardProps = HTMLMotionProps<"div"> & {
  /** 클릭·이동이 걸린 카드에만 켠다. 정보 표시용 카드가 마우스에 반응하면 오히려 산만하다. */
  interactive?: boolean;
};

export function Card({ className = "", interactive = false, ...props }: CardProps) {
  return (
    <motion.div
      whileHover={interactive ? FEEDBACK.hover : undefined}
      whileTap={interactive ? FEEDBACK.tap : undefined}
      className={`bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 ${className}`}
      {...props}
    />
  );
}
