"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { FEEDBACK } from "@/lib/motion";

type FilterChipProps = HTMLMotionProps<"button"> & {
  active?: boolean;
};

/** 눌림만 준다 — 필터 줄은 칩이 여럿 붙어 있어 호버로 들썩이면 줄 자체가 흔들려 보인다. */
export function FilterChip({ active = false, className = "", ...props }: FilterChipProps) {
  return (
    <motion.button
      whileTap={FEEDBACK.tap}
      className={`h-9 px-3.5 rounded-full border text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-white font-bold"
          : "border-line bg-white text-body hover:border-primary-light"
      } ${className}`}
      {...props}
    />
  );
}
