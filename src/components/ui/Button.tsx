"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { FEEDBACK } from "@/lib/motion";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: ButtonVariant;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary hover:bg-primary-light text-white shadow-lg shadow-primary/20 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none",
  secondary:
    "bg-white border border-line hover:border-primary-light hover:text-primary text-body disabled:text-slate-300 disabled:hover:border-line disabled:hover:text-slate-300",
};

/**
 * 색 전환은 CSS `transition` 이 그대로 맡고, 위치·크기 피드백만 motion 이 맡는다.
 * 비활성 버튼은 눌러도 반응하지 않아야 하므로 `disabled` 일 때 제스처를 뗀다.
 * OS "동작 줄이기"는 루트 `MotionProvider` 가 일괄로 처리한다.
 */
export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <motion.button
      disabled={disabled}
      whileHover={disabled ? undefined : FEEDBACK.hover}
      whileTap={disabled ? undefined : FEEDBACK.tap}
      className={`h-12 px-5 rounded-2xl text-sm font-bold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
