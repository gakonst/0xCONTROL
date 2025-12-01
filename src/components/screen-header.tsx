import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ScreenHeaderProps = {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

/**
 * Minimal, reusable top-of-screen header to keep typography and spacing consistent
 * across full-screen and panel views.
 */
export function ScreenHeader({ title, leading, trailing, className }: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 pt-6 text-base font-semibold uppercase tracking-[0.12rem] text-foreground md:px-5 md:text-lg",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {leading}
        <span className="leading-none">{title}</span>
      </div>
      <div className="flex items-center gap-2">{trailing}</div>
    </header>
  );
}
