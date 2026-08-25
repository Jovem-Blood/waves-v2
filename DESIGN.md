# Waves - Discord Music Panel Design

## Overview

Waves is a private dashboard for managing the music queue and playback of a
Discord bot. Spotify provides search and metadata, while the bot resolves audio
through YouTube Music. Authentication remains outside the
panel and must be provided by an external protection layer.

The visual direction is a dark operational interface with neon mint, cyan, and
violet accents. The UI prioritizes queue management, current playback status,
and fast Spotify search.

## Design Files

- Pencil source: `pencil.pen`
- Discord bot avatar: `apps/bot/assets/qr-code-icon.png`
- Avatar source frame: `Discord Bot Avatar - Colored`

The Pencil document contains four independent top-level frames:

| Frame | Size | Purpose |
| --- | --- | --- |
| `Mobile Viewport` | 500 x 1130 | Mobile queue controller |
| `Desktop Viewport` | 1440 x 1024 | Desktop operational dashboard |
| `Design System` | 1040 x 1780 | Foundations, components, and Tailwind recipes |
| `Discord Bot Avatar - Colored` | 1024 x 1024 | Discord application avatar |

## Product Principles

1. The queue is the dominant operational area.
2. Player state is always visible.
3. Spotify search is secondary but immediately available.
4. Status is communicated with text and color, never color alone.
5. Destructive actions remain visually quieter until focused or hovered.
6. Mobile uses a single-column flow; desktop uses a queue workspace and a
   secondary player/search column.

## Color Tokens

Define single-value tokens in the global CSS `:root` block.

```css
@import "tailwindcss";

:root {
  --color-background: #06111f;
  --color-surface: #071522;
  --color-surface-raised: #081724;
  --color-surface-strong: #0a1825;
  --color-border: #17303e;
  --color-border-strong: #2d5160;

  --color-text: #f7fafc;
  --color-text-muted: #9eabba;
  --color-text-subtle: #778597;

  --color-mint: #54f287;
  --color-cyan: #62c7ff;
  --color-violet: #a879ff;
  --color-error: #ff6b86;
  --color-warning: #f0b84a;

  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-pill: 999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
}

@layer base {
  html,
  body {
    height: 100%;
  }

  .font-primary {
    font-family: "Geist", "Inter", sans-serif;
  }

  .font-mono {
    font-family: "Geist Mono", "IBM Plex Mono", monospace;
  }
}
```

Use Tailwind classes with variables:

```html
<div class="bg-[var(--color-surface)] text-[var(--color-text)]">
```

Do not use inline styles for layout, spacing, color, or typography.

## Typography

| Role | Family | Size | Weight |
| --- | --- | --- | --- |
| Display | Geist | 22-36px | 650-750 |
| Section title | Geist / Inter | 16-24px | 650-700 |
| Body | Inter | 12-14px | 400-500 |
| Labels | Geist Mono / IBM Plex Mono | 8-10px | 600-700 |
| Data and time | Geist Mono | 9-14px | 500-700 |

Uppercase mono labels are reserved for status, metadata, table headings, and
system information.

## Reusable Components

The Pencil document defines these reusable components:

| Component | Pencil ID | Intended implementation |
| --- | --- | --- |
| `Button/Primary` | `UDZEQ` | Main positive action |
| `Button/Secondary` | `S5ngc` | Skip and secondary commands |
| `Button/Icon` | `a2SMW5` | Compact row or toolbar action |
| `Input/Search` | `ZVapI` | Spotify search input |
| `Badge/Queue` | `u2nVR` | Queued state |
| `Badge/Online` | `vdl3e` | Bot or connection state |
| `Badge/Error` | `EXkkZ` | Failed state |
| `QueueItem/Default` | `YGcRl` | Mobile queue row |
| `TrackCard/SearchResult` | `I4vIc` | Spotify result |
| `PlayerBar/Compact` | `VZ7Us` | Compact playback summary |

### Tailwind Recipes

Primary button:

```html
class="inline-flex h-11 items-center gap-2 rounded-[10px] px-4
font-semibold bg-[var(--color-mint)] text-[#04120b]
hover:brightness-110 active:scale-95
disabled:cursor-not-allowed disabled:opacity-50"
```

Search input:

```html
class="flex h-[50px] w-full items-center gap-2.5 rounded-[10px]
border border-[var(--color-mint)] bg-[var(--color-surface)] px-3.5
focus-within:ring-2 focus-within:ring-[var(--color-mint)]/30"
```

