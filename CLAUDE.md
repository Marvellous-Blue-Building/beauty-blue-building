# Project notes

## Admin / tenant dashboard UI standard

All UI work in the admin dashboard (`apps/web/app/[locale]/admin/**`,
`apps/web/components/admin/**`) must follow the **Glassmorphism dashboard**
style defined in [`docs/admin-ui-guidelines.md`](docs/admin-ui-guidelines.md)
(visual reference: `docs/design/admin-glassmorphism-reference.webp`). Use the
`admin-*` tokens, the `glass-panel` / `glass-inset` utilities, and the
primitives in `apps/web/components/admin/glass.tsx`. The shopper app keeps its
own palette and is out of scope for this rule.
