import { cn } from "@/lib/utils";

export type LibraryTabKey = "home" | "playlists" | "create";

type LibraryTabsProps = {
  activeTab: LibraryTabKey;
  onTabChange: (tab: LibraryTabKey) => void;
};

const TABS: Array<{ key: LibraryTabKey; label: string }> = [
  { key: "home", label: "Home" },
  { key: "playlists", label: "Playlists" },
  { key: "create", label: "New" },
];

export function LibraryTabs({ activeTab, onTabChange }: LibraryTabsProps) {
  return (
    <nav className="flex items-stretch border-t border-white/10 bg-black/60 text-[0.55rem] font-semibold uppercase tracking-[0.12rem] text-white/60">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            className={cn(
              "flex-1 px-2 py-1 transition",
              "tracking-[0.12rem]",
              isActive
                ? "bg-white/10 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
