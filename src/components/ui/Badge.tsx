import { ReactNode } from "react";

export type BadgeTone = "amber" | "green" | "red" | "violet" | "blue" | "slate" | "primary";

const TONE_CLASS: Record<BadgeTone, string> = {
  amber: "text-amber-700 bg-amber-50 border-amber-200",
  green: "text-green-700 bg-green-50 border-green-200",
  red: "text-red-700 bg-red-50 border-red-200",
  violet: "text-violet-700 bg-violet-50 border-violet-200",
  blue: "text-blue-700 bg-blue-50 border-blue-200",
  slate: "text-slate-600 bg-slate-50 border-slate-200",
  primary: "text-primary bg-orange-50 border-orange-200",
};

type BadgeProps = {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
};

/**
 * 상태 뱃지 — tone 매핑: amber(대기/경고) green(성공/완료) red(에러/노쇼)
 * violet(대기목록/재방문) blue(정보/특금법/확인됨) slate(중립/대기중) primary(등급/강조)
 */
export function Badge({ tone, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`text-xs font-bold rounded-full px-3 py-1 border ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
