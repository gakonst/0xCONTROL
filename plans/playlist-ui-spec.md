# Playlist UI & Shadcn Implementation Plan

This document drills into the Spotify-inspired playlist surface we want to build before touching the data layer. The goal is to describe the visual language, interactions, and shadcn primitives we will compose so the build feels intentional and on-brand.

## Reference style & tone
- Base the palette on deep burgundy / emerald gradients similar to the screenshots while honoring our existing dark theme tokens.
- Typography hierarchy mirrors Spotify: oversized playlist title, subdued metadata, compact list rows with high information density.
- Album art and status badges should pop with saturated colors to offset the dark canvas.

## Layout blueprint
1. **App shell**
   - Use the shadcn `Layout` pattern (sidebar + main) but keep this spec focused on the main content column.
   - The playlist canvas should vertically stack: hero header → action rail → track list → fixed bottom player stub.
2. **Hero header**
   - Full-bleed gradient background with subtle noise overlay.
   - Left column: square cover art (shadcn `Card` with `aspect-square` and drop shadow).
   - Right column: playlist label chip (`Badge`), title (`h1`), curator info, total length, save count, last updated time.
   - CTA cluster uses ghost `Button` variants for Add, Mix, Edit, Sort plus a prominent `Play` `Button` styled as a circular icon button.
3. **Bottom transport preview**
   - A slim `Card` pinned to the bottom showing currently playing track, device info, and quick controls; mimic Spotify mini-player proportions.

## Track list anatomy
- Container: shadcn `Card` with `rounded-2xl` and `border-border/40` to distinguish from the hero.
- Each row is a `div` grid with columns: drag handle → art thumb (48px) → title/artist stack → badges → BPM/time → overflow menu.
- Row background uses `hover:bg-primary/10` and `data-playing:bg-primary/20` to highlight the active track.
- Display metadata elements:
  - Title + featuring info; second line shows artist(s) and label.
  - Status chips (`Auto`, playlist color, energy rating) implemented via shadcn `Badge` components with custom hues.
  - BPM badge, Key badge, duration text right-aligned.
  - Download / offline indicator icon.
  - Context menu trigger (`DropdownMenuTrigger` with ellipsis icon) offering Add to Playlist, Add to Queue, Go to Artist, Edit Metadata.
- Support inline action icons (play, queue, like) that appear on hover/focus for mouse, and via swipe gestures on touch (see interactions).

## Interaction model
1. **Playback & queue**
   - Clicking album art or the row play button starts playback; row enters `playing` state with animated green EQ bars.
   - `Play` column toggles to `Pause` when active.
   - Queue button pushes to temporary queue; show toast (`useToast`) confirmation.
2. **Swipe gestures (touch)**
   - On mobile widths, implement a `Swipeable` wrapper (Radix `Swipeable` once available or custom) to expose quick actions: swipe right → add to last playlist, swipe left → open secondary actions.
3. **Selection & bulk edit**
   - Checkbox column (hidden on phone) using shadcn `Checkbox`. Selected rows reveal the bulk toolbar docked at top of list.
4. **Inline metadata editing**
   - Tapping BPM or color badge opens a `Popover` with inputs (`Input`, `ColorPicker`, `Slider`).
   - Title/artist opens `CommandDialog` search for auto-complete suggestions.
5. **Keyboard support**
   - Arrow keys move focus between rows (use `roving tabindex`).
   - `Enter` plays, `Shift+Enter` queues, `Cmd/Ctrl+K` opens track search.

## Responsive behavior
- **Desktop ≥1024px**: 2-column hero, table-like rows, persistent filter pill bar.
- **Tablet 768–1023px**: Cover art shrinks, action buttons collapse into an overflow `DropdownMenu`, badges wrap.
- **Mobile ≤767px**: Hero becomes stacked with centered art, track rows switch to compact cards with swipe actions, bottom player enlarges to 72px height.

## Component mapping to shadcn
| UX element | shadcn primitives | Notes |
| --- | --- | --- |
| Playlist header cover | `Card`, `AspectRatio`, `Skeleton` | Skeleton for loading state |
| Playlist title & meta | `Typography` presets (`h1`, `muted`) | Use CSS utility classes for Spotify weight |
| Action rail | `Button`, `Tooltip`, `Separator` | Primary play button uses `rounded-full` |
| Filter chips | `Badge`, `ToggleGroup` | Optional gradient backgrounds |
| Track rows | `HoverCard`, `ContextMenu`, `Checkbox`, `DropdownMenu` | HoverCard to show extended metadata |
| Inline editors | `Popover`, `Slider`, `Input`, `CommandDialog` | Provide save/cancel footers |
| Toasts | `useToast` | Anchor near bottom player |
| Swipe actions | `Sheet` fallback for devices without swipe support | |

## State & loading considerations
- Initial skeleton: shimmer for hero, placeholder rows with grey boxes and animating badges.
- Error blocks using shadcn `Alert` with destructive variant.
- Empty playlist message: illustrated state with CTA to add tracks or import from catalog.

## Accessibility
- All icon-only buttons require `sr-only` labels.
- Ensure sufficient contrast between gradient backgrounds and text (minimum AA 4.5:1 for body copy).
- Respect reduced motion by disabling gradient animations/EQ bars if `prefers-reduced-motion` is true.

## Implementation checklist
1. Build hero header component with props for artwork, title, curator, stats.
2. Create reusable `TrackRow` component that accepts track metadata + callbacks for play/queue/edit.
3. Wire up action rail + filter chips state (even if data is mocked for now).
4. Implement inline edit popovers and toasts using shadcn providers.
5. Add responsive styles + swipe gestures.
6. Finish with storybook-style playground to validate states before integrating data.
