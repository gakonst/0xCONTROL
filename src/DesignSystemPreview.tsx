import { type ReactNode, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  MoreHorizontal,
  Music,
  X,
} from "lucide-react";

import { FullPlayerBottom } from "@/components/full-player-bottom";
import {
  LibraryHeader,
  LibrarySearchControls,
} from "@/components/library-header";
import { LibraryTabs, type LibraryTabKey } from "@/components/library-tabs";
import { PlaybackSurface } from "@/components/playback-surface";
import { PlayerBar } from "@/components/player-bar";
import { ScreenHeader } from "@/components/screen-header";
import { TrackEditor } from "@/components/track-editor";
import {
  ActionSheet,
  ActionSheetClose,
  ActionSheetContent,
  ActionSheetTrigger,
  SheetAction,
} from "@/components/ui/action-sheet";
import {
  AnnotationDot,
  Button,
  EmptyState,
  Eyebrow,
  IconButton,
  Meta,
  SearchField,
  Surface,
} from "@/components/ui/primitives";
import { DetailCanvas, OverviewCanvas } from "@/components/waveform-canvas";
import type { Track } from "@/data/tracks";
import {
  DESIGN_SYSTEM_WAVEFORM,
  DESIGN_SYSTEM_WAVEFORM_BEAT_OFFSET,
  DESIGN_SYSTEM_WAVEFORM_BPM,
} from "@/design-system/waveform-fixture";
import type { WaveformData } from "@/lib/waveform";
import type { TrackAnnotation } from "@/types/annotations";

const SAMPLE_TRACK: Track = {
  id: "02-kiesza_-_hideaway_(extended)-zzzz.mp3",
  title: "Hideaway (Extended)",
  artist: "Kiesza",
  bpm: Math.round(DESIGN_SYSTEM_WAVEFORM_BPM),
  key: "--",
  duration: "5:16",
  cover: "",
};

const SAMPLE_WAVEFORM = DESIGN_SYSTEM_WAVEFORM;
const SAMPLE_DURATION = DESIGN_SYSTEM_WAVEFORM.durationSeconds;
const SAMPLE_BPM = DESIGN_SYSTEM_WAVEFORM_BPM;
const SAMPLE_BEAT_OFFSET = DESIGN_SYSTEM_WAVEFORM_BEAT_OFFSET;

const TOKENS = [
  ["Background", "--background", "240 50% 4%"],
  ["Card", "--card", "228 32% 7%"],
  ["Secondary", "--secondary", "223 43% 10%"],
  ["Muted", "--muted", "223 47% 13%"],
  ["Foreground", "--foreground", "210 40% 98%"],
  ["Muted text", "--muted-foreground", "215 20% 65%"],
  ["Accent", "--accent", "240 90% 67%"],
  ["Destructive", "--destructive", "0 84% 60%"],
] as const;

const NAV_ITEMS = [
  ["foundations", "Foundations"],
  ["controls", "Controls"],
  ["headers", "Headers"],
  ["rows", "Rows"],
  ["waveforms", "Waveforms"],
  ["annotation", "Annotation"],
  ["playback", "Playback"],
  ["feedback", "Feedback"],
] as const;

