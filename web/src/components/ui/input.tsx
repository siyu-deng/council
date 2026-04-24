import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex w-full rounded-md border border-amber-dim/40 bg-ink/60 px-4 py-3 text-base text-parchment placeholder:text-parchment/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-glow focus-visible:border-amber-glow/60 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
