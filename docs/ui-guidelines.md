# UI Guidelines

## Design Philosophy
Atlas combines the focused aesthetic of **Linear**, the engaging gamification of **Apple Fitness** and **Duolingo**, and the modern, fluid transitions of **Arc Browser**.
The design is **Dark Mode First** to create a "Mission Control" feel, prioritizing focus and reducing eye strain for late-night studying.

## Color Tokens
- **Backgrounds**: Deep, rich blacks (`#0A0A0A`), subtly raised surface layers (`#121212`, `#1E1E1E`).
- **Accents**: Neon and vibrant colors mapped to specific subjects (e.g., Mathematics: `#5B7FFF`, Physics: `#38D9F5`, Chemistry: `#12E88A`).
- **Text**: High contrast white for primary, muted grays (`#A1A1AA`) for secondary.

## Typography
- **Primary**: Inter (sans-serif) for general UI and body copy.
- **Monospace**: JetBrains Mono for numbers, codes, and data-heavy tables.

## Components & Spacing
- Base component library: **shadcn/ui**.
- 8px baseline grid layout. Generous padding for a breathable interface.
- Widespread use of subtle **glassmorphism** (backdrop blur) for modals and sticky headers.

## Icons
- **Lucide React** for sharp, consistent, modern iconography.

## Animations
Powered by **Framer Motion**, utilizing physics-based spring animations rather than linear easings:
- `SPRING_BOUNCE`: For gamified interactions like badge unlocks.
- `EASE_DEFAULT`: Smooth transitions for navigation and tabs.
- `DURATION_CINEMATIC`: Deliberate, sweeping reveals for page loads.
