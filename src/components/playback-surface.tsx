import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type PlaybackSurfaceProps = {
  progress: number;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  overlay?: ReactNode;
  background?: "solid" | "transparent";
  paddingClassName?: string;
} & HTMLAttributes<HTMLDivElement>;

export function PlaybackSurface({
  progress,
  children,
  className,
  contentClassName,
  overlay,
  background = "solid",
  paddingClassName = "px-4 pt-3 pb-3",
  ...rest
}: PlaybackSurfaceProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);

  const surfaceClasses = cn(
    "relative overflow-hidden text-white",
    paddingClassName,
    background === "solid"
      ? "bg-[rgba(2,2,6,0.98)] shadow-[0_-15px_60px_rgba(0,0,0,0.65)]"
      : "",
    className,
  );

  return (
    <div className={surfaceClasses} {...rest}>
      {overlay && <div className="pointer-events-none absolute inset-0 z-0">{overlay}</div>}

      <div className={cn("relative z-10 flex items-center gap-3", contentClassName)}>
        {children}
      </div>

      <div className="relative z-10 mt-2 h-[3px] w-full bg-white/15">
        <span
          className="block h-full bg-white"
          style={{ width: `${clamped * 100}%` }}
        />
      </div>

      {background === "solid" && (
        <span className="pointer-events-none absolute inset-0 z-5 bg-gradient-to-r from-white/0 via-white/0 to-white/10" />
      )}
    </div>
  );
}
