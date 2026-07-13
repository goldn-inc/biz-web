import { ButtonHTMLAttributes } from "react";

type FilterChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function FilterChip({ active = false, className = "", ...props }: FilterChipProps) {
  return (
    <button
      className={`h-9 px-3.5 rounded-full border text-xs transition ${
        active
          ? "border-primary bg-primary text-white font-bold"
          : "border-line bg-white text-body hover:border-primary-light"
      } ${className}`}
      {...props}
    />
  );
}
