import { Plus } from "lucide-react";

export function PlaylistCreatePanel() {
  return (
    <section className="flex h-full flex-col justify-center gap-4 border border-dashed border-white/15 bg-black/40 px-6 py-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center border border-white/30 bg-white/10 text-white">
        <Plus className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Draft Playlist</h2>
        <p className="text-sm text-white/70">
          The creation flow will let you select tracks, set metadata, and push
          it to the collection. For now this is a placeholder so we can wire the
          UX.
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2 text-left text-xs uppercase tracking-[0.15rem] text-white/60">
        <label htmlFor="playlist-name">Name</label>
        <input
          id="playlist-name"
          type="text"
          placeholder="Enter playlist name"
          disabled
          className="border border-white/30 bg-transparent px-3 py-2 text-white/80 placeholder:text-white/40"
        />
        <label htmlFor="playlist-notes" className="mt-4">
          Notes
        </label>
        <textarea
          id="playlist-notes"
          placeholder="Notes, tone, tags…"
          rows={3}
          disabled
          className="border border-white/30 bg-transparent px-3 py-2 text-white/80 placeholder:text-white/40"
        />
        <button
          type="button"
          disabled
          className="mt-4 border border-white/40 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.15rem] text-white/50"
        >
          Save Draft
        </button>
      </div>
    </section>
  );
}

