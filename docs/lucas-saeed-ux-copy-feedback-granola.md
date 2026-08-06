# Lucas Saeed — UX & copy feedback (Granola)

Compiled from Granola meeting notes where Lucas reviewed Worklight / related product UI.  
Focus: **UX patterns** and **copy/labels**, not engineering architecture.

Sources: Granola notes synced locally + Granola API (as of 2026-07-22).

---

## 1. Worklight MVP — home & task UI

**Meeting:** [Milos & Lucas sync](https://notes.granola.ai/d/81d71534-18e4-4b98-aab5-aa8785b9aa34) · 2026-07-21  
**Chat:** [transcript](https://notes.granola.ai/t/f240d3b5-4fb4-41d7-9a44-46acaefa0abd)

### Confidence vs priority

| Issue | Lucas’s take | Suggestion |
| --- | --- | --- |
| `92%` / High next to the task | First read as **priority/importance**, not confidence | Place the score **next to the source / accuracy cue** so it’s visually about trust, not ranking |

> “When I first saw the high 92%… because of where it’s placed, I thought it was related to the importance, the priority, not the confidence.”

### Status vs call-to-action

| Issue | Lucas’s take | Suggestion |
| --- | --- | --- |
| Task actions feel mixed | Mixing **status** (done / snooze / …) with **CTA** | Split: **dropdown for status** + a **separate primary CTA** |
| Too many actions | Feels like more options than needed | Reduce and clarify the action set |

> “It feels like mixing actions with status… maybe start [status] to be a dropdown. And then you also have, like, call to action.”

### Unclear / ownership bucket copy

| Current | Problem | Suggested alternatives |
| --- | --- | --- |
| “Needs your attention” | Reads as **secondary / low urgency** — easy to skip | **“Needs your input”**, or something that signals **required action** (e.g. confirm ownership) |

> “When I read it, I thought it was something that… wasn’t like focus, but it was like a secondary action… But this actually needs [action].”

Supporting note from the same session: the small helper line (“confirm this is yours”) was easy to miss — copy hierarchy should make the required action obvious without explanation.

### Labels & UX writing (general)

- Labels are understandable **after** verbal explanation, but **not always self-evident** on first glance.
- English-as-second-language friction on both sides — don’t rely on insider phrasing.
- **Do a dedicated copy pass** (UX writing skill / prompt) over all labels on Today / task surfaces.
- Simpler IA is working: one clear priority, fewer menu options — keep that direction.

> “The labels here will change the experience a lot… if you explained it, I get it. But if you don’t explain it, I’m like, what is this?”

> “I was actually thinking of finding a UX writing skill… or maybe just create it.”

### What Lucas liked (keep)

- Trust model: confidence grounded in sources + “Why this” / quotes
- One clear “what to do first”
- Light theme closer to Space Inch brand
- Overall simpler than earlier builds; MVP close enough to show the idea

---

## 2. Demo / video copy (same day)

**Meeting:** [AI agent integrations and demo prep with team feedback](https://notes.granola.ai/d/) · 2026-07-21  
*(Granola note id `not_An6s9vPW74cZ7x`)*

| Topic | Suggestion |
| --- | --- |
| Video opener | Start with a **brief problem statement** (what problem the app solves) |
| Length | **Short** — execs won’t watch long walkthroughs |
| Script | Generate an **exec-oriented** script (Claude/ChatGPT), then refine |
| After team demo | Optional longer deck only if there’s interest |

---

## 3. BOM matching — malformed field UX & warning copy

**Meeting:** [Milos / Lucas](https://notes.granola.ai/d/2219415e-0836-4b97-b187-de673dc54289) · 2026-07-16  
*(Lucas Saeed present for the design ask; session also included product/eng discussion.)*

### Three visual states (design)

1. **Good value** — show as-is  
2. **Malformed** (e.g. UPC in scientific notation) — **distinct** marker (not the same as empty)  
3. **Missing** — existing `?` treatment  

Malformed should nudge the user to **Add Info** in the right panel. Skipping stays allowed, but must feel like a bad idea.

### Copy / messaging principles (from the design discussion)

| Principle | Detail |
| --- | --- |
| Be clear something is wrong | Don’t bury the malformed state |
| Point to the action | “Fix this” → **Add Info** (right panel) |
| Spell out consequences | If they continue without fixing, **say what breaks** (match won’t happen / row unusable) |
| Advise, don’t hard-block | Prefer strong warning over forced completion |

> Framing agreed in-session: be clear there’s something wrong, that there’s an action if they want it, and that **the content explaining what happens if they don’t** must be very clear — there are consequences if they skip.

**Follow-up called out:** create a design ticket for the three states + visual + warning copy.

---

## 4. Content File Manager — interaction UX (review with Lucas + Matt)

**Meeting:** [Content File Mgr - Review](https://notes.granola.ai/d/949b9a0f-85b7-4dc0-a281-04c1474f1ab6) · 2026-07-17  

Granola diarization does not reliably separate Lucas vs Matt on this call. Below are **interaction/UX decisions from the review** (Lucas was in the room; domain/inheritance clarifications sound primarily like Matt).

| Area | Direction |
| --- | --- |
| Row affordance | **Whole row clickable**, not only the “View” label |
| File count | Show **quantity of files** in the row so users know what to expect |
| Layout | **Left-justify** thumbnail next to figure number / SKU |
| Dense file lists | Prefer **fixed-height rows** + expand (“view N files”) over huge multi-line rows |
| Model language | No **inheritance / shared files** between figure number and SKU — SKU is a variant; don’t design screens that imply inheritance |
| Tone of design critique | Push back welcome if a strong UX reason exists — comments are direct, not final law |

Overall: ~95% of the design considered nailed on first pass.

---

## Priority checklist (Worklight)

Actionable items clearly attributed to **Lucas on Granola**, ordered by impact on Today:

1. [x] **UX writing pass** on all Today / task labels (skill or dedicated prompt).  
2. [x] Rename **“Needs your attention”** → **“Needs your input”** (or stronger ownership-confirm wording).  
3. [x] **Reposition confidence %** next to source/accuracy — not next to priority.  
4. [x] Split **status (dropdown)** from **primary CTA**; trim action clutter.  
5. [ ] Demo/video: **problem-first**, short, exec-oriented script.  
6. [ ] (BOM) Design ticket: malformed vs missing vs good + consequence copy for skip.

---

## Source index

| Date | Granola note | UX / copy relevance |
| --- | --- | --- |
| 2026-07-21 | [Milos & Lucas sync](https://notes.granola.ai/d/81d71534-18e4-4b98-aab5-aa8785b9aa34) | Primary Worklight label/layout feedback |
| 2026-07-21 | AI agent integrations & demo prep (`not_An6s9vPW74cZ7x`) | Demo/video copy |
| 2026-07-16 | [Milos / Lucas](https://notes.granola.ai/d/2219415e-0836-4b97-b187-de673dc54289) | Malformed-field UX + warning copy |
| 2026-07-17 | [Content File Mgr - Review](https://notes.granola.ai/d/949b9a0f-85b7-4dc0-a281-04c1474f1ab6) | Row/click/file-count patterns (shared review) |
| 2026-07-09 | Sync My Day early demo (`not_EpXhs2rJJefGnT`) | Positive on concept; UI not prioritized yet |

*Note: Older Milos/Lucas syncs (Mar–Jun 2026) live mainly as Gemini Meet emails in Gmail, not as Granola notes, so they are omitted here.*
