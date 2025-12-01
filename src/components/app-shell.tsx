import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function AppShell({ children, footer, className }: AppShellProps) {
  return (
    <div className={cn("flex h-screen flex-col overflow-hidden bg-[#010308] text-foreground", className)}>
      <div className="flex flex-1 flex-col overflow-hidden pt-4">
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto touch-pan-y overscroll-y-contain">
          {children}
        </div>
      </div>
      {footer}
    </div>
  );
}
