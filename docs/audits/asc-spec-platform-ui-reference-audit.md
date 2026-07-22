# UI Audit — ASC Spec Platform Interaction Model (reference)

**Source:** [https://animated-heliotrope-d55722.netlify.app/](https://animated-heliotrope-d55722.netlify.app/)  
**Audit date:** 22 July 2026  
**Status:** visual / design-system extraction only (no product implementation)  
**Type:** single-page product story + conceptual workspace mock

---

## 1. Verdict

This reference is a **strong UI system**, not just a pretty marketing page. It is especially good at:

1. **Calm navy/cyan enterprise palette** with clear semantic status colors  
2. **Aggressive type hierarchy** (huge display headings + quiet body)  
3. **Card language with three tiers** (soft list cards → shell cards → hero/navy cards)  
4. **Evidence-first product UI** inside the workspace mock (source quote, confidence, confirm actions)  
5. **Consistent rhythm**: section padding, section-head layout, and max-width container

Treat it as a **visual language reference** for typography, spacing, color, cards, and microcopy — not as a layout to copy 1:1 into Worklight (this page is a story/demo, not a daily operator).

**Overall visual quality score: 9/10**  
(Deductions: Inter default stack; a few hard-coded hexes outside tokens; workspace evidence column vanishes too early on tablet.)

---

## 2. Scope and method

Audited from live HTML/CSS source (inline stylesheet + markup):

- Design tokens (`:root`)
- Typography scale and weights
- Spacing / layout / grid rhythm
- Color roles and status semantics
- Card and shell patterns
- Text patterns (eyebrows, leads, quotes, chips, labels)
- Workspace mock components (sidebar, tabs, evidence, product options)
- Motion and responsive breakpoints
- Accessibility and contrast notes

Out of scope: ASC product strategy, ConnectED domain logic, and Worklight implementation diffs (mapping notes only at the end).

---

## 3. Design tokens (extracted)

```css
:root {
  --navy:   #0b2f67;   /* brand / hero surfaces / active emphasis */
  --blue:   #0f63b6;   /* primary interactive + eyebrow */
  --cyan:   #24a6d8;   /* accent rail / filter “needs review” */
  --ink:    #102033;   /* primary text */
  --muted:  #627083;   /* secondary text */
  --line:   #dbe4ef;   /* borders */
  --soft:   #f5f8fc;   /* soft fills / nested rows */
  --white:  #ffffff;
  --green:  #14835c;   /* success / confirm / business chips */
  --amber:  #b97210;   /* medium severity */
  --red:    #bd3c3c;   /* high severity / danger */
  --purple: #6c54b7;   /* reserved (rarely used on page) */
  --shadow: 0 18px 45px rgba(16, 32, 51, 0.10);
  --radius: 22px;      /* base large radius (cards often override) */
}
```

### Supporting hard-coded values (used but not tokenized)

| Role | Value | Where |
|------|-------|-------|
| Page wash | `#f7f9fc` | body gradient end |
| Lead text | `#44546a` | `.lead` |
| Nav link | `#4c5d72` | `.navlinks a` |
| Soft blue fill | `#edf3fb` / `#eaf3fe` / `#e8f2ff` | chips, nums, active nav/sec |
| Evidence quote | `#fff8d8` + `#d5ad2d` border | `.quote-box` |
| Medium severity pill | `#fff2dc` / `#a1640b` | Medium badges |
| High severity pill | `#feecec` / `--red` | High badges |
| Demo chrome | `#0b1930` / `#0c2d5e` | workspace frame / appbar |
| Status pill | `#1e7f5c` | “Ready for review” |

**Finding (Medium):** Token system is good but incomplete — several semantic surfaces live as one-off hexes. A reusable system should promote: `lead`, `soft-blue`, `quote-bg`, `severity-high/medium`, `demo-chrome`.

---

## 4. Typography

### Font stack

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Body: `line-height: 1.5`, color `--ink`.

**Finding (Low):** Inter is competent and calm, but generic. If adopting the *spirit* of this UI elsewhere, keep the **weight + tracking + size ratios**; font family can stay product-specific.

### Scale

| Role | Size | Weight | Tracking / LH | Notes |
|------|------|--------|---------------|-------|
| Display H1 | `clamp(46px, 7vw, 82px)` | inherited bold feel via size | LH `1.08`, LS `-0.03em` | Max width 980px |
| Display H2 | `clamp(36px, 5vw, 58px)` | same | same | Max width 900px |
| Section H3 | `22px` default; stage title `30px` | strong | tight | |
| Role quote | `31px` | ~850 | LS `-0.03em` | Large spoken need |
| Hero card lines | `27px` | bold | LS `-0.02em` | Three short sentences |
| Lead | `clamp(18px, 2.2vw, 24px)` | regular | — | Color `#44546a`, max 820px |
| Body / card body | `15–16px` | regular | — | Muted for support copy |
| UI labels / tabs | `11–13px` | 800–900 | uppercase LS `0.08–0.12em` for labels | Dense product UI |
| Eyebrow | `12px` | 800 | LS `0.12em`, uppercase | Blue + cyan rail |
| Severity pill | `10px` | 900 | — | All-caps feel via weight |
| Fit badge | `9px` | 900 | — | Smallest type on page |

### Type rules that make this feel “premium”

1. **Huge display, quiet body** — contrast between H1/H2 and 13–15px UI copy is intentional.  
2. **Negative letter-spacing on large headings** (`-0.03em`) — tighter, modern, less “marketing fluff.”  
3. **Uppercase micro-labels** with wide tracking for structure (`eyebrow`, sidebar `h4`, stage-side `.label`).  
4. **Heavy weights (800–900)** reserved for navigation, chips, pills, and UI chrome — not for long paragraphs.  
5. **Measure control** — lead/headings capped (~820–980px), so lines never sprawl.

### Text patterns (copy structure)

| Pattern | Formula | Example |
|---------|---------|---------|
| Eyebrow | short category | “A visual product story” |
| Headline | verb + outcome | “Turn a specification into clear project decisions.” |
| Lead | what it does in one breath | reads → explains → helps act |
| Hero distill | 3 imperative lines | Upload / Understand / Do the work |
| Stage question | quoted user question | “What am I dealing with?” |
| Role quote | quoted job-to-be-done | “Help me find the requirements…” |
| Principle line | **Bold label:** explanation | “Evidence before automation: …” |

**Writing quality:** Direct, concrete, outcome-led. Avoids dashboard jargon. Strong model for product UI microcopy: short verbs, clear success language, no filler.

---

## 5. Spacing and layout rhythm

### Global

| Token / rule | Value |
|--------------|-------|
| Container max | `1240px` |
| Container pad | `24px` (desktop), `16px` (≤680px) |
| Section vertical | `96px` (desktop), `72px` (≤680px) |
| Nav pad | `16px 24px` |
| Nav gap | `28px` brand ↔ links; links gap `8px` |
| Hero pad | `82px 0 56px` |
| Section-head margin-bottom | `42px` |
| Section-head gap | `30px` |
| Grid gaps (common) | `10 / 16 / 18 / 20 / 24 / 42px` |

### Recommended spacing scale (as used)

```
4–8px   micro (icon/dot gaps, pill padding)
10–12px tight list / task rows
14–16px card inner rhythm / object track
18–24px sibling cards / columns
28–32px large card padding
42px    section-head to content
56px    hero → feature grid
72–96px section separation
```

### Layout compositions worth stealing

1. **Section head** — left: eyebrow + H2; right: muted supporting paragraph; bottom-aligned.  
2. **Hero grid** — `1.35fr / 0.65fr`, aligned to end: story left, distill card right.  
3. **Journey shell** — one large white card containing rail + object track + 2-column stage panel.  
4. **Roles** — `320px` list + fluid navy detail card.  
5. **Workspace** — `230px | 1fr | 300px` (nav / canvas / evidence). Classic evidence-work triad.

**Finding (Pass):** Rhythm is disciplined. Almost no random 13/17/19px gaps. Prefer this scale over ad-hoc Tailwind spacing soup.

---

## 6. Color system and roles

### Surfaces

| Surface | Color | Use |
|---------|-------|-----|
| Page | white → `#f7f9fc` wash | calm daylight |
| Card / panel | white + `--line` | default content |
| Soft nest | `--soft` `#f5f8fc` | tasks, summary boxes |
| Soft blue | `#edf3fb` / `#eaf3fe` | chips, numbered badges, active list |
| Navy invert | `--navy` | hero card, role card, primary scope |
| Demo chrome | `#0b1930` | frames the product mock |
| Quote evidence | warm yellow `#fff8d8` | source excerpts only |

### Text colors

| Role | Color |
|------|-------|
| Primary | `--ink` `#102033` |
| Muted | `--muted` `#627083` |
| Lead | `#44546a` |
| Interactive / eyebrow | `--blue` |
| On navy | `#dbe8f8` / `#d5e2f1` |

### Semantic status

| Status | Fill | Text | Marker |
|--------|------|------|--------|
| High / Critical | `#feecec` | `--red` | red diamond / filter dot |
| Medium | `#fff2dc` | `#a1640b` / `--amber` | amber filter |
| Needs review | — | — | `--cyan` filter |
| Success / confirm / biz | `#e9f6ef` / `#e5f5ee` / green button | `--green` | |
| Direct match | `#e5f5ee` | `--green` | fit badge |
| Approval required | amber soft | amber text | fit badge |
| Ready status | `#1e7f5c` pill | white | appbar |

### Gradient / decoration

- Progress bar: `linear-gradient(90deg, --blue, --cyan)`  
- Hero orb: soft cyan radial, low opacity  
- Object track: `#f3f7fb → #edf5ff`  
- Navy cards: large translucent circle ornaments (subtle, not neon glow)

**Finding (Pass):** Commercial/product recommendations stay visually secondary (green “Direct match”, amber “Approval required”) while analysis stays neutral white/soft — matches the page’s own principle “neutral before commercial.”

**Finding (High for a11y):** 9–11px UI text on soft fills may fail WCAG for small labels; severity pills at 10px and fit badges at 9px are risky. Prefer ≥12px for any readable status text in production.

---

## 7. Cards and surfaces

### Card tier model

| Tier | Class | Radius | Padding | Shadow | When to use |
|------|-------|--------|---------|--------|-------------|
| Soft list card | `.plain-card` | 18px | 22px | light `0 10px 25px / 5%` | 3-up feature explanations |
| Nested row | `.task` | 14px | 12px | none; `--soft` fill | checklist steps inside a panel |
| Panel | `.stage-main` / `.stage-side` | 20px | 24px | none; border only | split content inside shell |
| Shell | `.journey-shell` | 30px | 30px | `--shadow` | interactive module container |
| Goal card | `.goal` | 22px | 24px | border only | equal peer concepts |
| Scope card | `.scope-card` | 26px | 28px | border; primary = navy fill | MVP vs principles |
| Hero / role invert | `.hero-card` / `.role-card` | 32px / 28px | 32–34px | `--shadow` | distill / persona emphasis |
| Source / product | `.source-card` / `.product-card` | 14px | 14px | border only | dense evidence UI |
| Demo frame | `.demo` | 30px | 18px | `--shadow` | product screenshot chrome |

### Card anatomy patterns

**Plain feature card**

1. Number badge (36×36, radius 10, soft blue)  
2. H3 title  
3. Muted 15px body  

**Evidence card**

1. Source meta (11px muted)  
2. Quote box (warm highlight + left accent)  
3. Confidence line  
4. 2×2 action button grid  

**Product option card**

1. Fit state badge  
2. Product name (bold 13px)  
3. Spec line (11px muted)  
4. Single secondary button  

**Goal card**

1. Oversized watermark index (`G1`) in soft blue-gray  
2. Title + muted pitch  
3. Short bullet list  

### Border / radius language

- Soft UI radius cluster: **9–14px** (buttons, small cards, inputs)  
- Content cards: **18–22px**  
- Shells / heroes: **26–32px**  
- Pills: **999px**  
- Borders almost always `1px solid var(--line)` — no heavy multi-shadow stacks

**Finding (Pass):** Cards earn their container. Removing border/shadow from soft nested rows would still work; removing it from shells would collapse hierarchy. Good “cards only when they group interaction or a distinct idea” discipline.

---

## 8. Component catalog (UI chrome)

### Navigation

- Sticky frosted topbar: `rgba(255,255,255,.9)` + `backdrop-filter: blur(16px)`  
- Brand: heavy navy wordmark + muted small subtitle  
- Links: 13px / weight 700, pad `8×10`, radius 10, hover soft blue fill  

### Chips / pills

| Variant | Style |
|---------|-------|
| Default chip | soft blue fill, navy text, 12px / 800 |
| Business chip | green soft fill, green text |
| Mini-flow pill | translucent white on navy |
| Object pill | solid `--blue`, white, 13px / 900 |
| Severity | 10px / 900, soft red or amber |
| Status | solid green, 11px / 800 |

### Buttons

| Type | Style | Role |
|------|-------|------|
| `.smallbtn` | white, border `--line`, navy text, radius 9, 11px/800 | secondary |
| `.smallbtn.primary` | solid `--green` | confirm / positive |
| Stage / role selectors | bordered white; active = blue ring `0 0 0 3px rgba(15,99,182,.10)` | selection |

Primary product action in the evidence panel is **Confirm (green)**, not blue — blue is reserved for navigation/selection/brand rails. That separation is worth keeping.

### Lists and requirements

- Requirement row: diamond marker + text + severity pill  
- Hover: barely-there `#fbfdff`  
- Active section: soft blue + 3px left navy/blue bar  

### Tabs

- 12px / 800, muted inactive  
- Active: navy text + 2px `--blue` underline  

### Forms (minimal)

- Search fake field: height 34, radius 10, 12px placeholder gray  

---

## 9. Interaction and motion

| Motion | Spec |
|--------|------|
| Scroll reveal | opacity 0 → 1, `translateY(18px)` → 0, `.6s ease` |
| Stage dot active | `translateY(-3px)` + navy fill + soft navy shadow |
| Role hover | `translateY(-2px)` |
| Object pill | slight `translateX` as stage advances |
| Page progress | 4px top bar, blue→cyan fill by scroll |
| Transitions | mostly `.2–.3s` |

Motion is **presence and progress**, not decoration. No bouncing, no glow pulses.

**Finding (Pass):** Respects calm product-story tone. For app UI, shorten to ~150–280ms (Worklight already has similar motion tokens).

---

## 10. Responsive behavior

Breakpoints observed:

- **≤980px:** collapse hero/roles/stage/scope to 1 column; hide nav links; hide evidence column; journey rail → 4 cols  
- **≤680px:** tighter section pad; hide brand subtitle; hide journey connector line; hide sidebar; journey rail → 2 cols  

**Finding (High for product UI):** Evidence pane disappears at tablet widths. For an evidence-first product, that is the wrong thing to demote. Prefer stacking evidence under canvas, or a sheet/drawer — never drop source verification.

---

## 11. Accessibility snapshot

| Check | Result |
|-------|--------|
| Ink on white | Strong |
| Muted on white | Likely OK (~4.5:1 borderline depending on size) |
| White on navy | Strong |
| 9–11px labels | Weak for WCAG body/UI text |
| Focus states | Incomplete — hover/active exist; visible focus rings not systematized |
| Icon-only | Mostly texted controls; diamonds/filters are decorative + text |
| Motion | No `prefers-reduced-motion` handling |

---

## 12. What makes this UI feel excellent (steal these)

1. **One container width + generous section air** (`1240` / `96px`)  
2. **Eyebrow → display → lead** as a reusable section template  
3. **Three card altitudes** (soft / bordered / navy invert) instead of one generic card  
4. **Semantic color reserved for status**, blue reserved for orientation/selection  
5. **Evidence quote visually distinct** (warm paper) from neutral analysis  
6. **Human validation actions** next to AI confidence (Confirm / Correct / Ask / N/A)  
7. **Progressive disclosure story** mirrored in UI density (marketing airy → workspace dense)  
8. **Microcopy discipline**: questions, outcomes, principles — not feature dumps  

---

## 13. What not to copy blindly

| Reference choice | Why skip / adapt |
|------------------|------------------|
| Inter as brand font | Too generic; keep ratios, swap family if product already has identity |
| Marketing section padding (`96px`) in app chrome | Too sparse for daily operator; use 32–48px app sections |
| 3-column workspace with hidden evidence on tablet | Conflicts with evidence-before-automation |
| 9–10px badges | Bump to ≥12px in production |
| Inline one-off hexes | Promote to tokens before implementing |
| Purple token unused | Don’t add unused palette noise |
| Story-page sticky marketing nav | App needs task-first chrome, not chapter nav |

---

## 14. Adoption checklist (if using as UI reference)

Use this as a build checklist when restyling cards/type/spacing:

### Tokens to define

- [ ] `--navy` / `--blue` / `--cyan` (or map onto existing brand roles)  
- [ ] `--ink` / `--muted` / `--line` / `--soft`  
- [ ] severity: high / medium / review  
- [ ] `--shadow-elevated` ≈ `0 18px 45px rgba(16,32,51,.10)`  
- [ ] radius scale: `10 / 14 / 18 / 22 / 28 / 32` + pill  

### Type to define

- [ ] Display, title, lead, body, label, micro  
- [ ] Eyebrow style (12px / 800 / 0.12em / uppercase)  
- [ ] Heading letter-spacing `-0.03em` for display only  

### Components to mirror in spirit

- [ ] Section head (title left, helper right)  
- [ ] Soft feature card with numbered badge  
- [ ] Evidence card: meta → quote → confidence → actions  
- [ ] Severity pill + diamond/list marker  
- [ ] Fit/state badge separate from primary CTA  
- [ ] Confirm as positive (green), not brand-blue  

### Quality bars

- [ ] One primary action per region  
- [ ] Evidence never fully hidden on useful breakpoints  
- [ ] Status color never doubles as primary CTA fill  
- [ ] No card without a clear grouping job  

---

## 15. Mapping notes for Worklight (optional)

Worklight already has a tokenized light/dark system in `src/app/globals.css` (Space Inch blues/violets). Do **not** replace brand colors with ASC navy wholesale.

**Worth borrowing as behavior/structure, not palette:**

| ASC pattern | Worklight fit |
|-------------|----------------|
| Eyebrow + big calm headline + short lead | Today briefing header |
| Evidence quote treatment (distinct surface) | Evidence / why-this panels |
| Confirm / Correct action cluster | Ownership + AI correction loop |
| Soft nested task rows inside a shell | Primary focus card steps / DoD |
| Severity pills (high/medium) | Unclear / waiting / risk tags — keep Unclear visually distinct |
| Section-head helper column | Sync/status helper copy without dashboard widgets |
| Radius + shadow restraint | Prefer border + one elevated shadow, avoid glow stacks |

**Do not borrow:** marketing journey rail as primary nav; commercial product-option cards as default task chrome; Inter if brand type already set; ASC navy as primary brand fill.

---

## 16. Quick reference — copy/paste starter tokens

```css
/* ASC Spec reference — starter tokens (visual language only) */
:root {
  --ref-navy: #0b2f67;
  --ref-blue: #0f63b6;
  --ref-cyan: #24a6d8;
  --ref-ink: #102033;
  --ref-muted: #627083;
  --ref-lead: #44546a;
  --ref-line: #dbe4ef;
  --ref-soft: #f5f8fc;
  --ref-soft-blue: #edf3fb;
  --ref-green: #14835c;
  --ref-amber: #b97210;
  --ref-red: #bd3c3c;
  --ref-quote-bg: #fff8d8;
  --ref-quote-accent: #d5ad2d;
  --ref-shadow: 0 18px 45px rgba(16, 32, 51, 0.10);
  --ref-radius-sm: 10px;
  --ref-radius-md: 14px;
  --ref-radius-lg: 18px;
  --ref-radius-xl: 22px;
  --ref-radius-2xl: 30px;
  --ref-container: 1240px;
  --ref-section-y: 96px;
}
```

---

## 17. Summary findings

### High

- Evidence column dropped at ≤980px — bad pattern for evidence-first products.  
- Micro type at 9–11px needs a production floor (≥12–14px).

### Medium

- Incomplete tokenization (many one-off hexes).  
- Focus-visible and reduced-motion not specified.

### Low

- Generic Inter stack.  
- Unused `--purple`.  
- Marketing density ≠ app density (adapt spacing when porting).

### Pass (keep)

- Tokenized core palette and clear color roles.  
- Excellent type hierarchy and measure control.  
- Coherent card altitude system.  
- Evidence → confidence → human validation cluster.  
- Neutral analysis vs commercial options separation.  
- Calm motion and sticky frosted chrome.

---

*Reference page: ASC Spec Platform — Product Interaction Model. Audited as a visual companion / UI language source for typography, spacing, color, text, and cards.*
