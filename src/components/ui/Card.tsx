import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-white border border-line rounded-3xl shadow-sm p-5 md:p-6 ${className}`}
      {...props}
    />
  );
}
