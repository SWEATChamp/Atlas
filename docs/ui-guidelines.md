# UI Guidelines

## Design Philosophy

Atlas uses a calm, academic, and deliberately restrained interface designed to maximize study clarity and reduce cognitive fatigue:
- **Dark Mode Neutral Base**: Built on deep, neutral dark surfaces (`--bg-base: #101216`, `--bg-elevated: #15181d`, `--bg-card: #1d2229`) with subtle borders (`--border-subtle: #292f37`, `--border-muted: #343c46`).
- **Muted Slate-Blue Accent**: One cohesive action accent (`--accent-primary: #7f9fbe`, `--accent-strong: #4c7094`, `--accent-soft: rgba(127, 159, 190, 0.12)`) for primary buttons, active states, and focal actions.
- **Meaningful Subject Identifiers**: Subject colours are strictly reserved for small identity indicators (e.g. 10px dots, subtle card top border accents, and chart series), rather than loud colored backgrounds or multicoloured navigation.
- **Flatter Information Architecture**: Avoid deeply nested card-in-card containers. Section containers use flat layout structures with clean dividing lines and purposeful spacing.
- **Clean Vector Iconography**: Pure Lucide icons with consistent stroke weights. Interface emojis are strictly excluded.

## Color Tokens

### Base Surfaces
- `--bg-base`: `#101216` (root application background)
- `--bg-elevated`: `#15181d` (elevated panels, dropdowns)
- `--bg-overlay`: `#1a1e24` (overlay elements)
- `--bg-card`: `#1d2229` (cards, content panels)
- `--bg-hover`: `#232931` (hover state)
- `--bg-active`: `#29323c` (active/pressed state)

### Borders
- `--border-subtle`: `#292f37` (default card borders, dividers)
- `--border-muted`: `#343c46` (input borders, active card borders)
- `--border-strong`: `#46515e` (focused borders)
- `--border-accent`: `rgba(127, 159, 190, 0.35)` (highlighted action borders)

### Text
- `--text-primary`: `#f1eee8` (headings, primary labels)
- `--text-secondary`: `#b2b8c0` (body text, secondary descriptions)
- `--text-muted`: `#7d8691` (timestamps, helper captions)
- `--text-disabled`: `#555e69` (disabled states, locked topics)

### Accent & Brand
- `--accent-primary`: `#7f9fbe` (primary actions, links)
- `--accent-strong`: `#4c7094` (prominent interactive elements)
- `--accent-soft`: `rgba(127, 159, 190, 0.12)` (subtle badge backgrounds)

### Semantic Status
- `--success`: `#79a98b` (complete notes, high accuracy, streak active)
- `--warning`: `#c4a05d` (in progress notes, moderate accuracy, countdown alerts)
- `--danger`: `#c77b7b` (low accuracy, removal warnings, critical alerts)
- `--info`: `#7f9fbe` (informative badges)

## Typography

- **System Font Stack**: Standard, highly optimized system sans stack (`'Avenir Next', Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) ensuring zero render-blocking third-party font requests.
- **Monospace Stack**: `'SFMono-Regular', Consolas, 'Liberation Mono', ui-monospace, monospace` for numbers, codes, and scores.

## Overlay & Modal Accessibility (`components/ui/dialog.tsx`)

All modal overlays and dialogs in Atlas must use or adhere to the shared `Dialog` component primitive:
1. **ARIA Structure**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="{titleId}"`, `aria-describedby="{descriptionId}"`.
2. **Focus Management**:
   - Focus is trapped within the dialog container using circular Tab / Shift+Tab cycling.
   - Initial focus is placed on `initialFocusRef` or the dialog container upon mount.
   - Focus is automatically restored to the previously focused element (`previousActiveElementRef`) upon every closure path, including button clicks, backdrop clicks, Escape key, form submissions, and component unmount.
3. **Dismissal**:
   - Closes immediately on `Escape` keypress.
   - Closes on backdrop click without decorative backdrop blur.
   - Provides an accessible close button with `aria-label="Close dialog"`.
4. **Scroll Lock**: Body scroll is automatically locked (`overflow: hidden`) while open and restored when closed.

## Touch Targets & Viewport Resilience

- **Minimum Touch Targets**: All interactive elements (buttons, links, chapter status toggles, confidence stars, paper actions, exam date pickers, target grade selectors) must maintain at least a 44×44px touch area on touch/mobile screens (`≤768px`).
- **320px Viewport Resilience**: Layouts must not produce horizontal overflow (`scrollWidth <= clientWidth`) on viewports down to 320px. User display names and titles must truncate cleanly with ellipsis or wrap.

## Reduced Motion

All transitions and animations must respect user preferences:
- Framer Motion and CSS transitions must be suppressed or reduced when `@media (prefers-reduced-motion: reduce)` is active.
- Skeleton shimmers and progress bar animations must disable loop movement under reduced motion.
