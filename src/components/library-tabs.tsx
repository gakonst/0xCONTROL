import { type LucideIcon, Home, ListMusic, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type LibraryTabKey = "home" | "playlists" | "create";

type LibraryTabsProps = {
  activeTab: LibraryTabKey;
  onTabChange: (tab: LibraryTabKey) => void;
};

const TABS: Array<{ key: LibraryTabKey; label: string; Icon: LucideIcon }> = [
  { key: "home", label: "Home", Icon: Home },
  { key: "playlists", label: "Playlists", Icon: ListMusic },
  { key: "create", label: "New", Icon: Plus },
];

export function LibraryTabs({ activeTab, onTabChange }: LibraryTabsProps) {
  return (
    <nav className="flex items-stretch border-t border-white/10 bg-black/60 text-[0.65rem] font-semibold uppercase tracking-[0.12rem] text-white/60">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            className={cn(
              "flex-1 px-3 py-2 min-h-[44px] text-center transition",
              "tracking-[0.12rem]",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onTabChange(tab.key)}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <tab.Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
