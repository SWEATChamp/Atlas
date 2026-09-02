# Atlas — Complete UI Specification
### High-Fidelity Page Design · v1.0 · July 2026

> [!NOTE]
> **Historical Document (Archived)**: This document reflects early design notes prior to Migrations 020–026. For current schema, business logic, and API contracts, consult `docs/` and `supabase/migrations/`.

> [!IMPORTANT]
> **Current UI direction (v1.2.0 UI Foundation)**: The visual rules below are archival and must not drive new work. The implemented interface uses calm, restrained neutral dark surfaces (`--bg-base: #101216`, `--bg-elevated: #15181d`, `--bg-card: #1d2229`), one muted slate-blue action accent (`--accent-primary: #7f9fbe`), solid fills, Lucide vector icons (no emojis), an accessible dependency-free `Dialog` component with universal focus restoration, a two-step Subject controls guide (`atlas_subject_controls_guide_v1`) with 5-star visual examples, and cards only for independently actionable or meaningfully grouped content. Subject colours identify subjects or chart series, but never become multicoloured navigation. Do not add decorative gradients, glow effects, emoji UI icons, nested cards, or unlabeled status dots. Current releases: v1.1.0 is deployed and production-verified (feature merge `7071fa0`, release-closeout/current tagged commit `5a8d69e6ee96cdcfb3c4e71e5c499222421164f8`; tag recorded, GitHub Release object absent). v1.2.0 is in development on branch `codex/v1.2.0-ui-foundation` (unreleased / not deployed). The current source of truth is `app/globals.css`, `docs/ui-guidelines.md`, and `docs/architecture.md`.

> **Design Language**: Linear × Apple Fitness × Duolingo × Arc Browser  
> Dark Mode First · Mission Control Aesthetic · Premium SaaS

---

## Table of Contents

