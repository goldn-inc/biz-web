import { HTMLAttributes } from "react";

export function ListRow({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center gap-4 flex-wrap px-4 md:px-5 py-3.5 border-t border-slate-100 ${className}`}
      {...props}
    />
  );
}
