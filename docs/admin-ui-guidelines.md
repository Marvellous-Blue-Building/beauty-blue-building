# Admin UI Guidelines — "Glassmorphism dashboard"

**Status: development standard.** Every UI change in the admin / tenant dashboard
(`apps/web/app/[locale]/admin/**`, `apps/web/components/admin/**`) must follow
this style. The shopper app (mobile shell) keeps its own warm palette and is
**not** affected.

- Visual reference (layout & glass style): [`docs/design/admin-glassmorphism-reference.webp`](design/admin-glassmorphism-reference.webp)
- Color palette reference: [`docs/design/admin-color-palette.jpg`](design/admin-color-palette.jpg)
- Login background: `apps/web/public/admin/login-bg.jpg` (served at `/admin/login-bg.jpg`)
- Dashboard background: `apps/web/public/admin/dashboard-bg.jpg` (served at `/admin/dashboard-bg.jpg`)
- Tokens & utilities: `apps/web/app/globals.css` (section "Admin Glassmorphism")
- Primitives: `apps/web/components/admin/glass.tsx`
- Shell (frame, sidebar, header, ⌘K): `apps/web/components/admin/layout.tsx`
- Icons: `apps/web/components/admin/icons.tsx` · Charts (sparkline, area/line, bubble): `apps/web/components/admin/charts.tsx`
- Reference implementation of a full page: `apps/web/components/admin/OverviewSection.tsx`

## 1. Look & feel

- A soft pastel backdrop (blush → cream, or the login photo) with
  large blurred color orbs; **content floats on frosted glass panels**.
- Panels are translucent white with backdrop blur, a thin white border, a
  very soft shadow and generous rounding. No solid white cards, no hard grey
  borders.
- One accent (pink `#d26287`) for the primary action, active nav item, links,
  focus rings and the main chart series. Everything else is neutral ink.
- Clean, airy layout: large numbers for KPIs, plenty of padding, light
  dividers.

## 2. Tokens (Tailwind classes)

| Purpose | Class | Value |
|---|---|---|
| Primary text | `text-admin-ink` (or `text-neutral-700`) | `#404040` — the darkest text allowed |
| Secondary text | `text-admin-ink-muted` | `#6b7280` |
| Placeholder / hint / icon | `text-admin-ink-faint` | `#9ca3af` |
| Inactive sidebar menu item (text + icon, incl. Keluar) and the "Apps" group label | `text-admin-nav-ink` | `#595252` |
| Accent (primary action, active nav, focus, main chart series) | `bg/border-admin-accent` | `#d26287` (= pink) |
| Accent hover / accent text & links | `admin-accent-strong` | `#b0476d` (= pink-strong) |
| Positive (↑, "Complete", active) | `admin-success` | `#22a06b` |
| Negative (↓, errors, delete) | `admin-danger` | `#e5484d` |
| Warning / secondary chart series | `admin-warning` | `#e0a526` |
| Font | `font-admin` | Inter / system sans |

### Pink & blush palette (main color: pink)

| Token | Hex | Typical use |
|---|---|---|
| `admin-pink` | `#d26287` | **Accent** — primary button, active nav, focus ring, main chart series |
| `admin-pink-strong` | `#b0476d` | *Derived* — hover of accent, accent-colored text and links |
| `admin-mint` | `#d3e3d6` | Selected chip / active tab background, progress track, secondary chart fill, backdrop orbs |
| `admin-blush` | `#f2ded7` | Soft highlight panels, hover row, backdrop tint |
| `admin-rose` | `#efc5b9` | Secondary accent — secondary chart series, badges, backdrop orbs (never for primary actions) |
| `admin-taupe` | `#dbcfc3` | Dividers, borders, disabled states, neutral chips |
| `admin-cream` | `#f8f3ef` | Page backdrop base, inset fills behind glass |

Use accent-colored **text** at `pink-strong`, not `pink` (`#d26287` is only ~3.6:1 on light glass).
Pink is the only primary action color; rose is decorative/secondary. Don't introduce other hues.

Never hard-code hex colors or `neutral-*` / `primary` (shopper palette) in admin
code — use the tokens above. Status pills use the token at `/10` background +
`/20` border + full-strength text, e.g.
`bg-admin-success/10 border-admin-success/20 text-admin-success`.

## 3. Surfaces