export function DesignSystemPreview() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<LibraryTabKey>("home");
  const [bottomSearchOpen, setBottomSearchOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [annotation, setAnnotation] = useState<TrackAnnotation>({
    color: "blue",
    note: "blend after the second break",
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(94);
  const formattedTime = useMemo(
    () => `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`,
    [elapsedSeconds],
  );

  return (
    <div className="h-[100dvh] overflow-y-auto bg-[#010308] text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(1,3,8,0.94)] px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <a
            href="/"
            className="flex h-10 w-10 items-center justify-center border border-white/30 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to 0xControl"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-[0.5rem] uppercase tracking-[0.35rem] text-white/40">
              0xControl
            </p>
            <h1 className="truncate text-base font-semibold uppercase tracking-[0.12rem] md:text-lg">
              UI System
            </h1>
          </div>
          <span className="hidden border border-white/20 px-2 py-1 text-[0.55rem] uppercase tracking-[0.12rem] text-white/50 sm:block">
            Golden / HEAD
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav className="sticky top-[65px] z-30 flex gap-1 overflow-x-auto border-b border-white/10 bg-background px-4 py-2 md:h-[calc(100dvh-65px)] md:flex-col md:border-b-0 md:border-r md:px-3 md:py-5">
          {NAV_ITEMS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="shrink-0 border border-transparent px-3 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.1rem] text-white/50 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <main className="min-w-0 space-y-14 px-4 py-8 md:px-8 md:py-10">
          <section className="max-w-3xl">
            <Eyebrow>Design contract</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">
              The original interface, made reusable.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 md:text-base">
              These specimens are the exact visual and interaction recipes used by
              0xControl. Product surfaces should compose them without normalizing
              their density, geometry, waveform treatment, or typography.
            </p>
          </section>

          <SpecimenSection id="foundations" eyebrow="01" title="Foundations">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {TOKENS.map(([label, token, value]) => (
                <div key={token} className="border border-white/10 bg-black/20 p-3">
                  <div
                    className="h-16 border border-white/10"
                    style={{ background: `hsl(var(${token}))` }}
                  />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08rem]">
                    {label}
                  </p>
                  <p className="mt-1 font-mono text-[0.62rem] text-white/45">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <SpecimenCard label="Typography / Space Grotesk">
                <p className="text-[0.5rem] uppercase tracking-[0.35rem] text-white/40">Eyebrow context</p>
                <p className="mt-3 text-lg font-semibold uppercase tracking-[0.12rem]">Collection heading</p>
                <p className="mt-3 text-base font-semibold">Voices In My Head</p>
                <p className="mt-1 text-xs text-white/60">Anyma, Argy, Son of Son</p>
                <p className="mt-4 text-[0.55rem] uppercase tracking-[0.08rem] text-muted-foreground">25 tracks • 1h 40m</p>
              </SpecimenCard>
              <SpecimenCard label="Spacing / Geometry">
                <div className="grid grid-cols-4 items-end gap-3">
                  {[4, 8, 12, 16].map((size) => (
                    <div key={size} className="text-center">
                      <div className="mx-auto bg-white/70" style={{ width: size, height: size }} />
                      <p className="mt-2 text-[0.55rem] text-white/45">{size}px</p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-white/55">
                  Square controls by default. Rounded geometry is reserved for the
                  immersive player and explicit native-sheet surfaces.
                </p>
              </SpecimenCard>
            </div>
          </SpecimenSection>

          <SpecimenSection id="controls" eyebrow="02" title="Controls">
            <div className="grid gap-4 xl:grid-cols-2">
              <SpecimenCard label="Buttons">
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Destructive</Button>
                  <IconButton label="More actions"><MoreHorizontal className="h-5 w-5" /></IconButton>
                </div>
              </SpecimenCard>
              <SpecimenCard label="Search / Metadata">
                <SearchField
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onClear={() => setQuery("")}
                  placeholder="Search tracks"
                  aria-label="Search specimen"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Meta>112 BPM</Meta>
                  <Meta className="border border-white/60 bg-white/80 px-2 py-1 text-black/80">8A</Meta>
                  <AnnotationDot color="blue" />
                  <AnnotationDot color="red" />
                  <AnnotationDot />
                </div>
              </SpecimenCard>
            </div>
          </SpecimenSection>

          <SpecimenSection id="headers" eyebrow="03" title="Headers and sort strips">
            <Surface className="overflow-hidden rounded-[var(--radius)] bg-background">
              <LibraryHeader
                title="Collection"
                eyebrow="Library"
                stats="25 tracks • 1h 40m"
                search={{
                  id: "ui-library-search",
                  value: query,
                  placeholder: 'Search or use "bpm:>130"',
                  onChange: setQuery,
                }}
                onClearSearch={() => setQuery("")}
                extraControls={<SortStrip />}
                showSearchControls={false}
              />
            </Surface>
            <div className="mt-4 border border-white/10 bg-background pb-5">
              <ScreenHeader
                title="Now Playing"
                trailing={
                  <div className="flex gap-2">
                    <IconButton label="Download"><Download className="h-4 w-4" /></IconButton>
                    <IconButton label="Close"><X className="h-4 w-4" /></IconButton>
                  </div>
                }
              />
            </div>
          </SpecimenSection>

          <SpecimenSection id="rows" eyebrow="04" title="Library rows">
            <div className="overflow-hidden border border-white/10 bg-background">
              <TrackRowSpecimen waveform={SAMPLE_WAVEFORM} />
              <TrackRowSpecimen waveform={SAMPLE_WAVEFORM} title="Better Than This" artist="Bedouin" bpm={124} trackKey="8B" />
              <PlaylistRowSpecimen />
            </div>
            <p className="mt-3 text-xs leading-5 text-white/45">
              Track rows are 56px minimum with 96×36 waveforms on mobile and
              128×40 at the medium breakpoint. Swipe reveals add, archive,
              remove, pin, or delete actions; long-press opens contextual actions.
            </p>
          </SpecimenSection>

          <SpecimenSection id="waveforms" eyebrow="05" title="Waveform language">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
              <SpecimenCard label="Detail / 16× zoom">
                <div className="h-[170px] overflow-hidden bg-black/30">
                  <DetailCanvas
                    waveform={SAMPLE_WAVEFORM}
                    duration={SAMPLE_DURATION}
                    bpm={SAMPLE_BPM}
                    beatOffsetSeconds={SAMPLE_BEAT_OFFSET}
                    zoom={16}
                    isPlaying={isPlaying}
                    baseCurrentTime={elapsedSeconds}
                    onSeek={(ratio) => setElapsedSeconds(Math.round(ratio * SAMPLE_DURATION))}
                    height={170}
                    className="relative h-full w-full"
                    rounded={false}
                  />
                </div>
              </SpecimenCard>
              <SpecimenCard label={`Overview / ${formattedTime}`}>
                <div className="h-[54px] overflow-hidden bg-black/30">
                  <OverviewCanvas
                    waveform={SAMPLE_WAVEFORM}
                    duration={SAMPLE_DURATION}
                    bpm={SAMPLE_BPM}
                    beatOffsetSeconds={SAMPLE_BEAT_OFFSET}
                    isPlaying={isPlaying}
                    baseCurrentTime={elapsedSeconds}
                    onSeek={(ratio) => setElapsedSeconds(Math.round(ratio * SAMPLE_DURATION))}
                    height={54}
                    className="relative h-full w-full"
                    rounded={false}
                  />
                </div>
              </SpecimenCard>
            </div>
          </SpecimenSection>

          <SpecimenSection id="annotation" eyebrow="06" title="Annotation editor">
            <div className="border border-white/10 bg-[rgba(2,2,6,0.98)]">
              <TrackEditor
                track={SAMPLE_TRACK}
                annotation={annotation}
                onChange={(update) => setAnnotation((current) => ({ ...current, ...update }))}
              />
            </div>
          </SpecimenSection>

          <SpecimenSection id="playback" eyebrow="07" title="Playback surfaces">
            <div className="overflow-hidden border border-white/10">
              <PlayerBar
                track={SAMPLE_TRACK}
                isPlaying={isPlaying}
                isBuffering={false}
                elapsedSeconds={elapsedSeconds}
                durationSeconds={SAMPLE_DURATION}
                waveform={SAMPLE_WAVEFORM}
                beatOffsetSeconds={SAMPLE_BEAT_OFFSET}
                onTogglePlay={() => setIsPlaying((value) => !value)}
                onSkipNext={() => setElapsedSeconds(0)}
                onSkipPrevious={() => setElapsedSeconds(0)}
                onOpenFullScreen={() => undefined}
              />
              {bottomSearchOpen && (
                <LibrarySearchControls
                  search={{
                    id: "ui-bottom-search",
                    value: query,
                    placeholder: "Search tracks or use bpm:>130",
                    onChange: setQuery,
                  }}
                  onClearSearch={() => setQuery("")}
                  extraControls={<SortStrip />}
                  className="border-t border-white/10 bg-black/70 px-4 py-3"
                />
              )}
              <LibraryTabs
                activeTab={activeTab}
                onTabChange={(tab) => {
                  setBottomSearchOpen(false);
                  setActiveTab(tab);
                }}
                isSearchOpen={bottomSearchOpen}
                onSearchToggle={() => setBottomSearchOpen((open) => !open)}
              />
            </div>

            <div className="mt-4 overflow-hidden border border-white/10 bg-[rgba(2,2,6,0.98)]">
              <PlaybackSurface progress={elapsedSeconds / SAMPLE_DURATION} background="transparent">
                <div className="flex-1">
                  <p className="text-sm font-semibold">Reusable playback surface</p>
                  <p className="text-xs text-white/55">Overlay + content + progress</p>
                </div>
                <Meta>{formattedTime}</Meta>
              </PlaybackSurface>
              <FullPlayerBottom
                isPlaying={isPlaying}
                isBuffering={false}
                elapsedSeconds={elapsedSeconds}
                durationSeconds={SAMPLE_DURATION}
                bpm={SAMPLE_BPM}
                onTogglePlay={() => setIsPlaying((value) => !value)}
                onSkipNext={() => setElapsedSeconds(0)}
                onSkipPrevious={() => setElapsedSeconds(0)}
                onSeek={setElapsedSeconds}
              />
            </div>
          </SpecimenSection>

          <SpecimenSection id="feedback" eyebrow="08" title="Feedback and empty states">
            <div className="grid gap-4 lg:grid-cols-2">
              <Surface className="rounded-none">
                <EmptyState
                  icon={<Music className="h-5 w-5" />}
                  title="No unassigned tracks"
                  description="Everything in the library already belongs to a playlist."
                  action={<Button size="sm">Create playlist</Button>}
                />
              </Surface>
              <SpecimenCard label="Context sheet">
                <ActionSheet>
                  <ActionSheetTrigger asChild>
                    <Button variant="secondary">Open action sheet</Button>
                  </ActionSheetTrigger>
                  <ActionSheetContent title="Voices In My Head" description="Anyma, Argy, Son of Son">
                    <ActionSheetClose asChild>
                      <SheetAction icon={<Download className="h-5 w-5" />} label="Download track" />
                    </ActionSheetClose>
                    <ActionSheetClose asChild>
                      <SheetAction icon={<Check className="h-5 w-5" />} label="Add to playlist" />
                    </ActionSheetClose>
                    <ActionSheetClose asChild>
                      <SheetAction icon={<X className="h-5 w-5" />} label="Remove track" destructive />
                    </ActionSheetClose>
                  </ActionSheetContent>
                </ActionSheet>
                <p className="mt-4 text-xs leading-5 text-white/50">
                  Context sheets extend the original UI for management actions
                  without changing golden row geometry.
                </p>
              </SpecimenCard>
            </div>
          </SpecimenSection>

          <footer className="border-t border-white/10 pb-12 pt-6 text-[0.58rem] uppercase tracking-[0.1rem] text-white/35">
            0xControl UI System · Space Grotesk · Golden source: repository HEAD
          </footer>
        </main>
      </div>
    </div>
  );
}

function SpecimenSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-4 flex items-baseline gap-3 border-b border-white/10 pb-3">
        <span className="text-[0.55rem] uppercase tracking-[0.14rem] text-white/35">{eyebrow}</span>
        <h2 className="text-lg font-semibold uppercase tracking-[0.1rem]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SpecimenCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <p className="mb-4 text-[0.55rem] font-semibold uppercase tracking-[0.12rem] text-white/40">{label}</p>
      {children}
    </div>
  );
}

function SortStrip() {
  return (
    <div className="grid grid-cols-4 gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.08rem] text-muted-foreground/90">
      {["A-Z", "BPM", "Key", "Reset"].map((label, index) => (
        <button
          key={label}
          type="button"
          className={`w-full border border-white/30 px-2 py-1 text-center text-[0.6rem] uppercase tracking-tight text-foreground transition hover:bg-white/5 ${index === 0 ? "bg-white/10" : "bg-transparent"}`}
        >
          {label}{index === 0 ? " ↑" : ""}
        </button>
      ))}
    </div>
  );
}

function TrackRowSpecimen({
  waveform,
  title = SAMPLE_TRACK.title,
  artist = SAMPLE_TRACK.artist,
  bpm = SAMPLE_TRACK.bpm,
  trackKey = SAMPLE_TRACK.key,
}: {
  waveform: WaveformData;
  title?: string;
  artist?: string;
  bpm?: number;
  trackKey?: string;
}) {
  return (
    <div className="flex min-h-[3.5rem] items-center gap-2 px-3.5 py-2.5 text-left md:px-5">
      <div className="h-9 w-24 flex-shrink-0 overflow-hidden border border-white/10 bg-white/5 md:h-10 md:w-32">
        <OverviewCanvas
          waveform={waveform}
          duration={SAMPLE_DURATION}
          bpm={bpm}
          isPlaying={false}
          baseCurrentTime={0}
          onSeek={() => undefined}
          height={36}
          className="pointer-events-none relative h-9 w-full md:h-10"
          rounded={false}
          showPlayhead={false}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9rem] font-semibold md:text-base">{title}</p>
        <p className="truncate text-[0.65rem] text-muted-foreground md:text-xs">{artist}</p>
      </div>
      <div className="ml-auto flex w-[110px] flex-shrink-0 items-center justify-end gap-1.5 text-right md:w-[120px]">
        <span className="h-3 w-3 rounded-full border border-white/30 bg-blue-500" />
        <div>
          <p className="text-sm font-semibold md:text-base">{Math.round(bpm)}<span className="ml-1 text-[0.55rem] text-muted-foreground">BPM</span></p>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className="inline-flex min-w-10 justify-center border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-black/80">{trackKey}</span>
            <span className="text-[0.7rem] text-muted-foreground">5:16</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistRowSpecimen() {
  return (
    <div className="flex min-h-[3.5rem] items-center gap-2 border-t border-white/5 px-3.5 py-2.5 md:px-5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center border border-white/10 bg-[linear-gradient(135deg,#3b82f6,#a855f7)] text-[0.65rem] font-semibold">F</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9rem] font-semibold md:text-base">Field Intel <span className="text-[0.7rem]">📌</span></p>
        <p className="truncate text-[0.65rem] text-muted-foreground md:text-xs">Afterhours drive · Ops / Field Kits</p>
      </div>
      <div className="ml-auto flex w-[120px] flex-shrink-0 flex-col items-end md:w-[130px]">
        <span className="text-sm font-semibold md:text-base">3 tracks</span>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex min-w-14 justify-center border border-white/60 bg-white/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-black/80">11M 46S</span>
          <span className="text-[0.7rem]">today</span>
        </div>
      </div>
    </div>
  );
}
