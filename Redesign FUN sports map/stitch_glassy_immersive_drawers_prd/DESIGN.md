# Design System Document: Immersive Glass Mobility

## 1. Overview & Creative North Star

### Creative North Star: "The Neon Nocturne"
This design system is a high-end, map-centric mobile experience that transforms data into a digital atmosphere. It rejects the "flat app" trend in favor of **Immersive Depth**, where the UI feels like a series of high-tech instrumentation panels floating over a midnight cityscape. By leveraging heavy backdrop blurs and a high-contrast palette, we create a "Digital Curator" persona—authoritative, engineered, and visually arresting.

The system breaks the standard mobile template by using **intentional asymmetry** in its drawer placements and **overlapping elements** that break the grid, ensuring the map remains the hero while the UI feels like a premium, integrated layer.

---

## 2. Colors

The color strategy is designed for high-legibility in low-light environments, using "Neon Teal" to draw the eye and "Blaze Orange" to signal urgency.

- **Primary (Neon Teal - #00F2FE):** Used for critical action paths, active navigation states, and primary highlights. It should feel like it's emitting light.
- **Tertiary (Blaze Orange - #FF6A00):** Reserved exclusively for alerts, "Live" indicators, and ad-hoc user pins.
- **Background (Midnight - #0B0C10):** The deep void that provides the canvas for glass effects.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts or tonal transitions. Use `surface-container-low` against a `background` to define areas.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of frosted glass.
- **Base Layer:** `surface` (#0d0e12)
- **Secondary Panels:** `surface-container-low`
- **Interactive Cards:** `surface-container-high`
Each inner container should use a higher tier to define importance without adding visual noise.

### The "Glass & Gradient" Rule
Floating mobile drawers must use **Glassmorphism**. Apply a `surface` color at 60-80% opacity with a **24px backdrop-blur**. Main CTAs should use a subtle linear gradient from `primary` (#96f8ff) to `primary_container` (#00f1fd) to provide a "soul" that flat hex codes cannot achieve.

---

## 3. Typography

The typography pairing creates an "Engineered Editorial" feel—mixing the technical precision of a monospaced-adjacent grotesque with the warmth of a modern geometric sans.

- **Headings (Space Grotesk):** High-impact, slightly technical. Use for `display`, `headline`, and `label-md` (all caps) to convey precision.
- **Body (Outfit):** Highly legible and approachable. Used for `title` and `body` scales to ensure long-form information is digestible on small screens.

**Hierarchy Note:** Use wide tracking (letter-spacing: 0.05em) for `label-sm` in Space Grotesk to mimic the look of premium high-tech interfaces.

---

## 4. Elevation & Depth

We move away from traditional material shadows toward **Tonal Layering** and **Atmospheric Diffusion**.

- **The Layering Principle:** Stack `surface-container` tiers. A `surface-container-highest` card should sit atop a `surface-container-low` drawer. The difference in tonal value creates the lift.
- **Ambient Shadows:** For floating action buttons (FABs) or map pins, use extra-diffused shadows.
    - **Shadow Blur:** 32px - 48px
    - **Opacity:** 6% - 10%
    - **Color:** Use a tinted version of `surface_tint` (#96f8ff) rather than black.
- **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` at **15% opacity**. Never use 100% opaque lines.
- **Backdrop Blur:** Consistent 24px blur on all frosted surfaces to ensure the map colors bleed through softly, integrating the UI with the environment.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `on_primary` text. No border. Roundedness: `full`.
- **Tertiary (Alert):** `tertiary_container` fill. Used for "Live Now" or "Critical Alert" badges.

### Immersive Drawers
- Mobile drawers should feature a "pull" handle (using `outline_variant` at 20% opacity).
- No dividers between list items; use `2.5` (0.85rem) vertical spacing to separate content blocks.
- **Touch Targets:** Minimum 44x44px for all interactive elements.

### Map Pins & Markers
- **Active State:** Neon Teal glow (shadow) with a white center.
- **Alert State:** Blaze Orange with a pulsing outer ring to indicate real-time activity.

### Input Fields
- Avoid boxed inputs. Use a `surface-container-highest` background with a `sm` (0.25rem) corner radius.
- Labels in `label-md` (Space Grotesk, Uppercase).

---

## 6. Do's and Don'ts

### Do
- **Do** use the `24px` backdrop blur on all drawers to maintain the "Glassy" brand promise.
- **Do** rely on the Spacing Scale (specifically `3` and `4`) to create hierarchy instead of lines.
- **Do** use `full` roundedness for primary action buttons to make them feel "tactile" and friendly for thumb-presses.
- **Do** allow map elements to be partially visible behind the UI to maintain a sense of place.

### Don't
- **Don't** use pure black (#000000) for backgrounds; keep it to the `background` token (#0d0e12) to allow for depth.
- **Don't** use standard 1px dividers in lists. If separation is needed, use a 1px gap that reveals the `background` color below.
- **Don't** use Blaze Orange for anything other than alerts or pins; overusing it diminishes its "High-Ad-Hoc" status.
- **Don't** use traditional "Drop Shadows" with high opacity. If it looks like a shadow, it’s too dark. It should look like a "glow" or "ambient occlusion."