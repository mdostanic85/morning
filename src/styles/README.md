# Styling ownership

Worklight has one app-owned token system and three implementation layers:

- Tailwind owns layout, spacing, responsive behavior, and token-backed utilities.
- HeroUI owns accessible interactive primitives and complex interaction behavior.
- CSS Modules own a specific page or React component.

## Where a style belongs

- `tokens.css`: light/dark primitive and semantic values only.
- `tailwind-theme.css`: app-token mappings exposed as Tailwind utilities.
- `base.css`: document elements, selection, keyboard focus, reduced motion, and scroll anchors.
- `primitives.css`: shared app classes with multiple unrelated owners.
- `motion.css`: opt-in shared keyframes and motion helpers.
- `vendor/heroui.css`: HeroUI 3.2.2 variables and documented internal hooks.
- `*.module.css`: one page or component owner. Modules stay unlayered because Next.js can
  emit their chunks before `globals.css`; layering an early module would establish the
  application-wide layer order before the canonical declaration.

`globals.css` only declares cascade order and imports these files. Do not add page or
component selectors there.

## Rules

- Use semantic tokens instead of raw colors.
- Use `Heading level` for document structure and `visualLevel` for appearance.
- Never remove focus styling without an equally visible replacement.
- Do not add global transitions to all buttons, links, or disclosure controls.
- Keep `!important` inside the documented vendor boundary. The only other exception is
  the global reduced-motion safety rule.
- Review every selector in `vendor/heroui.css` when upgrading HeroUI.

Run `npm run check:css` locally. It is also part of `npm run lint`.