0. [Design System](#0-design-system)
1. [Landing Page](#1-landing-page)
2. [Login Page](#2-login-page)
3. [Dashboard — Mission Control](#3-dashboard--mission-control)
4. [Subjects Overview](#4-subjects-overview)
5. [Subject Detail](#5-subject-detail)
6. [Chapter Detail](#6-chapter-detail)
7. [Analytics — Progress](#7-analytics--progress)
8. [Achievements](#8-achievements)
9. [Settings](#9-settings)
10. [Friends (Future)](#10-friends-future)

---

## 0. Design System

This section defines every visual token used across all pages. All pages inherit these values.

---

### 0.1 Color Palette

#### Base Surfaces

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#080810` | Root page background |
| `--bg-surface` | `#0E0E1A` | Cards, panels |
| `--bg-elevated` | `#141425` | Dropdowns, modals, tooltips |
| `--bg-overlay` | `rgba(8,8,16,0.85)` | Backdrop blur overlays |

#### Borders

| Token | Hex | Usage |
|---|---|---|
| `--border-subtle` | `rgba(255,255,255,0.05)` | Default card edges |
| `--border-default` | `rgba(255,255,255,0.10)` | Focused elements, dividers |
| `--border-strong` | `rgba(255,255,255,0.18)` | Active states, hover |

#### Text

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#EEEEFF` | Headings, key values |
| `--text-secondary` | `#8888AA` | Labels, descriptions |
| `--text-muted` | `#44445A` | Placeholder, disabled |
| `--text-inverse` | `#08081A` | Text on light surfaces |

#### Accent Palette

| Token | Hex | Usage |
|---|---|---|
| `--accent-blue` | `#5B7FFF` | Primary actions, links |
| `--accent-blue-glow` | `rgba(91,127,255,0.18)` | Button halos, rings |
| `--accent-purple` | `#9D6EF8` | XP, level, achievements |
| `--accent-purple-glow` | `rgba(157,110,248,0.18)` | Level rings |
| `--accent-green` | `#12E88A` | Success, complete, streak |
| `--accent-green-glow` | `rgba(18,232,138,0.15)` | Completion halos |
| `--accent-orange` | `#FF7B35` | Warnings, medium priority |
| `--accent-red` | `#FF4D6A` | Errors, danger, low accuracy |
| `--accent-yellow` | `#FFD166` | Streak fire, highlights |
| `--accent-cyan` | `#38D9F5` | Analytics, charts, data |

#### Subject Colors (per-subject theming)

| Subject | Primary | Glow |
|---|---|---|
| Mathematics | `#5B7FFF` | `rgba(91,127,255,0.15)` |
| Physics | `#38D9F5` | `rgba(56,217,245,0.15)` |
| Chemistry | `#12E88A` | `rgba(18,232,138,0.15)` |
| Biology | `#A8FF78` | `rgba(168,255,120,0.15)` |
| Economics | `#FFD166` | `rgba(255,209,102,0.15)` |
| History | `#FF7B35` | `rgba(255,123,53,0.15)` |
| Computer Sci | `#9D6EF8` | `rgba(157,110,248,0.15)` |
| English | `#FF6B9D` | `rgba(255,107,157,0.15)` |

---

### 0.2 Typography

**Font Stack**: `Inter` (body), `Cal Sans` or `Geist` (display headings)  
**Monospace**: `JetBrains Mono` (codes, numbers)

| Scale | Size | Weight | Line-height | Letter-spacing | Usage |
|---|---|---|---|---|---|
| `display-xl` | 56px | 700 | 1.05 | -0.04em | Hero headings |
| `display-lg` | 40px | 700 | 1.08 | -0.03em | Page hero |
| `heading-xl` | 30px | 600 | 1.15 | -0.025em | Section titles |
| `heading-lg` | 22px | 600 | 1.2 | -0.02em | Card headers |
| `heading-md` | 18px | 600 | 1.25 | -0.015em | Sub-sections |
| `heading-sm` | 15px | 600 | 1.3 | -0.01em | Row labels |
| `body-lg` | 16px | 400 | 1.6 | 0 | Primary body |
| `body-md` | 14px | 400 | 1.55 | 0 | Default body |
| `body-sm` | 13px | 400 | 1.5 | 0.01em | Secondary body |
| `caption` | 11px | 500 | 1.4 | 0.04em | Labels, tags |
| `mono-md` | 14px | 500 | 1.4 | 0 | Numbers, codes |
| `mono-sm` | 12px | 400 | 1.4 | 0 | Small stats |

---

### 0.3 Spacing System

Based on an **8px base grid**. All spacing tokens are multiples.

```
2   →  2px   (micro gaps, icon padding)
4   →  4px   (tight spacing)
6   →  6px   (badge padding)
8   →  8px   (xs — inline gaps)
12  → 12px   (sm — between icon and label)
16  → 16px   (md — card internal padding)
20  → 20px
24  → 24px   (lg — section gaps, card padding)
32  → 32px   (xl — between cards)
40  → 40px
48  → 48px   (2xl — section breaks)
64  → 64px   (3xl — page section padding)
80  → 80px   (hero spacing)
96  → 96px
128 → 128px
```

---

### 0.4 Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-xs` | 4px | Tags, badges, chips |
| `radius-sm` | 8px | Inputs, small buttons |
| `radius-md` | 12px | Cards, panels |
| `radius-lg` | 16px | Large cards, dialogs |
| `radius-xl` | 24px | Feature cards, hero elements |
| `radius-full` | 9999px | Pills, avatars, toggles |

---

### 0.5 Shadows & Glow

```
shadow-xs:  0 1px 2px rgba(0,0,0,0.4)
shadow-sm:  0 2px 8px rgba(0,0,0,0.5)
shadow-md:  0 4px 16px rgba(0,0,0,0.6)
shadow-lg:  0 8px 32px rgba(0,0,0,0.7)
shadow-xl:  0 16px 64px rgba(0,0,0,0.8)

glow-blue:    0 0 24px rgba(91,127,255,0.35)
glow-green:   0 0 24px rgba(18,232,138,0.30)
glow-purple:  0 0 24px rgba(157,110,248,0.30)
glow-orange:  0 0 24px rgba(255,123,53,0.25)
```

---

### 0.6 Global Animation Tokens (Framer Motion)

```
// Timing
DURATION_MICRO:    0.10s   // hover color, opacity flash
DURATION_FAST:     0.18s   // button presses, badge flips
DURATION_DEFAULT:  0.28s   // modal entrance, card expand
DURATION_SLOW:     0.45s   // page transitions, XP bar fill
DURATION_CINEMATIC: 0.8s   // achievement unlock, level up

// Easing
EASE_DEFAULT:     [0.16, 1, 0.3, 1]     // spring-like, snappy
EASE_SMOOTH:      [0.4, 0, 0.2, 1]      // Material-style
EASE_BOUNCE:      [0.34, 1.56, 0.64, 1] // playful, Duolingo-like
EASE_IN:          [0.4, 0, 1, 1]
EASE_OUT:         [0, 0, 0.2, 1]

// Springs
SPRING_SNAPPY:    { type: "spring", stiffness: 500, damping: 30 }
SPRING_GENTLE:    { type: "spring", stiffness: 200, damping: 20 }
SPRING_WOBBLY:    { type: "spring", stiffness: 300, damping: 15 }

// Common Variants
fadeInUp: {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_DEFAULT }}
}

staggerChildren: {
  visible: { transition: { staggerChildren: 0.05 }}
}

scaleIn: {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: SPRING_SNAPPY }
}
```

---

### 0.7 App Shell — Sidebar

Persistent across all authenticated pages.

```
Width: 240px (expanded) → 64px (collapsed, icon-only)
Background: #0A0A16 with border-right: 1px solid var(--border-subtle)
Backdrop-filter: blur(24px)

Top Section:
  ├── Atlas logo (24×24 icon + "Atlas" wordmark, 15px/600)
  │   └── Collapses to icon-only
  └── Vertical nav items (top-down):
      ├── Dashboard      (Lucide: LayoutDashboard)
      ├── Subjects       (Lucide: BookOpen)
      ├── Past Papers    (Lucide: FileText)
      ├── Notes          (Lucide: StickyNote)
      ├── Progress       (Lucide: TrendingUp)
      ├── Achievements   (Lucide: Trophy)
      └── Settings       (Lucide: Settings2)

Bottom Section:
  ├── XP Widget
  │   ├── Level badge (circular, accent-purple, 32px)
  │   ├── "Level 4 · Scholar"  (12px/500, text-secondary)
  │   └── XP progress bar (thin, 4px height, purple fill)
  │
  └── User avatar (32px circle) + name (truncated)

Nav Item Anatomy:
  Height: 40px
  Padding: 0 12px
  Border-radius: radius-sm (8px)
  Gap: 12px (icon + label)
  Icon: 18px, text-muted (inactive) → text-primary (active)
  Label: 14px/500
  Active state:
    Background: rgba(91,127,255,0.10)
    Left border: 2px solid accent-blue
    Icon + label: text-primary
  Hover: background rgba(255,255,255,0.04), transition 0.14s

Animation:
  - Sidebar collapse: width animates via layout animation, 0.28s EASE_DEFAULT
  - Nav items fade label out when collapsing (opacity 0, 0.14s)
  - Active indicator slides between items (layout animation, SPRING_SNAPPY)
```

---

### 0.8 App Shell — Topbar

```
Height: 56px
Background: rgba(8,8,16,0.75) with backdrop-filter: blur(20px)
Border-bottom: 1px solid var(--border-subtle)
Position: sticky top-0, z-index: 40

Left: Page title (18px/600, text-primary) + breadcrumb (if nested)
Center: —
Right (gap-16):
  ├── ⌘K Command palette trigger
  │     [Icon: Command, 16px] [text-secondary, 13px "⌘K"]
  │     Background: bg-surface, border: border-subtle, radius-sm
  │     Width: 140px
  │
  ├── Streak badge
  │     [🔥 icon, 16px] [count: 18px/700, accent-yellow]
  │     Tap: expands to streak detail popover
  │
  └── Avatar (32px circle, ring: 2px accent-purple)
        Tap: profile quick menu
```

---

### 0.9 Skeleton Loader System

All skeletons use:
- Background: `rgba(255,255,255,0.05)`
- Shimmer: animated gradient from left to right, 1.8s loop
- Border-radius: matches the element it replaces
- Never show for < 150ms (threshold to prevent flash)

---

## 1. Landing Page

**Route**: `/`  **Auth**: Public  **Layout**: Full-bleed, no sidebar

---

### 1.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  TOPBAR (transparent → blur on scroll)                        │
│  [Atlas Logo]               [Log In]  [Get Started →]        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  HERO SECTION                              (100vh min)        │
│  ────────────────────────────────────────────────────────    │
│                                                               │
│         A-Level revision.                                     │
│         Finally intelligent.                                  │
│                                                               │
│         [Subheadline]                                         │
│         [Get Started with Google]  [Watch demo →]            │
│                                                               │
│         [Animated dashboard preview — floating card]         │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│  SOCIAL PROOF BAR                                            │
│  "Trusted by 2,000+ A-Level students · CIE · OCR · Edexcel" │
├──────────────────────────────────────────────────────────────┤
│  FEATURES (3-column grid)                                    │
│  Mission Engine · Readiness Score · Past Paper Tracking      │
├──────────────────────────────────────────────────────────────┤
│  PRODUCT PREVIEW (scrolling feature showcase)               │
├──────────────────────────────────────────────────────────────┤
│  TESTIMONIALS (3 cards)                                      │
├──────────────────────────────────────────────────────────────┤
│  CTA SECTION                                                 │
│  "Start your revision mission today."  [Get Started]        │
├──────────────────────────────────────────────────────────────┤
│  FOOTER                                                      │
└──────────────────────────────────────────────────────────────┘
```

---

### 1.2 Topbar

```
Position: fixed top-0, full-width
Height: 60px
Background: transparent → rgba(8,8,16,0.85) blur(24px) on scroll
Transition: background + backdrop-filter, 0.28s EASE_OUT
Padding: 0 48px (desktop), 0 20px (mobile)

Left: [Atlas wordmark] — 20px/700, text-primary
      [Logo icon: 20×20, accent-blue gradient]

Right:
  - "Log In" → 14px/500, text-secondary, hover: text-primary
  - "Get Started" → Primary button (see Button spec)
    Padding: 10px 20px, radius-full
    Background: linear-gradient(135deg, #5B7FFF, #9D6EF8)
    Text: 14px/600, white
    Box-shadow: 0 0 24px rgba(91,127,255,0.4)
    Hover: brightness(1.1), shadow intensifies
```

---

### 1.3 Hero Section

```
Layout: Centered column, max-width 720px, text-center
Vertical padding: 120px top, 80px bottom
Background: radial gradient from rgba(91,127,255,0.08) at center-top → transparent

EYEBROW TAG:
  "✦ Revision Operating System"
  Font: 12px/600, letter-spacing: 0.08em, UPPERCASE
  Color: accent-blue
  Background: rgba(91,127,255,0.10)
  Border: 1px solid rgba(91,127,255,0.25)
  Padding: 4px 12px, radius-full
  Margin-bottom: 24px

HEADLINE:
  Line 1: "A-Level revision."
  Line 2: "Finally intelligent."
  Font: display-xl (56px/700), letter-spacing: -0.04em
  Color: text-primary
  Line 2 uses gradient text:
    background: linear-gradient(135deg, #5B7FFF 0%, #9D6EF8 50%, #38D9F5 100%)
    -webkit-background-clip: text
    -webkit-text-fill-color: transparent

SUBHEADLINE:
  "Atlas answers one question every day:
   What should I study to maximise my exam performance?"
  Font: body-lg (16px/400), line-height: 1.7
  Color: text-secondary
  Max-width: 480px
  Margin: 24px auto

BUTTON ROW (gap-16, centered):
  Primary: "Get Started with Google"
    Height: 48px, padding: 0 24px, radius-full
    Background: white, color: #08081A
    Icon: Google SVG, 18px
    Font: 15px/600
    Box-shadow: 0 4px 24px rgba(255,255,255,0.15)
    Hover: scale(1.02), SPRING_SNAPPY

  Secondary: "Watch 2-min demo →"
    Height: 48px, padding: 0 20px
    Background: transparent
    Border: 1px solid var(--border-default)
    Color: text-secondary, hover: text-primary
    Icon: Lucide Play, 16px (accent-blue)

HERO DASHBOARD PREVIEW:
  Floating card, margin-top: 64px
  Width: 900px, max-width: 90vw
  Perspective: 1000px, slight 3D tilt (rotateX: -6deg) on load
  Background: bg-surface
  Border: 1px solid border-default
  Border-radius: radius-xl (24px)
  Box-shadow: shadow-xl, 0 0 80px rgba(91,127,255,0.12)
  Contains: Static screenshot of Dashboard page
  Overlaid floating cards animate in (Mission card, Streak, Score ring)

BACKGROUND ELEMENTS:
  - Radial gradient orb: 600px, accent-blue at 5% opacity, top-center
  - Grid pattern: 1px lines at rgba(255,255,255,0.03), 40px cells
  - Two abstract blurred orbs: purple and cyan, 300px, blur(120px), absolute
```

---

### 1.4 Feature Cards (3-column grid)

```
Grid: 3 columns, gap-24, margin-top: 80px
Max-width: 1100px, centered

Each card:
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-lg (16px)
  Padding: 32px
  Hover: border-color → border-default, translateY(-4px)
  Transition: all 0.24s EASE_DEFAULT

  ┌─────────────────────────────────┐
  │  [Icon: 40×40, in colored ring] │
  │                                 │
  │  CARD TITLE (18px/600)          │
  │  Card description (14px/400,    │
  │  text-secondary, line-height    │
  │  1.6, max 2 lines)              │
  └─────────────────────────────────┘

Cards:
  1. Icon: Crosshair (accent-blue) — "Daily Mission Engine"
     "Tells you exactly what to study today based on your exam dates and weak spots."

  2. Icon: Activity (accent-green) — "Exam Readiness Score"
     "A live 0–100% score across notes, paper accuracy, and confidence. Know where you stand."

  3. Icon: BarChart2 (accent-cyan) — "Past Paper Intelligence"
     "Log papers, tag weak questions, watch Atlas route tomorrow's mission accordingly."

  4. Icon: Flame (accent-yellow) — "Streak & XP System"
     "Daily streaks, XP, levels, and achievements to keep you in the habit."

  5. Icon: FileText (accent-purple) — "Google Docs Integration"
     "Link your notes docs directly to chapters. One click to open, always in context."

  6. Icon: Target (accent-orange) — "Progress vs Target"
     "See if you're on track to hit your target grade with a clear visual chart."
```

---

### 1.5 Animations (Landing)

```
HERO ENTRANCE SEQUENCE (on page load):
  t=0.0s  Eyebrow tag fades in (fadeInUp, 0.28s)
  t=0.1s  Headline line 1 fades in (fadeInUp, 0.28s)
  t=0.2s  Headline line 2 fades in (fadeInUp, 0.28s)
  t=0.3s  Subheadline fades in
  t=0.4s  Button row fades in
  t=0.6s  Dashboard preview rises from y+40 → y=0 (0.7s, EASE_DEFAULT)
          simultaneously: rotateX eases from -15deg → -6deg
  t=1.2s  Floating overlay cards appear one by one (stagger 0.1s)

SCROLL-DRIVEN:
  Dashboard card: parallax at 0.4x scroll rate
  Feature cards: fadeInUp triggered at 60% viewport entry (IntersectionObserver)
  Stagger: 0.08s between feature cards

BACKGROUND ORBS:
  Slow drift: keyframe animation, 20s loop, translateX ±30px + translateY ±20px
  Opacity: pulsing between 0.6 and 1.0, 8s ease-in-out loop
```

---

### 1.6 Mobile Version

```
Breakpoint: < 768px

Topbar: Logo only + hamburger menu icon
Hero:
  - Padding: 80px 24px 48px
  - Headline font: 36px (display-xl → 36px on mobile)
  - Dashboard preview: flat (no 3D tilt), full-width, scrollable
  - Buttons: stacked column, full-width
Feature grid: 1 column (cards stacked)
Testimonials: horizontal scroll (scroll-snap)
CTA section: full padding 48px 24px
```

---

## 2. Login Page

**Route**: `/login`  **Auth**: Public  **Layout**: Split-screen

---

### 2.1 Layout

```
┌───────────────────────┬───────────────────────────────────┐
│                       │                                   │
│   LEFT PANEL          │   RIGHT PANEL                     │
│   (40% width)         │   (60% width)                     │
│                       │                                   │
│   Background:         │   Background: bg-base             │
│   bg-surface with     │   Centered sign-in form           │
│   animated gradient   │                                   │
│                       │                                   │
│   Atlas logo          │   [Logo]                          │
│   + product tagline   │   "Welcome back"                  │
│   + feature bullets   │   "Sign in to Atlas"              │
│   + testimonial quote │                                   │
│                       │   [Continue with Google]          │
│                       │                                   │
│                       │   Terms + Privacy                 │
│                       │                                   │
└───────────────────────┴───────────────────────────────────┘
```

---

### 2.2 Left Panel (Brand Panel)

```
Background: bg-surface
Border-right: 1px solid border-subtle
Padding: 48px

Animated background:
  Mesh gradient: 3 color stops animating slowly
  Colors: accent-blue (8%), accent-purple (6%), transparent
  Animation: 12s loop, background-position shifts

Content (vertical center):
  Atlas logo: 32×32 + wordmark (22px/700)
  Tagline: "Your Revision Operating System"
    Font: heading-md (18px/400), text-secondary, margin-top: 12px

  Feature list (margin-top: 48px):
    ├── ✓ Daily missions tailored to your syllabus
    ├── ✓ Live Exam Readiness Score
    ├── ✓ Past paper accuracy tracking
    └── ✓ Google Docs integration
    Font: 14px/400, text-secondary
    Check icons: accent-green, 16px, CircleCheck (Lucide)
    Gap between items: 16px

  Bottom: Testimonial quote card (margin-top: auto)
    Background: rgba(255,255,255,0.04)
    Border: 1px solid border-subtle
    Border-radius: radius-md
    Padding: 20px
    Quote: "Atlas turned my chaotic revision into a daily routine.
            I went from predicted B to A* in 3 months."
    Font: 14px/400, text-secondary, italic
    Author: "— Priya, A2 Mathematics, June 2026"
    Font: 12px/600, text-muted, margin-top: 8px
```

---

### 2.3 Right Panel (Sign-in Form)

```
Padding: 48px
Max-width: 380px, centered in panel

Atlas logo mark (32px, centered, margin-bottom: 32px)

Heading: "Welcome to Atlas"
  Font: heading-xl (30px/600), text-primary, text-center
  Margin-bottom: 8px

Sub: "Sign in to continue your revision mission"
  Font: body-md, text-secondary, text-center
  Margin-bottom: 40px

GOOGLE SIGN-IN BUTTON:
  Width: 100%
  Height: 52px
  Background: rgba(255,255,255,0.07)
  Border: 1px solid border-default
  Border-radius: radius-sm (8px)
  Content: [Google Logo SVG, 20px] + "Continue with Google" (15px/600, text-primary)
  Gap: 12px
  Hover:
    Background: rgba(255,255,255,0.10)
    Border: 1px solid border-strong
    Box-shadow: shadow-sm
  Active: scale(0.98)
  Transition: all 0.14s

DIVIDER: "or" with lines — displayed if more providers added later

TERMS TEXT:
  "By continuing, you agree to Atlas's Terms of Service
   and Privacy Policy."
  Font: 12px/400, text-muted, text-center
  Margin-top: 24px
  Links: accent-blue, hover underline
```

---

### 2.4 Loading State (Post-click)

```
After "Continue with Google" click:
  1. Button text → "Redirecting..." (0.14s fade)
  2. Google logo → spinner (16px, Lucide Loader2, spin animation)
  3. Button becomes non-interactive (pointer-events: none)
  4. Subtle shimmer on button background
```

---

### 2.5 Error State

```
If OAuth fails or is cancelled:
  Toast notification (top-right):
    Background: bg-elevated
    Border-left: 3px solid accent-red
    Icon: AlertCircle (red, 16px)
    Text: "Sign-in failed. Please try again."
    Duration: 4s auto-dismiss
    Dismiss button: ✕

  Button returns to normal state
```

---

### 2.6 Animations (Login)

```
PAGE ENTRANCE:
  Left panel: slides in from left (x: -24 → 0, opacity: 0 → 1, 0.4s EASE_DEFAULT)
  Right panel: fades in (opacity: 0 → 1, 0.35s, delay: 0.1s)
  Form elements: stagger fadeInUp, 0.06s between each

BACKGROUND MESH:
  Continuous animation: 3 gradient orbs drift slowly, 15s loop
  Each orb: 400px, blur(100px), opacity 0.12–0.20

MOBILE:
  Split layout collapses to single column
  Left panel: hidden (brand info moved to small header above form)
  Right panel: full screen, padding: 40px 24px
```

---

## 3. Dashboard — Mission Control

**Route**: `/dashboard`  **Auth**: Protected  **Layout**: App Shell

---

### 3.1 Layout Overview

```
[SIDEBAR 240px] + [MAIN CONTENT]

Main content padding: 32px
Max-width: 1200px

┌─────────────────────────────────────────────────────────────┐
│  TOPBAR                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GREETING ROW                             [Date + Session]  │
│  "Good morning, Alex 👋"                                    │
│                                                             │
├──────────────────────────────┬──────────────────────────────┤
│  MISSION CARD                │  RIGHT COLUMN               │
│  (large, 60% width)          │  ├── Readiness Score Ring   │
│                              │  ├── Streak Widget          │
│                              │  └── XP Progress            │
├──────────────────────────────┴──────────────────────────────┤
│  SUBJECT HEALTH GRID                                        │
│  [Math] [Physics] [Chemistry] [Economics] [+ Add Subject]   │
├─────────────────────────────────────────────────────────────┤
│  BOTTOM ROW                                                 │
│  [Recent Activity Feed]         [Quick Actions]             │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.2 Greeting Row

```
Margin-bottom: 32px

Greeting:
  "Good morning, Alex 👋"  (adjusts based on time of day)
  Font: heading-xl (30px/600), text-primary

Sub:
  "You have 3 missions today · 42 days until Mathematics exam"
  Font: body-md (14px), text-secondary

Right side: Date chip
  "Friday, 4 July 2026"
  Font: 13px/500, text-muted
  Background: bg-surface
  Border: 1px solid border-subtle
  Padding: 6px 14px, radius-full
```

---

### 3.3 Mission Card (Primary CTA)

```
Width: ~62%, min-height: 280px
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg (16px)
Padding: 28px 32px
Box-shadow: shadow-md

HEADER:
  Left: [Crosshair icon, 16px, accent-blue] + "TODAY'S MISSION"
    Font: 11px/600, letter-spacing: 0.06em, UPPERCASE, text-secondary
  Right: Mission count chip "3 of 3"
    Font: 12px/500, text-muted, bg-elevated, px-8, radius-full

MISSION LIST (gap-16, margin-top: 24px):
  Each mission row:
    ┌───────────────────────────────────────────────────────┐
    │  [Status indicator]  Mission title         [XP badge] │
    │                      Mission description              │
    │                      [Complete button]    [Skip →]   │
    └───────────────────────────────────────────────────────┘

  Status indicator: 20×20 circle
    - Pending: border-2 border-default, empty
    - Completed: accent-green fill, CheckCircle icon inside
    - Skipped: text-muted fill, X inside

  Mission title: 15px/600, text-primary
  Mission description: 13px/400, text-secondary, margin-top: 2px
  Example: "Complete Chapter 5 — Integration" / "A2 Mathematics"

  XP badge:
    "+50 XP"
    Font: 12px/700, accent-yellow
    Background: rgba(255,209,102,0.10)
    Border: 1px solid rgba(255,209,102,0.20)
    Padding: 3px 10px, radius-full

  "Complete" button:
    Height: 32px, padding: 0 16px, radius-sm
    Background: accent-green (when pending)
    Color: #081A10 (dark text on green)
    Font: 13px/600
    Hover: brightness(1.1)

  "Skip" button:
    Font: 13px/400, text-muted, hover: text-secondary, underline

COMPLETED STATE (all missions done):
  Background changes to: linear-gradient(135deg, rgba(18,232,138,0.06), rgba(91,127,255,0.04))
  Border: 1px solid rgba(18,232,138,0.20)
  Center content:
    ✓ Large checkmark animation (Lottie or CSS)
    "All missions complete!"  (heading-md, text-primary)
    "+175 XP earned today"   (body-sm, text-secondary)

CARD FOOTER (border-top: 1px solid border-subtle, margin-top: 24px, padding-top: 16px):
  "Generated by Mission Engine based on your exam dates & weak topics"
  Font: 12px/400, text-muted
  [Lucide: Zap, 12px, text-muted]
```

---

### 3.4 Exam Readiness Score Ring

```
Width: 100% of right column (~36%)
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 28px

TITLE: "Exam Readiness"
Font: 11px/600, letter-spacing: 0.06em, UPPERCASE, text-secondary

RING (Recharts RadialBarChart):
  Outer diameter: 160px
  Ring thickness: 14px
  Background ring: rgba(255,255,255,0.06)
  Fill: conic-gradient equivalent (arc colored by score range):
    0–40%:  accent-red
    40–70%: accent-orange
    70–90%: accent-yellow
    90%+:   accent-green

  Center text:
    Score: "67%" — 32px/700, text-primary, font: mono-md
    Label: "Good" — 12px/500, accent-orange (matches range)

LEGEND (3 rows, gap-8, margin-top: 20px):
  ├── Notes: [bar 40px, accent-blue] "78%" (right-aligned, 13px/600)
  ├── Papers: [bar 40px, accent-green] "61%" (13px/600)
  └── Confidence: [bar 40px, accent-purple] "55%" (13px/600)
  Font labels: 13px/400, text-secondary

DAYS CHIP (bottom):
  "42 days until first exam"
  Font: 12px/500, text-muted
  [Lucide: Calendar, 12px]
```

---

### 3.5 Streak Widget

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 20px 24px

Layout: horizontal, space-between

Left:
  🔥 Flame icon (24px, accent-yellow, animated flicker)
  Count: "18" — 32px/700, text-primary, font: JetBrains Mono
  Label: "Day Streak" — 12px/500, text-secondary

Right (7-day dots):
  7 circles in a row, gap-6
  Each 10px diameter:
    - Studied: accent-green fill
    - Missed: rgba(255,255,255,0.08) fill
    - Today: pulsing accent-yellow fill (1.5s pulse animation)

HOVER state: Shows tooltip "You last studied 2 hours ago"
```

---

### 3.6 XP Progress Bar

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 20px 24px

Top row:
  Left: Level badge circle (28px, gradient fill accent-purple, "4" inside, 13px/700, white)
        "Level 4 · Scholar" (13px/600, text-primary)
  Right: "1,240 / 1,400 XP" (12px/500, text-muted, mono)

Progress bar (margin-top: 12px):
  Height: 6px, border-radius: full
  Background: rgba(255,255,255,0.08)
  Fill: linear-gradient(90deg, #9D6EF8, #5B7FFF)
  Fill-width: (1240/1400 × 100)% = 88.6%
  Animated: on load, width animates from 0 to current value (0.8s EASE_DEFAULT)

Sub text: "160 XP to Level 5" (11px/400, text-muted)
```

---

### 3.7 Subject Health Grid

```
Margin-top: 32px
Label: "SUBJECT HEALTH" (11px/600, text-muted, letter-spacing: 0.06em)

Grid: auto-fit columns, min 220px, gap-16

Each subject card:
  Background: bg-surface
  Border: 1px solid border-subtle → hover: 1px solid [subject-color] at 30%
  Border-radius: radius-md (12px)
  Padding: 20px
  Transition: border-color 0.18s, box-shadow 0.18s

  TOP ROW:
    Left: Subject color dot (8px circle) + Subject name (14px/600, text-primary)
    Right: Grade target badge "A*" (10px/700, bg-surface, border border-subtle, radius-full)

  METRICS (margin-top: 16px, gap-12):
    ├── Notes: [inline bar, 4px height, 90px wide] "12/20 ch" (12px/500, text-secondary)
    ├── Papers: [inline bar, 4px height] "Avg 74%" (12px/500, text-secondary)
    └── Readiness: [inline bar, 4px height] "62%" (12px/500, text-secondary)
    Bar fills use subject color

  BOTTOM: "42 days" (12px/400, text-muted) + calendar icon

"+ Add Subject" card:
  Same size, dashed border: 1px dashed border-default
  Center: [Plus icon, 20px, text-muted] + "Add Subject" (13px/500, text-muted)
  Hover: border-color → border-strong, text-secondary
```

---

### 3.8 Recent Activity Feed

```
Width: 55%
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Recent Activity" (15px/600, text-primary)

Feed items (gap-0, divider between):
  Each item: 48px height, padding: 0 8px
  Layout: [icon 32px circle] [text column] [time + XP]

  Icon types:
    - Notes complete: CheckCircle, accent-green background at 15%
    - Paper attempt: FileText, accent-cyan background at 15%
    - Achievement: Trophy, accent-yellow background at 15%
    - Streak: Flame, accent-orange background at 15%

  Text: "Completed Chapter 5 notes · A2 Mathematics"
    Font: 13px/400, text-primary
  Sub: "Integration · Notes Complete"
    Font: 12px/400, text-muted

  Right: "+50 XP" (12px/600, accent-yellow) + "2h ago" (11px/400, text-muted)

Empty state:
  Center: [Lightning icon, 32px, text-muted]
  Text: "No activity yet today"
  Sub: "Complete a mission to see your activity here"
  Font: 14px/400, text-secondary (center-aligned)
```

---

### 3.9 Quick Actions Panel

```
Width: ~42%
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Quick Actions" (15px/600, text-primary)

Actions grid (2×2, gap-12, margin-top: 16px):
  Each action button:
    Background: bg-elevated
    Border: 1px solid border-subtle
    Border-radius: radius-md
    Padding: 16px
    Width: 100%
    Text-align: left
    Hover: border-color → border-default, translateY(-2px)
    Transition: 0.18s

    Icon (24px, colored): top-left
    Label (13px/600, text-primary, margin-top: 12px)
    Sub (12px/400, text-muted)

  Actions:
    [BookPlus] Log Past Paper / "Track your latest attempt"
    [CheckSquare] Complete Chapter / "Mark notes as done"
    [StickyNote] Link Notes Doc / "Connect a Google Doc"
    [Target] View Weak Topics / "See where to focus"
```

---

### 3.10 Dashboard Loading State

```
Sequence (150ms threshold before showing skeletons):

Greeting row: text skeleton (200px wide + 280px wide), height 24px + 16px
Mission card: full card skeleton, inner rows with 3 skeleton mission items
Readiness ring: circular skeleton (160px), 3 legend bars
Streak widget: horizontal skeleton
XP bar: single bar skeleton
Subject grid: 4 skeleton cards (same dimensions)
Activity feed: 5 skeleton rows

All skeletons shimmer left-to-right, 1.8s loop
Stagger: 0.04s between each skeleton group appearing
```

---

### 3.11 Dashboard Empty State (New User, Day 1)

```
Mission card shows:
  Illustration: abstract compass/target SVG (80px, accent-blue)
  "Your first mission is being generated"
  Sub: "Add at least one subject to get started"
  Button: "Add a Subject →" (primary, accent-blue)

Subject grid: only shows the "+ Add Subject" card
Activity feed: welcome message
  "Welcome to Atlas! Complete your first mission to earn XP and start your streak."
```

---

### 3.12 Animations (Dashboard)

```
PAGE ENTRANCE (staggered layout animation):
  t=0.00s  Greeting row: fadeInUp (0.24s)
  t=0.06s  Mission card: fadeInUp + scaleIn from 0.97 (0.32s)
  t=0.08s  Right column: fadeInUp (0.28s)
  t=0.14s  Subject health grid: staggerChildren 0.04s per card
  t=0.22s  Bottom row: fadeInUp

MISSION COMPLETION SEQUENCE:
  1. User taps "Complete"
  2. Status circle: scale(0) → scale(1) with SPRING_BOUNCE (0.35s)
     Color transitions pending → green
  3. XP badge: +50 XP floats upward (y: 0 → -30, opacity: 1 → 0, 0.6s)
  4. XP bar: fills to new value (0.5s EASE_DEFAULT)
  5. Streak dot for today: pulses to green (scale 1 → 1.4 → 1, 0.3s)
  6. If all missions done:
     Card background transitions (0.6s)
     Large ✓ draws itself (SVG path animation, 0.5s)
     Confetti particles burst (60 particles, Framer Motion variants)
     "All missions complete!" text fades in (0.28s)

READINESS RING:
  On load: arc sweeps from 0 to target value (1.0s EASE_DEFAULT, delay 0.4s)

STREAK WIDGET:
  Flame icon: subtle flicker keyframe (opacity: 0.85 → 1.0 → 0.85, 2s loop)
  Today's dot: glow pulse (box-shadow intensity, 1.5s ease-in-out loop)
```

---

### 3.13 Mobile Dashboard

```
Breakpoint: < 768px
Layout: Single column, padding: 0 16px

Order:
  1. Greeting (compact: 20px/600 heading)
  2. Mission card (full width, compact padding 20px)
  3. Streak + XP (2-column row, each 50%)
  4. Readiness ring (full width, ring smaller: 120px)
  5. Subject health (horizontal scroll, each card 200px wide, scroll-snap)
  6. Quick actions (2×2 grid, full width)
  7. Activity feed (full width)

Sidebar: Hidden → replaced by bottom tab bar
  Tab bar: fixed bottom-0, height 60px + safe-area-inset
  Tabs: Dashboard | Subjects | Papers | Progress | More
  Background: rgba(8,8,16,0.92), backdrop-blur(20px)
  Border-top: 1px solid border-subtle
  Each tab: icon (20px) + label (10px/500)
  Active: accent-blue icon + label
```

---

## 4. Subjects Overview

**Route**: `/subjects`  **Auth**: Protected  **Layout**: App Shell

---

### 4.1 Layout

```
Padding: 32px
Max-width: 1200px

ROW 1: Page header
ROW 2: Stats summary bar
ROW 3: Subject cards grid
ROW 4 (if any): Recently reviewed chapters
```

---

### 4.2 Page Header

```
Left:
  Title: "Subjects" (heading-xl, 30px/600, text-primary)
  Sub: "5 subjects · 142 chapters tracked"
  Font: body-md, text-secondary, margin-top: 4px

Right:
  "Add Subject" button
  Icon: Plus (16px)
  Height: 40px, padding: 0 20px, radius-sm
  Background: accent-blue
  Font: 14px/600, white
  Box-shadow: glow-blue
  Hover: brightness(1.1), scale(1.02)
```

---

### 4.3 Stats Summary Bar

```
4 stat chips in a row, gap-16, margin: 24px 0

Each chip:
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-md
  Padding: 14px 20px
  Layout: [icon 16px, colored] [value 22px/700] [label 12px text-secondary]

Stats:
  ├── [BookOpen, accent-blue]   "142"   "Chapters Tracked"
  ├── [CheckCircle, accent-green] "89"  "Notes Complete"
  ├── [FileText, accent-cyan]  "34"    "Papers Logged"
  └── [TrendingUp, accent-purple] "67%" "Overall Readiness"
```

---

### 4.4 Subject Cards Grid

```
Grid: 3 columns on desktop, gap-20
Each card: min-height 260px

SUBJECT CARD:
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-lg (16px)
  Padding: 24px
  Overflow: hidden
  Position: relative

  ACCENT BAR:
    Position: absolute, top-0, left-0, right-0
    Height: 3px
    Background: [subject-color]

  TOP ROW:
    [Subject icon: 36×36, rounded-8, bg: subject-color at 15%]
    [Subject name: 16px/700, text-primary]
    [Subject code: 12px/500, text-muted]
    Right: Grade target "A*"
      Background: subject-color at 10%
      Border: 1px solid subject-color at 30%
      Color: subject-color
      Font: 11px/700, padding: 2px 8px, radius-full

  EXAM DATE (margin-top: 16px):
    [Calendar icon, 13px, text-muted]
    "42 days · 14 June 2026"
    Font: 13px/500, text-secondary
    If < 30 days: accent-orange
    If < 14 days: accent-red + subtle pulse animation

  PROGRESS SECTION (margin-top: 20px):
    Row 1: Notes progress
      "Notes"  (12px/400, text-muted)
      "[===        ] 12/20" (progress bar 4px, subject-color + count 12px/600)

    Row 2: Past papers
      "Papers"
      "[=====      ] Avg 74%"

    Row 3: Readiness
      "Readiness"
      "[========   ] 62%"

    All bars: full-width, 4px height, radius-full
    Background: rgba(255,255,255,0.07)

  FOOTER (border-top: 1px solid border-subtle, margin-top: 20px, padding-top: 14px):
    [Last studied: "2 days ago"]  (12px/400, text-muted)
    [→ View Chapters] link (12px/600, accent-blue, hover: underline)

  HOVER:
    Box-shadow: 0 8px 32px rgba(0,0,0,0.4), glow from subject color at 15%
    Transform: translateY(-3px)
    Border: 1px solid [subject-color] at 40%
    Transition: all 0.22s EASE_DEFAULT
```

---

### 4.5 Add Subject Dialog

```
Trigger: "Add Subject" button
Modal: centered, width 520px
Background: bg-elevated
Border: 1px solid border-default
Border-radius: radius-xl (24px)
Padding: 32px
Backdrop: rgba(0,0,0,0.6) blur(8px)

HEADER:
  "Add a Subject" (heading-lg, 22px/600)
  Close button: ✕ (top-right, 32px, hover bg-surface)

SEARCH:
  Input (full-width, height 44px):
    Placeholder: "Search CAIE subjects... e.g. Mathematics"
    Icon: Search (16px, left padding)
    Background: bg-surface
    Border: 1px solid border-default (focus: accent-blue)
    Border-radius: radius-sm

RESULTS LIST (max-height: 320px, scrollable):
  Each result row (40px height, padding: 0 12px):
    [Subject icon 24px] [Subject name 14px/500] [Subject code 12px text-muted]
    Hover: bg-surface
    Selected: bg-elevated + checkmark icon (accent-green, right)

SETTINGS (once subject selected):
  Target grade: segmented control
    A* | A | B | C (each 40px, radius-sm, accent-blue when selected)
  Exam date: date input (same style as search)
  Priority: star rating 1–5

Footer:
  "Cancel" (text button) + "Add Subject" (primary button, disabled until selection)

ENTRANCE ANIMATION:
  Scale: 0.92 → 1.0
  Opacity: 0 → 1
  Duration: 0.24s, EASE_DEFAULT
  Backdrop fades in: 0.20s

EXIT ANIMATION:
  Reverse of above
```

---

### 4.6 Loading State

```
Cards: 3 skeleton cards per row
Each: same dimensions as real card
Inner elements: staggered skeletons (top bar, title, 3 progress bars)
```

---

### 4.7 Empty State

```
Center of grid:
  Illustration: abstract open book (SVG, 100px, accent-blue at 60%)
  "No subjects yet"  (heading-md, text-primary)
  "Add your first subject to begin tracking your revision"
  (body-md, text-secondary)
  "Add Your First Subject →"  (primary button)
```

---

### 4.8 Mobile Subjects

```
Grid: 1 column (cards stacked)
Card padding: 20px
Stats bar: 2×2 grid
Add Subject button: full-width, fixed bottom-16 (above tab bar)
```

---

## 5. Subject Detail

**Route**: `/subjects/[subjectId]`  **Auth**: Protected  **Layout**: App Shell

---

### 5.1 Layout

```
HERO HEADER SECTION (full-width colored band)
  ├── Back nav + breadcrumb
  ├── Subject name + code
  ├── Exam date countdown
  └── 4 subject stats

CHAPTER LIST SECTION
  ├── Filter/sort controls
  └── Chapter rows (sorted by number)

RELATED PAST PAPERS STRIP
```

---

### 5.2 Hero Header

```
Background: radial gradient from subject-color at 10% → transparent
Border-bottom: 1px solid border-subtle
Padding: 32px 40px

BREADCRUMB:
  [ChevronLeft, 14px] "Subjects" → "Mathematics"
  Font: 13px/400, text-muted
  Hover "Subjects": text-secondary

SUBJECT IDENTITY ROW (margin-top: 16px):
  Left:
    [Subject icon: 48×48, bg: subject-color at 15%, border-radius: 14px]
    [Subject name: heading-xl (30px/700, text-primary)]
    [Code chip: "9709" — 12px/500, text-muted, bg-elevated, radius-full, px-10]
    Exam label: "A2 · Pure Mathematics"
    Font: 14px/400, text-secondary
  Right:
    Exam countdown card:
      Background: rgba(255,255,255,0.04)
      Border: 1px solid border-subtle
      Border-radius: radius-md
      Padding: 16px 20px
      Center: "42" — 36px/700, text-primary, mono
      Sub: "days until exam"  (12px/500, text-secondary)
      Date: "14 June 2026" (12px/400, text-muted)

STATS ROW (margin-top: 24px, gap-32, horizontal):
  Each stat:
    Value: 22px/700, text-primary
    Label: 12px/400, text-secondary
    Divider: 1px solid border-subtle (vertical, between stats)

  Stats:
    20 Chapters | 12 Complete | 5 Papers Done | Avg 74%
```

---

### 5.3 Chapter List Controls

```
Padding: 24px 40px 0

Left: Chapter count "20 Chapters"  (14px/600, text-primary)
Right (gap-12):
  Filter chips (inline):
    [All] [Not Started] [In Progress] [Complete]
    Active chip: bg-accent-blue, text-white
    Inactive: bg-surface, border-subtle, text-secondary
    Height: 30px, padding: 0 14px, radius-full

  Sort dropdown:
    "Sort: Chapter Number ↓"
    Options: Chapter Number | Confidence | Last Reviewed | Notes Status
    Background: bg-surface, border: border-default
```

---

### 5.4 Chapter Row

```
Each chapter row:
  Height: 64px (collapsed) → auto-expand for details
  Padding: 0 40px
  Border-bottom: 1px solid border-subtle
  Hover: bg-surface (0.12s)
  Cursor: pointer (expands to inline detail)

LAYOUT (horizontal, align-center):

  [Chapter number]
    "Ch. 5"
    Font: 12px/600, text-muted, min-width: 48px

  [Chapter title]
    "Integration"
    Font: 15px/600, text-primary, flex: 1
    Sub: "12 topics"  (12px/400, text-muted)

  [Notes status badge]
    None:         "No Notes"    — text-muted, border-muted, empty circle
    In Progress:  "In Progress" — accent-orange, bg-orange-8%
    Complete:     "Complete"    — accent-green, bg-green-8%
    Padding: 4px 12px, radius-full, font: 11px/600

  [Confidence dots] (5 dots, 8px each, gap-4)
    Filled: accent-purple
    Empty: rgba(255,255,255,0.12)
    Hover: each dot interactive (click to set confidence)
    Tooltip: "Confidence: 3/5"

  [Google Doc link]
    Linked: [ExternalLink icon, 14px, accent-blue] "Notes Doc"
            Font: 12px/500, text-secondary, hover: text-primary, underline
    Not linked: [Link icon, 14px, text-muted] "Link Doc"
                Font: 12px/400, text-muted (dashed bottom-border)

  [Last reviewed]
    "2d ago"  (12px/400, text-muted)
    Never:    "—"

  [Actions menu: ...]
    Dropdown: Edit · Link Doc · Mark Complete · Reset
    Icon: MoreHorizontal, 16px, text-muted

EXPANDED STATE (click row):
  Row expands (layout animation, SPRING_GENTLE)
  Reveals detail panel (padding: 16px 40px 16px 96px):
    Left column:
      Past paper performance for this chapter
      "Last 3 papers: 72%, 68%, 81%"
      Mini bar chart (inline, 3 bars)
    Right column:
      Notes doc preview title (from Google Docs API)
      Quick action: "Open in Google Docs →"
      "Mark as Reviewed Today" button (ghost style)
```

---

### 5.5 Chapter Quick-Edit

```
Inline edit triggered from row actions:
  Right-side drawer slides in (from right edge)
  Width: 360px
  Background: bg-elevated
  Border-left: 1px solid border-default
  Box-shadow: shadow-lg

  Content:
    Chapter title (heading-md)
    Notes status: segmented selector
    Confidence: 1–5 interactive rating
    Google Doc URL: input field with preview
    Notes: textarea (4 rows)
    Actions: "Save Changes" | "Cancel"

  Animation: translateX(100%) → translateX(0), 0.28s EASE_DEFAULT
```

---

### 5.6 Related Papers Strip

```
Margin-top: 40px
Label: "PAST PAPERS FOR THIS SUBJECT"  (11px/600, UPPERCASE, text-muted)

Horizontal scroll (scroll-snap):
  Each paper card: 200px wide, 100px height
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-md
  Padding: 16px

  "9709/12 · May 2023" (13px/600, text-primary)
  "48/80 · 60%" (12px/500, text-secondary)
  Accuracy bar (4px, full-width)
  "3 weeks ago" (11px/400, text-muted)

  "Log New Paper +" card at end (dashed border)
```

---

### 5.7 Loading State

```
Hero: skeleton band (same height as real), contains ghost elements
Chapter rows: 8 skeleton rows, height 64px each, shimmer
```

---

### 5.8 Mobile Subject Detail

```
Hero: compact, 160px height
Stats: 2×2 grid (not horizontal strip)
Chapter list:
  Full-width, reduced padding 0 16px
  Chapter row height: 72px (confidence dots below title)
  Swipe actions: right-swipe → "Complete", left-swipe → "Skip"
Drawer: bottom sheet (not side drawer)
```

---

## 6. Chapter Detail

**Route**: `/subjects/[subjectId]/[chapterId]`  **Auth**: Protected  **Layout**: App Shell

---

### 6.1 Layout

```
Two-column (60/40 split):
  Left: Chapter overview, notes, paper performance
  Right: Sticky action panel + AI hints (future)
```

---

### 6.2 Chapter Header

```
Breadcrumb: Subjects > Mathematics > Chapter 5
Back: [ChevronLeft] "Back to Mathematics" (13px/500, text-secondary)

Title: "Integration"  (heading-xl, 30px/600, text-primary)
Sub: "Chapter 5 · A2 Pure Mathematics · 9709"

STATUS ROW (horizontal, gap-16, margin-top: 16px):
  Notes badge (large version, 28px height)
  Confidence: "Confidence: 3/5" + 5 interactive dots (12px each)
  Last reviewed: [Clock, 12px] "Last reviewed 2 days ago"

HERO STATS (3 inline stats):
  ├── "12" topics in chapter
  ├── "4" paper questions tagged here
  └── "72%" average accuracy on tagged questions
```

---

### 6.3 Notes Panel (Left)

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Notes" (15px/600) + Status badge + "Edit" button

GOOGLE DOC CARD (if linked):
  Background: bg-elevated
  Border: 1px solid border-default
  Border-radius: radius-md
  Padding: 16px
  Left: [Google Docs icon SVG, 24px]
  Middle:
    Doc title (14px/600, text-primary) — from API
    "Last modified: 2 days ago" (12px/400, text-muted)
  Right: [ExternalLink button: "Open →", accent-blue, 13px/600]

NOTES STATUS SELECTOR:
  3 radio cards, horizontal, gap-12:
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  ○  No Notes │ │  ◑ In Prog.  │ │  ● Complete  │
    └──────────────┘ └──────────────┘ └──────────────┘
  Selected: border-subject-color, bg-subject-color-5%
  Height: 52px, padding: 0 16px, border-radius: radius-sm

TOPICS LIST (if available):
  "Topics in this chapter" (13px/600, text-muted)
  Pill list: [Integration by parts] [Substitution] [Reduction formulae]
  Each: text-muted, border-subtle, radius-full, 11px/500, padding: 4px 12px
```

---

### 6.4 Paper Performance Panel (Left)

```
Background: bg-surface (margin-top: 16px)
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Past Paper Performance" (15px/600)

If papers exist:
  Average accuracy: "72%" (32px/700, text-primary) + trend arrow ↑
  "Across 4 questions from 3 papers"

  Mini chart: Recharts BarChart
    3-5 bars (one per paper/session)
    Bar color: subject-color
    Bar background: rgba(255,255,255,0.06)
    X-axis: paper code (11px, text-muted)
    Y-axis: % (hidden, tooltip only)
    Height: 100px

  Questions breakdown:
    "Q5(b) · May 2023 · 4/8 marks (50%)"
    "Q3 · Nov 2022 · 7/8 marks (88%)"
    Font: 13px/400, text-secondary
    Poor (< 60%): accent-red left-border
    Good (≥ 80%): accent-green left-border

If no papers:
  Empty: [FileText icon, 28px, text-muted]
  "No questions tagged to this chapter yet"
  "Log a past paper and tag questions to track performance here."
```

---

### 6.5 Right Action Panel (Sticky)

```
Position: sticky top-80px (below topbar)
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

TITLE: "Chapter Actions" (13px/600, text-muted, UPPERCASE, letter-spacing: 0.06em)

Action buttons (full-width, stacked, gap-10):
  ├── "Mark Notes Complete" — accent-green, 42px
  ├── "Set Confidence Level" — ghost/outline, 42px
  │     Opens inline confidence picker
  ├── "Link Google Doc" — ghost, 42px
  │     Opens URL input inline
  ├── "Mark as Reviewed Today" — ghost, 42px
  └── "Log as Weak Topic" — ghost, accent-red text, 42px

XP REWARD PREVIEW:
  "Completing notes earns +50 XP"
  Font: 12px/400, text-muted
  [Zap icon, 12px, accent-yellow]

MISSION RELEVANCE:
  If chapter is in today's mission:
    Chip: "In Today's Mission" — accent-blue bg at 10%, accent-blue text
    "Completing this earns a mission bonus"
```

---

### 6.6 Mobile Chapter Detail

```
Single column
Right action panel: moved to bottom sticky bar
  "Mark Complete" full-width button (48px) above safe area
  MoreVertical icon for other actions → bottom sheet menu
```

---

## 7. Analytics — Progress

**Route**: `/progress`  **Auth**: Protected  **Layout**: App Shell

---

### 7.1 Layout

```
ROW 1: Page header + time range selector
ROW 2: 4 top-level KPI cards
ROW 3: Progress vs Target chart (full-width)
ROW 4: Two-column — Subject breakdown | Weak topics
ROW 5: Heatmap calendar
```

---

### 7.2 Page Header + Time Range

```
Title: "Analytics" (heading-xl, 30px/600)
Sub: "Track your revision progress towards exam readiness"
Font: body-md, text-secondary

Right: Time range selector
  [7D] [30D] [3M] [All Time]
  Segmented control, 32px height
  Active: bg-accent-blue, text-white, radius-sm
  Inactive: bg-surface, text-secondary
```

---

### 7.3 KPI Cards (4-column grid)

```
Each card:
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-md
  Padding: 20px 24px

  TOP: metric label (12px/500, UPPERCASE, letter-spacing: 0.06em, text-muted)
  CENTER: value (36px/700, text-primary, JetBrains Mono)
  BOTTOM: trend (12px/500)
    ▲ +5% vs last week  (accent-green when positive)
    ▼ -3% vs last week  (accent-red when negative)

Cards:
  ├── Overall Readiness: "67%" + sparkline (mini 40px chart, right)
  ├── Notes Completion: "78%" (89/114 chapters)
  ├── Paper Accuracy: "71%" (Avg across 34 attempts)
  └── Study Streak: "18 days" + flame icon (accent-yellow)
```

---

### 7.4 Progress vs Target Chart

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 28px 32px

HEADER:
  "Progress vs Target"  (15px/600, text-primary)
  Sub: "Your readiness trajectory vs required pace"  (13px/400, text-secondary)

CHART: Recharts LineChart
  Height: 280px
  Lines:
    ├── "Actual Readiness" — solid, accent-blue, 2px, dot: 6px
    └── "Target Pace" — dashed, accent-orange at 60%, 1.5px, no dots
  X-axis: dates (week markers), 11px, text-muted, no line
  Y-axis: 0–100%, 11px, text-muted, grid lines: rgba(255,255,255,0.04)
  Tooltip:
    Background: bg-elevated
    Border: 1px solid border-default
    Border-radius: radius-sm, padding: 8px 12px
    "Week 10 · Actual: 67% · Target: 72%"

CHART LEGEND (below chart, gap-24):
  [Blue line] "Actual" · [Orange dashed] "Target Pace"
  Font: 12px/500, text-secondary

CHART LOADING: skeleton (same dimensions, shimmer)
```

---

### 7.5 Subject Breakdown Chart

```
Width: 55%
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Readiness by Subject" (15px/600)

CHART: Recharts BarChart (horizontal)
  Each subject: one horizontal bar
  Bar color: subject-color
  Bar background: rgba(255,255,255,0.06)
  Bar height: 10px, radius-full
  Values: right-aligned percentage labels

  Layout:
    [Subject name 14px] [════════════════ 67%]
    Gap between rows: 20px
    Sorted: lowest first (prioritise attention)

  Tooltip: "Mathematics · 67% · 42 days left"
```

---

### 7.6 Weak Topics Panel

```
Width: 42%
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER:
  "⚠ Weak Topics"  (15px/600, text-primary)
  [Lucide: AlertTriangle, 16px, accent-orange]

List (gap-0, dividers):
  Each row: 52px height, padding: 0 8px
  Layout: [colored dot] [chapter + subject] [accuracy] [→ Study]

  Dot: 8px, subject-color
  Chapter: 14px/600, text-primary
  Subject: 12px/400, text-muted
  Accuracy: "48%" — 14px/700, accent-red
  Study button: "Study →" (12px/600, accent-blue, hover: underline)

  Rows sorted by lowest accuracy
  Max 5 rows shown, "See all 12 weak topics →" link at bottom

EMPTY STATE:
  [CheckCircle icon, 28px, accent-green]
  "No significant weak spots"
  "Keep it up — your performance across topics looks balanced."
  Font: 14px/400, text-secondary, center
```

---

### 7.7 Activity Heatmap

```
Full-width card (margin-top: 24px)
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px

HEADER: "Study Activity" (15px/600)
Sub: "Each cell = one day. Shade = study intensity." (13px/400, text-muted)

HEATMAP GRID:
  52 columns (weeks) × 7 rows (days)
  Cell: 12×12px, radius: 3px, gap: 3px
  Colors:
    0 sessions:  rgba(255,255,255,0.05)
    1 session:   accent-green at 30%
    2-3 sessions: accent-green at 60%
    4+ sessions: accent-green (full)

  Month labels above columns (12px, text-muted)
  Day labels left of rows (10px, text-muted): M T W T F S S

  Hover: tooltip "5 July · 2 missions completed · +75 XP"

LEGEND (bottom-right):
  Less [□□□□□] More
  Font: 11px/400, text-muted

EMPTY CELLS in future: slightly different shade to show "unplayed" days
```

---

### 7.8 Animations (Analytics)

```
PAGE ENTRANCE:
  KPI cards: staggerChildren 0.06s, fadeInUp
  Charts: fade in, then bars/lines animate from left (0.8s EASE_DEFAULT)

BAR CHART BARS: animate from 0% width → target width (0.7s, stagger 0.08s)
LINE CHART: path draws from left to right (SVG dashoffset animation, 1.2s)
HEATMAP: cells fade in in batches of 10, 0.02s stagger (gives ripple effect)

TIME RANGE CHANGE:
  Chart data updates with crossfade (0.24s) + bar re-animation
```

---

### 7.9 Mobile Analytics

```
Single column
KPI cards: 2×2 grid
Progress chart: full-width, height: 200px
Subject breakdown + Weak topics: stacked
Heatmap: horizontal scroll, last 12 weeks visible
```

---

## 8. Achievements

**Route**: `/achievements`  **Auth**: Protected  **Layout**: App Shell

---

### 8.1 Layout

```
ROW 1: Page header + XP/Level hero
ROW 2: Level card (large)
ROW 3: Achievement badge grid
ROW 4: XP history feed
```

---

### 8.2 Page Header

```
Title: "Achievements"  (heading-xl, 30px/600)
Sub: "Your revision journey, quantified"
Font: body-md, text-secondary
```

---

### 8.3 Level Hero Card

```
Full-width card
Background: linear-gradient(135deg, rgba(157,110,248,0.12), rgba(91,127,255,0.08))
Border: 1px solid rgba(157,110,248,0.25)
Border-radius: radius-xl (24px)
Padding: 40px 48px

Layout: horizontal, space-between

LEFT:
  Level badge: 80×80px circle
    Background: linear-gradient(135deg, #9D6EF8, #5B7FFF)
    Border: 3px solid rgba(157,110,248,0.5)
    Box-shadow: glow-purple (0 0 40px rgba(157,110,248,0.4))
    Number: 48px/800, white, JetBrains Mono
    Margin-right: 24px

  Level title: "Level 4 · Scholar"
    Font: heading-xl (30px/700, text-primary)
  Total XP: "1,240 XP earned"
    Font: 15px/400, text-secondary, margin-top: 4px
  Next level: "160 XP to Level 5 · Analyst"
    Font: 13px/400, text-muted, margin-top: 8px

RIGHT:
  XP progress arc (large):
    Radial progress, 140px diameter, 10px ring
    Fill: gradient purple → blue
    Center: "89%" (20px/600, text-primary)
    Label: "to next level"

PROGRESS BAR (full-width, below above):
  Height: 8px, radius-full, margin-top: 24px
  Background: rgba(255,255,255,0.08)
  Fill: linear-gradient(90deg, #9D6EF8, #5B7FFF)
  Fill: 88.6% (1240/1400)
  Animated on load: 0 → value in 0.9s EASE_DEFAULT

MILESTONE markers on bar:
  Small ticks at 25%, 50%, 75% with label below
  "Level 3" · "Level 4" (current, glowing dot) · "Level 5"
```

---

### 8.4 Achievement Badge Grid

```
Section header:
  "ACHIEVEMENTS" (11px/600, UPPERCASE, text-muted, letter-spacing: 0.06em)
  Badge count: "12 / 28 unlocked" (right-aligned, 13px/500, text-muted)

Filter tabs (below header, margin: 16px 0):
  [All] [Unlocked] [Locked] [Recent]
  Same filter chip style as Subjects page

GRID: auto-fit, min 160px, gap-16

BADGE CARD (Unlocked):
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-lg
  Padding: 20px
  Text-align: center

  BADGE ICON:
    80×80px, centered
    Background: radial gradient from badge-color at 20% → transparent
    Border-radius: radius-xl
    Icon: Lucide icon, 36px, badge-color
    Border: 2px solid badge-color at 40%
    Box-shadow: 0 0 20px badge-color at 30%

  BADGE NAME: "First Blood" (14px/700, text-primary, margin-top: 12px)
  DESCRIPTION: "Completed your first chapter notes" (12px/400, text-muted, margin-top: 4px)
  UNLOCK DATE: "Unlocked 3 Jan 2026" (11px/400, text-muted, margin-top: 8px)
  XP REWARD: "+100 XP" (11px/600, accent-yellow, bg-yellow-8%, rounded, margin-top: 8px)

BADGE CARD (Locked):
  Same structure but:
  Icon background: rgba(255,255,255,0.04)
  Icon color: text-muted (greyscale)
  Border: 1px solid border-subtle
  No glow
  Name: text-muted
  Description: locked — shows progress hint: "Log 5 past papers (3/5)"
    Progress: small progress bar below hint, 3px height
  XP: hidden or "???"

  HOVER ON LOCKED:
    Tooltip popup: full badge description + unlock condition
    Slight scale(1.02)

ACHIEVEMENT UNLOCK ANIMATION (triggered on earn):
  Badge card: scale(0) → scale(1), SPRING_BOUNCE (0.5s)
  Glow: expands from center, fades out (0.8s)
  Particles: 20 small dots burst outward (Framer Motion custom)
  Toast notification:
    "Achievement Unlocked! 🏆"
    "[Badge name]"
    "+100 XP"
    Background: linear-gradient(135deg, rgba(157,110,248,0.2), rgba(91,127,255,0.1))
    Border: 1px solid rgba(157,110,248,0.4)
    Duration: 5s
```

---

### 8.5 Badge Definitions (Illustrative)

| Badge | Icon | Color | Condition |
|---|---|---|---|
| First Blood | `Flame` | accent-red | First chapter notes complete |
| Paper Hunter | `FileSearch` | accent-cyan | First past paper logged |
| Perfect Score | `Star` | accent-yellow | 100% on any paper |
| Ace | `Award` | accent-yellow | 90%+ on a paper |
| Streak 7 | `Zap` | accent-orange | 7-day streak |
| Streak 30 | `Zap` (large) | accent-red | 30-day streak |
| Completionist | `CheckCircle2` | accent-green | All chapters done for one subject |
| Speed Run | `Timer` | accent-blue | 3 missions in one day |
| Night Owl | `Moon` | accent-purple | Study session after midnight |
| Atlas | `Globe` | gradient | Reach Level 10 |

---

### 8.6 XP History Feed

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 24px
Margin-top: 32px

HEADER: "XP History" (15px/600) + "See all" link (right, 13px, accent-blue)

FEED ITEMS (gap-0, dividers):
  Each row: 52px, padding: 0 8px
  Layout: [icon 32px] [event text] [right: XP + time]

  Icon backgrounds: per event type (same as activity feed)
  Event text: "Completed Integration notes · Mathematics"
    Font: 14px/400, text-primary
  XP: "+50 XP" (14px/700, accent-yellow, right)
  Time: "2 Jan · 4:30 PM" (12px/400, text-muted, below XP)

PAGINATION: "Load more" link (not infinite — explicit to avoid content overwhelm)
```

---

### 8.7 Loading State

```
Level hero: skeleton bar (same height), gradient shimmer from purple-8%
Badge grid: 8 skeleton badge circles (80px each) with rect below
XP feed: 5 skeleton rows
```

---

### 8.8 Empty State (No Achievements Yet)

```
Center of badge grid:
  Trophy icon (64px, text-muted)
  "No achievements yet"
  "Complete missions and log papers to start unlocking badges."
  "Start Your First Mission →" (primary button)
```

---

### 8.9 Mobile Achievements

```
Level card: stacked (level badge + text above XP bar)
Badge grid: 2 columns
XP feed: full-width
```

---

## 9. Settings

**Route**: `/settings`  **Auth**: Protected  **Layout**: App Shell + Settings Nav

---

### 9.1 Layout

```
Two-column settings layout:
  Left: Settings navigation (200px)
  Right: Settings content panel (flex-1)
```

---

### 9.2 Settings Navigation

```
Background: bg-surface
Border-right: 1px solid border-subtle
Padding: 24px 16px

Title: "Settings" (18px/600, text-primary, padding: 0 12px, margin-bottom: 16px)

Nav sections (labelled groups):
  ACCOUNT
  ├── Profile
  └── Notifications

  STUDY
  ├── Subjects & Exams
  └── Study Goals

  INTEGRATIONS
  └── Google Docs

  DANGER ZONE
  └── Delete Account

Nav item: same styling as sidebar nav items
  Height: 36px, padding: 0 12px
  Active: bg-elevated, text-primary, accent-blue left-border
```

---

### 9.3 Profile Settings

```
SECTION HEADER: "Profile" (heading-lg, 22px/600) + divider

AVATAR SECTION:
  Current avatar: 64×64px circle
  "Change photo" button (below, text, 13px, accent-blue)
  Hover on avatar: overlay with Camera icon + "Change"

FORM FIELDS (stacked, gap-20):
  Each field:
    Label: 13px/600, text-secondary (above)
    Input: height 44px, bg-bg-surface, border-default (focus: accent-blue)
    Border-radius: radius-sm

  Fields:
    ├── Full Name: text input
    ├── Email: text input (read-only, from OAuth — shows lock icon)
    ├── School / Institution: text input (optional)
    ├── Exam Session: select ("Jun 2026", "Nov 2026", "Jun 2027")
    └── Timezone: select + search (important for streak midnight logic)

SAVE BUTTON:
  "Save Changes" — primary, accent-blue, right-aligned
  Loading: spinner, "Saving..."
  Success: "Changes saved ✓" (accent-green, 2s then returns to normal)
```

---

### 9.4 Subjects & Exams Settings

```
List of enrolled subjects with manage actions:

SUBJECT ROW:
  [Subject icon 32px] [Name 14px/600] [Code 12px text-muted]
  Right: [Exam date input] [Grade select] [Remove ×]

ADD SUBJECT: same dialog as Subjects overview

EXAM DATES:
  Per subject: date picker inline
  If date set: "14 June 2026" (13px/600, text-primary)
  If not set: "Set exam date" (accent-blue, dashed underline)

TARGET GRADES:
  Per subject: segmented [A*][A][B][C] inline
```

---

### 9.5 Integrations — Google Docs

```
Google Docs integration card:
  Background: bg-surface
  Border: 1px solid border-subtle
  Border-radius: radius-lg
  Padding: 24px

  LEFT: [Google Docs logo SVG, 32px]
  CENTER:
    "Google Docs"  (15px/600, text-primary)
    "Link your notes directly to chapters"  (13px/400, text-secondary)
  RIGHT: Connection status badge

  If NOT connected:
    Badge: "Not Connected"  (11px/600, accent-red, bg-red-8%, radius-full)
    Button: "Connect Google Docs" (accent-blue, below)

  If CONNECTED:
    Badge: "Connected"  (11px/600, accent-green, bg-green-8%, radius-full)
    Sub: "Connected as alex@gmail.com · Scopes: Drive readonly"
    Button: "Disconnect" (ghost, accent-red text, right)

  Animation on connect:
    Badge flips from red → green (rotateY 0.4s, EASE_DEFAULT)
    Subtle success flash on card border (accent-green, fades 0.8s)
```

---

### 9.6 Notifications Settings

```
Toggle rows (each 56px height):
  Layout: [label column] [toggle right]

  Toggles:
    ├── Daily mission reminder / "Remind me to study at a set time"
    │     Sub: time picker (shows when ON)  "8:00 AM"
    ├── Streak at-risk alert / "Alert when streak about to break"
    └── Achievement unlock / "Notify when you earn a badge"

Toggle component:
  Width: 44px, height: 24px
  ON: accent-blue fill, thumb right
  OFF: rgba(255,255,255,0.15), thumb left
  Transition: 0.18s EASE_DEFAULT
  Thumb: white circle, 20px, shadow-sm
```

---

### 9.7 Danger Zone

```
Background: rgba(255,77,106,0.04)
Border: 1px solid rgba(255,77,106,0.15)
Border-radius: radius-lg
Padding: 24px

"Delete Account" section:
  Label: "Delete Account" (15px/600, accent-red)
  Description: "This will permanently delete your account,
               all subjects, chapters, papers, and progress.
               This cannot be undone."
  Font: 13px/400, text-secondary

  Button: "Delete My Account"
    Background: transparent
    Border: 1px solid accent-red
    Color: accent-red
    Hover: bg-red-8%
    Font: 14px/600, height: 40px

  CONFIRM DIALOG:
    Title: "Are you absolutely sure?"
    Type confirmation: Input "type DELETE to confirm"
    Input match required to enable confirm button
```

---

### 9.8 Animations (Settings)

```
Settings nav item click: content panel cross-fades (0.18s)
Form save: button loading → success micro-animation
Toggle: smooth slide (0.18s cubic-bezier)
Integration card: badge flip animation on connect/disconnect
```

---

### 9.9 Mobile Settings

```
Left nav: hidden
Navigation: back to top-level "Settings" page with list of section cards
Each section card → navigates to dedicated section page
No two-column layout
```

---

## 10. Friends (Future)

**Route**: `/friends`  **Auth**: Protected  **Label**: "Coming Soon"  **Layout**: App Shell

---

### 10.1 Vision

> "Your revision network. See how friends are progressing, compete on leaderboards, and stay accountable together."

---

### 10.2 Layout

```
ROW 1: Page header + friend count
ROW 2: Leaderboard (top 3 podium + full list)
ROW 3: Friend cards grid
ROW 4: Incoming requests
```

---

### 10.3 "Coming Soon" State (Current)

```
Full page content with "coming soon" overlay:
  The page renders with blurred preview of what it will look like
  Centered overlay card:
    Background: bg-elevated
    Border: 1px solid border-default
    Border-radius: radius-xl
    Padding: 48px
    Text-align: center

    Icon: [Users icon, 48px, accent-blue]
    Heading: "Friends are coming soon"  (heading-xl, 30px/600)
    Sub: "See how your friends are revising, compete on XP leaderboards,
          and keep each other accountable."
    Font: body-md, text-secondary, margin-top: 12px

    FEATURE PREVIEW (margin-top: 32px, gap-16):
      ├── 🏆 "XP Leaderboards — who studied the most this week?"
      ├── 🤝 "Study partners — compare readiness scores"
      ├── ⚔️  "PvP Challenges — race to complete a chapter"
      └── 🐾 "Study Pets — your pet grows when you study"
      Font: 14px/400, text-secondary

    "Get notified when this launches →"
    Email input + "Notify Me" button

BLURRED BACKGROUND (preview of future UI):
  Opacity: 0.25, filter: blur(6px), pointer-events: none
  Shows ghost version of friend cards + leaderboard
```

---

### 10.4 Friends Page (Full Design — For Launch)

#### Friend Card

```
Background: bg-surface
Border: 1px solid border-subtle
Border-radius: radius-lg
Padding: 20px

TOP ROW:
  Avatar: 48px circle + online indicator dot (10px, accent-green, bottom-right)
  Name: 15px/600, text-primary
  Handle: "@priya_revises" (12px/400, text-muted)
  Right: "Following" button (ghost, 32px)

STATS ROW (gap-24, margin-top: 16px):
  Streak: [Flame icon] "18 days" (13px/600, text-primary)
  XP: [Zap icon] "4,200 XP" (13px/600, text-primary)
  Level: [Badge circle] "Lv.7" (13px/600, text-primary)

READINESS (margin-top: 16px):
  "Math A2: 82%" + mini arc (80px, green)
  "Physics: 61%" + mini arc (80px, orange)

RECENT ACTIVITY:
  "Completed Integration notes · 2h ago"
  Font: 12px/400, text-muted, italic
```

#### Leaderboard Panel

```
Full-width card, margin-bottom: 32px

PODIUM (top 3 — stylised):
  2nd place (left): slightly smaller, silver
  1st place (center): tallest, gold glow
  3rd place (right): slightly smaller, bronze
  Each: avatar circle + name + XP + level

  Podium animation: rises up from below on page load (stagger, SPRING_GENTLE)

LEADERBOARD TABLE (below podium, rows):
  Position | Avatar + Name | Level | XP This Week | Streak
  Your row: highlighted with accent-blue left border + bg-blue-4%
  Sorted by: XP This Week (default) | toggle to All-Time, Streak
```

---

### 10.5 Friend Request Flow

```
Incoming request toast (top-right):
  Avatar + "Alex sent you a friend request"
  [Accept] [Decline] — 2 buttons
  Duration: 10s, persistent until actioned

Friend search:
  Full-screen search dialog (⌘K style)
  Search by: name, handle, email
  Results show avatar + name + level + mutual friends count
  "Add Friend" button per result
```

---

### 10.6 PvP Challenge Card (Future)

```
Background: linear-gradient(135deg, rgba(157,110,248,0.1), rgba(255,123,53,0.08))
Border: 1px solid rgba(157,110,248,0.25)
Border-radius: radius-lg
Padding: 24px

"⚔️ CHALLENGE" label (12px/600, accent-purple, UPPERCASE)
Your avatar ← VS → Opponent avatar
"First to complete Chapter 8 wins 200 XP"
Progress bars for each player, racing toward 100%
Time limit: "Ends in 2h 15m" (countdown)
Winner: border flashes gold, confetti burst
```

---

### 10.7 Mobile Friends

```
Leaderboard: horizontal scroll podium + vertical list
Friend cards: single column
Challenge cards: full-width, prominent
Request notifications: bottom sheet
```

---

## Cross-Page Design Principles

### Interaction States (All Buttons)

```
Default → Hover → Pressed → Loading → Success/Error

Primary Button:
  Default:  bg-accent-blue, text-white, shadow-glow-blue
  Hover:    brightness(1.08), translateY(-1px), shadow increases
  Pressed:  scale(0.97), brightness(0.95)
  Loading:  reduced opacity(0.7), spinner replaces or joins icon
  Success:  accent-green for 2s, checkmark icon, then resets
  Error:    accent-red for 2s, X icon, then resets
  All transitions: 0.14s EASE_DEFAULT

Ghost Button:
  Default:  bg-transparent, border-border-default, text-secondary
  Hover:    bg-surface, border-border-strong, text-primary
  Pressed:  scale(0.97), bg-elevated
```

---

### Toast / Notification System

```
Position: top-right (desktop), top-center (mobile)
Stack: up to 3 toasts visible, oldest auto-dismissed
Width: 340px (desktop)

Toast anatomy:
  Background: bg-elevated
  Border: 1px solid border-default
  Border-left: 4px solid [type-color]
  Border-radius: radius-md
  Padding: 14px 16px
  Box-shadow: shadow-lg

Types:
  Success: accent-green left-border + CircleCheck icon
  Error:   accent-red left-border + AlertCircle icon
  Info:    accent-blue left-border + Info icon
  XP:      accent-yellow left-border + Zap icon (special)

  XP toast additional:
    Animated number counting up to XP amount
    "+50 XP earned" in 18px/700 accent-yellow
    Sub: event description

ENTRANCE: slide in from right (x: 100% → 0, opacity: 0 → 1, 0.24s EASE_DEFAULT)
EXIT: slide out right (0.18s) OR fade (auto-dismiss)
Dismiss: swipe right (mobile), ✕ button (desktop)
```

---

### Command Palette (⌘K)

```
Trigger: ⌘K (desktop) / search FAB (mobile)

Full-screen overlay:
  Backdrop: rgba(0,0,0,0.6) blur(8px)
  Modal: centered, width 600px, max-height 480px
  Background: bg-elevated
  Border: 1px solid border-default
  Border-radius: radius-xl
  Box-shadow: shadow-xl

SEARCH INPUT:
  Height: 56px, border-bottom: 1px solid border-subtle
  Font: 16px/400, text-primary
  Placeholder: "Search subjects, chapters, papers..."
  Icon: Command (16px, left) + ⌘K chip (right, text-muted)

RESULTS (scrollable, max-height: 380px):
  Sections: "SUBJECTS" / "CHAPTERS" / "QUICK ACTIONS" / "RECENT"
  Section label: 11px/600, UPPERCASE, text-muted, padding: 8px 16px

  Result row (40px, padding: 0 16px):
    Left: icon (16px, colored) + text (14px/500, text-primary)
    Right: shortcut or type label (12px/400, text-muted)
    Active/hover: bg-surface

  Keyboard navigation: ↑↓ arrows, Enter to select, Esc to close
```

---

### Page Transition

```
Between app pages:
  Outgoing: opacity: 1 → 0, y: 0 → -8 (0.18s)
  Incoming: opacity: 0 → 1, y: 8 → 0 (0.24s, delay: 0.14s)
  Total: ~0.4s

Next.js App Router: use Framer Motion AnimatePresence with layout animations
```

---

*Atlas UI Specification · v1.0 · July 2026 · Do not share publicly*
