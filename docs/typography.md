# Heading architecture

Worklight separates document structure from visual presentation.

- `Heading level={…}` chooses the semantic HTML element and its place in the
  page outline.
- `visualLevel={…}` chooses one of the shared H1–H6 visual tokens.
- If `visualLevel` is omitted, it matches `level`.

```tsx
<Heading level={2} visualLevel={4}>
  Supporting sources
</Heading>
```

This is a semantic `h2` with the compact H4 appearance. Changing its size does
not change its meaning in the document.

## Semantic roles

| Level | Role |
| --- | --- |
| H1 | The page or view title. A page should normally have one. |
| H2 | A top-level section within the page. |
| H3 | A subsection or titled group within an H2 section. |
| H4 | A nested group or item collection within an H3 section. |
| H5 | A deeper supporting subdivision; use sparingly. |
| H6 | The deepest meaningful subdivision, not a substitute for eyebrow text. |

Do not choose a semantic level because of its size. Do not skip from H1 to H3
unless an H2 section is supplied by the composition that owns the component.
Labels, kickers, badges, and eyebrows that do not introduce content remain
`p`, `span`, or another appropriate non-heading element.

## Visual scale

The visual tiers are defined in `src/app/globals.css` with reusable tokens for
font family, fluid size, weight, line height, and letter spacing:

- H1: display or primary page title
- H2: standard page title or major feature title
- H3: major section title
- H4: subsection or panel title
- H5: card title
- H6: compact section title

H1–H4 use `clamp()` so the hierarchy scales continuously between mobile and
desktop. H5 and H6 remain stable to preserve readable UI density.

## Component rule

Application code should use `Heading` rather than direct `h1`–`h6` markup or
rebuilding headings with `text-*`, `font-*`, `leading-*`, and `tracking-*`
utilities. A component that can appear at different outline depths should
accept a semantic heading level as a prop, as `TaskCard` does.
