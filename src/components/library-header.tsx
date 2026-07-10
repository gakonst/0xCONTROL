import type { ReactNode } from "react";

type LibraryHeaderProps = {
  title: string;
  stats: string;
  search: {
    id: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
    label?: string;
  };
  onClearSearch?: () => void;
  eyebrow?: string;
  description?: string;
  backAction?: {
    label?: string;
    onBack: () => void;
  };
  extraControls?: ReactNode;
  showClearButton?: boolean;
  showSearchControls?: boolean;
};

export type LibrarySearchControlsProps = Pick<
  LibraryHeaderProps,
  "search" | "onClearSearch" | "extraControls" | "showClearButton"
> & {
  className?: string;
};

export function LibrarySearchControls({
  search,
  onClearSearch,
  extraControls,
  showClearButton = true,
  className,
}: LibrarySearchControlsProps) {
  return (
    <div className={className}>
      <label htmlFor={search.id} className="sr-only">
        {search.label ?? "Search"}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={search.id}
          type="search"
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          placeholder={search.placeholder}
          className="w-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/60 focus:outline-none focus:ring-1 focus:ring-white/40"
        />
        {search.value && showClearButton && (
          <button
            type="button"
            onClick={onClearSearch ? onClearSearch : () => search.onChange("")}
            className="border border-white/40 px-3 py-2 text-[0.55rem] uppercase tracking-tight text-white transition hover:bg-white/10"
          >
            Clear
          </button>
        )}
      </div>
      {extraControls && <div className="mt-2">{extraControls}</div>}
    </div>
  );
}

export function LibraryHeader({
  title,
  stats,
  search,
  onClearSearch,
  eyebrow,
  description,
  backAction,
  extraControls,
  showClearButton = true,
  showSearchControls = true,
}: LibraryHeaderProps) {
  return (
    <header className="px-3.5 py-4 md:px-5">
      <div className="flex flex-col gap-1">
        {backAction && (
          <button
            type="button"
            onClick={backAction.onBack}
            className="mb-2 inline-flex items-center gap-2 text-[0.55rem] uppercase tracking-[0.15rem] text-white/50 transition hover:text-white/80"
          >
            ← {backAction.label ?? "Back"}
          </button>
        )}
        {eyebrow && (
          <p className="text-[0.5rem] uppercase tracking-[0.35rem] text-white/40">
            {eyebrow}
          </p>
        )}
        <h1 className="text-base font-semibold uppercase tracking-[0.12rem] text-foreground md:text-lg">
          {title}
        </h1>
        {description && (
          <p className="text-xs text-white/70 md:text-sm">{description}</p>
        )}
        <p className="text-[0.55rem] uppercase tracking-[0.08rem] text-muted-foreground/80">
          {stats}
        </p>
        {showSearchControls && (
          <LibrarySearchControls
            search={search}
            onClearSearch={onClearSearch}
            extraControls={extraControls}
            showClearButton={showClearButton}
            className="mt-3"
          />
        )}
      </div>
    </header>
  );
}
