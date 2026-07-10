import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/primitives";

export const ActionSheet = Dialog.Root;
export const ActionSheetTrigger = Dialog.Trigger;
export const ActionSheetClose = Dialog.Close;

export function ActionSheetContent({
  title,
  description,
  children,
  className,
  ...props
}: ComponentProps<typeof Dialog.Content> & {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in" />
      <Dialog.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-[71] mx-auto max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] border border-b-0 border-[hsl(var(--stroke-strong))] bg-[hsl(var(--surface-elevated))] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-[hsl(var(--text))] shadow-[0_-24px_80px_rgba(0,0,0,0.5)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-[hsl(var(--stroke-strong))]" />
        <div className="flex items-start gap-3 px-1 pb-3 pt-1">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate text-sm font-semibold uppercase tracking-[0.08rem]">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="mt-0.5 text-sm text-[hsl(var(--text-muted))]">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <IconButton label="Close" className="-mr-2 -mt-1">
              <X className="h-5 w-5" />
            </IconButton>
          </Dialog.Close>
        </div>
        <div className="grid gap-1">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export const SheetAction = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & {
    icon: ReactNode;
    label: string;
    detail?: string;
    destructive?: boolean;
  }
>(function SheetAction(
  { icon, label, detail, destructive = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left transition hover:bg-[hsl(var(--surface-hover))] active:bg-[hsl(var(--surface-hover))]",
        destructive ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]",
        className,
      )}
      {...props}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-xs text-[hsl(var(--text-muted))]">
            {detail}
          </span>
        )}
      </span>
    </button>
  );
});
