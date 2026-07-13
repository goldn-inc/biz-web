import { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ error = false, className = "", ...props }: InputProps) {
  return (
    <input
      className={`h-12 px-4 rounded-xl bg-white text-sm outline-none focus:border-primary ${
        error ? "border-2 border-red-300" : "border border-line"
      } ${className}`}
      {...props}
    />
  );
}