| Surface | Use | How |
|---|---|---|
| Glass frame | The one max-width sheet (`max-w-[1480px]`) holding sidebar + main, over the photo backdrop | `glass-frame rounded-[40px]` (via `<AdminFrame>`) |
| Glass card | Every content card inside the frame (KPI, chart, table) | `glass-card rounded-[24px] p-6 lg:p-7` |
| Glass panel | Floating layers: login card, menus, tooltips, modals | `glass-panel rounded-3xl` (or `<GlassCard>`) |
| Glass inset | Inputs, search, chips, active range tab, secondary buttons, table header row | `glass-inset rounded-xl` |
| Solid accent | Primary button, active nav item, current page | `bg-admin-accent text-white` + soft pink shadow |

**Blur gotcha:** never write a raw `backdrop-filter` inside an `@utility` in
`globals.css` — Tailwind drops it from the build. Use
`@apply backdrop-blur-[…] backdrop-saturate-[…]` (as the existing utilities do).

Every new admin page renders inside `<AdminFrame>` / `AdminHeader`; don't
build a second shell. The header is passed as `AdminFrame`'s `header` prop and stays fixed —
only the content area below it scrolls (with a 20px top fade). Kebab (⋮) menus and header buttons must trigger real
actions (navigate, export) — no decorative no-op controls, and no sample
numbers: every figure comes from the database.

Radius: panels `rounded-3xl` (24px), controls `rounded-xl` (12px), pills
`rounded-full`/`rounded-md`. Panel padding `p-6`–`p-8`; gaps between
panels `gap-5`–`gap-6`.

## 4. Components

Always reach for the primitives in `components/admin/glass.tsx` first; extend
them there instead of re-styling inline.

Class-string primitives (same file) for raw elements:

| Need | Use |
|---|---|
| `<input>` / `<select>` | `glassFieldCls` (40px) · `glassFieldSmCls` (32px, inline table edit) |
| Buttons | `btnPrimaryCls` · `btnSecondaryCls` · `btnSecondarySmCls` |
| Text link | `linkAccentCls` |
| Table cells | `thGlassCls` / `tdGlassCls` on a `border-separate border-spacing-0` table |
| List item / stat box inside a card | `subtlePanelCls` |
| Status pill | `pillCls("success" \| "danger" \| "warning" \| "alert" \| "accent" \| "neutral")` |

Chat bubbles: user = `bg-admin-accent text-white rounded-br-md`, bot =
`bg-white/70 border-white/80 rounded-bl-md`. Charts (recharts too) use
`var(--color-admin-accent)` for the main series and `--color-admin-taupe-strong`
for baselines.

- **`GlassCard`** — any container panel. Card title: `text-base font-semibold text-admin-ink`, with an optional kebab (⋮) action top-right.
- **`GlassInput`** — 44px tall, optional `leading` icon / `trailing` action. Focus = accent border + `ring-4 ring-admin-accent/15`.
- **`GlassButton`** — `variant="primary"` (solid accent) or `"secondary"` (glass inset). Height 44px, `rounded-xl`, `font-semibold`.
- **Sidebar** — glass panel, logo + product name on top, search, nav items with outline icons; active item = solid accent pill with white text; group labels uppercase `text-xs tracking-wide text-admin-ink-faint`; user / settings pinned bottom.
- **KPI card** — label (muted) → big number (`text-4xl font-semibold`) → delta (`admin-success`/`admin-danger` with ↑/↓) + "vs last period", sparkline on the right.
- **Tables** — glass-inset header row (`font-semibold text-admin-ink`), rows without heavy borders, generous row height, status pills, pagination with accent current page.
- **Tabs / range filters** — uppercase small text; active tab = glass-inset chip.
- **Section tabs** (e.g. Forecasting sub-tabs) — active tab = solid accent (`bg-admin-accent text-white`), never black.
- **Text color ceiling** — never use `text-neutral-900` (too dark on glass); use `text-neutral-700` at most.
- **Charts** — `admin-pink` primary series, `admin-rose` secondary series, area fills as faint gradients, thin gridlines, glass tooltip.
- **Icons** — thin outline (1.8px stroke, round caps), inline SVG, 18–20px.

## 5. Do / Don't

- ✅ Keep text contrast readable on glass (ink on ≥45% white).
- ✅ Respect `prefers-reduced-motion` (already global).
- ✅ Layout must work down to 360px wide (sidebar collapses on mobile).
- ❌ No opaque white cards, no `border-neutral-200` boxes, no dark headers.
- ❌ No new accent colors per page; no gradients on text.
- ❌ Don't stack glass on glass more than two levels deep (blur gets muddy).