Queue item:

```html
class="flex h-[68px] w-full items-center gap-2.5 rounded-lg
border border-[var(--color-border)]
bg-[var(--color-surface-raised)] px-2.5 py-2
data-[playing=true]:border-[var(--color-mint)]"
```

## Mobile Viewport

The mobile screen is a single vertical workflow:

1. Brand and connection state.
2. Current track with artwork, requester, progress, and skip action.
3. Queue heading with polling feedback.
4. Six compact queue rows with ordering, requester, state, drag, and removal.
5. Spotify search sheet.
6. Search result and add-to-queue action.

Important behavior:

- Keep skip and add actions within comfortable touch reach.
- Queue rows use a minimum 48px interactive target.
- The playing row receives a mint border and darker highlighted surface.
- Poll the queue every 2-3 seconds and show the updating state.
- Preserve the search sheet hierarchy when the software keyboard is visible.

## Desktop Viewport

The desktop viewport uses two main zones.

### Queue Workspace

- Width: 900px.
- Queue title, description, live polling state, and manual refresh.
- Operational summary for queue duration, listeners, and playing state.
- Data table columns:
  - Order
  - Track
  - Requested by
  - Duration
  - State
  - Actions
- The active row uses mint emphasis.
- Failed rows use a restrained error surface and explicit error label.

### Player and Search

- Current track card with 150px artwork.
- Track, artist, requester, progress, elapsed time, and total duration.
- Skip and overflow actions.
- Spotify search input and provider label.
- Three visible search-result cards with add actions.

The right column is secondary to the queue and should not visually compete
with the table.

## Interaction States

Every interactive component should support:

- Default
- Hover
- Focus-visible
- Active
- Disabled
- Loading where applicable

Queue-specific states:

- `queued`
- `playing`
- `played`
- `skipped`
- `failed`

Player-specific states:

- `idle`
- `playing`
- `paused`
- `stopped`

Operational states:

- Web: `available` or `unavailable`
- Bot: `online` or `offline`
- Voice: `connected`, `disconnected`, or `reconnecting`

Never infer bot availability from the web health endpoint. Server and voice
channel names are displayed only when supplied by the current bot connection.

Mutation feedback uses global accessible toasts. Success feedback is polite,
errors are announced as alerts, and queue removal offers a ten-second undo
action.

Use `aria-live="polite"` for queue polling and player status changes.

## Responsive Rules

- Mobile breakpoint: one column; Spotify search follows the queue.
- Desktop breakpoint: queue and secondary panel appear side by side.
- The desktop queue remains the flexible primary area.
- The player/search column should remain between 420px and 480px.
- Avoid horizontal scrolling for the mobile queue.
- On intermediate widths, move the player/search panel below the queue.

Suggested Tailwind layout:

```html
<main class="flex min-h-screen flex-col bg-[var(--color-background)]
lg:grid lg:grid-cols-[minmax(0,1fr)_468px] lg:gap-6">
```

## Iconography

- Use Lucide icons.
- Default icon stroke should visually match approximately 1.5px.
- Icons supplement labels; they do not replace essential action text.
- Mint indicates live, connected, or positive actions.
- Violet identifies requester and secondary metadata.
- Error red is reserved for failed or destructive states.

## Discord Bot Avatar

The exported avatar uses:

- 1024 x 1024 PNG.
- Dark radial background.
- Mint-to-cyan-to-violet brand gradient.
- Centered Lucide `audio-waveform` mark.
- Safe margins for Discord's circular crop.

Use `exports/ojohg.png` for the Discord application and bot profile image.

## Accessibility

- Maintain at least WCAG AA contrast for body text.
- Always pair colored status with a visible label.
- Provide visible keyboard focus rings.
- Add accessible names to icon-only controls.
- Use buttons for commands and links only for navigation.
- Do not rely on drag-and-drop as the only reordering method.
- Respect reduced-motion preferences for progress and loading animations.

## Implementation Notes

- Target Nuxt 4 and Tailwind CSS v4.
- Use `@import "tailwindcss";`, not Tailwind v3 directives.
- Use CSS variables for single-value design tokens.
- Load font families separately and expose `.font-primary` and `.font-mono`.
- Use Lucide Vue components for icons.
- Keep API loading, empty, error, and success states explicit.
- Do not expose Spotify or internal API secrets to the client bundle.
