# SpaceInch Org Chart — Hierarchy Decoding Rules

**Source board:** [SI org chart full](https://www.figma.com/board/DHfQm8F66zFlWB9dxC7CeV/SI-org-chart-full)
**Extractor:** `scripts/extractOrgChart.mts` (rule version 1)
**Last extracted:** see `docs/org/si-org-chart.json` → `provenance.extractedAt`

---

## Board structure

The FigJam board contains exactly **92 `SHAPE_WITH_TEXT` nodes** (one per person)
and **91 `CONNECTOR` nodes** (one connector per graph edge). Each connector
points from a manager or column-head to a report.

Shapes have `absoluteBoundingBox` coordinates. The horizontal displacement
(`dx = targetX − sourceX`) between the connected shapes is the critical signal.

---

## Two edge classes

### Fan-out edge — real manager → direct report

**Criterion:** `|dx| >= 5`

These connectors spread the tree horizontally: a manager sits at one x-position
and its direct reports fan out to different x-positions.

Examples measured from the board:

| Source | Target | dx |
|---|---|---|
| Joshua Segall (CEO) | Ivan Vučak (Dir. Eng) | −4 351 |
| Joshua Segall (CEO) | David Brubacher (CPO/COO) | −8 |
| Marko Barić (Eng. Mgr) | child #1 (leftmost) | −1 684 |
| Marko Barić (Eng. Mgr) | child #9 (rightmost) | +1 684 |

### Same-column edge — peer stacking inside a visual column

**Criterion:** `|dx| < 5` (typically `dx == 0`)

These connectors stack people vertically within a single column of the visual
layout. They are layout artefacts, **not** reporting relationships.

Examples:

| Source | Target | dx | dy |
|---|---|---|---|
| Karlo Siladi (column head) | Software Engineer below | 0 | ~210 |
| Goran Nikšić (column head) | Software Engineer below | 0 | ~200 |

---

## Tolerance rationale: `< 5`, not `< 10`

The real fan-out edge `Joshua Segall → David Brubacher` has `dx = −8`.

If the threshold were `< 10`, this edge would be classified as same-column,
collapsing all six Product Managers directly under the CEO and producing an
incorrect hierarchy. The threshold `< 5` keeps this edge as a fan-out while
still capturing all zero-dx peer stacking edges observed on the board.

---

## Column-head rule (pseudocode)

```
head(n):
  parent = parentOf(n)
  if parent is nil:
    return n                         # root has no parent
  dx = abs(x(n) - x(parent))
  if dx >= 5:
    return n                         # incoming edge is fan-out → n is column head
  return head(parent)                # same-column → climb to column head

manager(n):
  if head(n) == n:
    return parentOf(n)               # n is column head; its manager is its direct parent
  else:
    return head(n)                   # n is a peer; its manager is the column head
```

---

## One-level-at-a-time escalation rule

Escalation paths walk **exactly one level up** per step. No level is ever
skipped. The rule mirrors the user's stated structure:

> "Miloš Dostanić does not report directly to BRU. If something needs to reach
> BRU, it goes through Lucas or Matt. I personally report directly to Lucas."

Verified paths from the generated roster:

```
Miloš Dostanić  →  Lucas Saeed  →  David Brubacher  →  Joshua Segall
Matt Pettit     →  David Brubacher  →  Joshua Segall
```

---

## Known data-quality conflicts

These four conflicts are recorded in the `anomalies` array in `si-org-chart.json`
and must be carried into any downstream audit.

### 1. IC-titled column heads (13 records)

The following people hold the title "Software Engineer" yet appear as column
heads with direct reports in the board layout. The column-head decoding rule
assigns them correctly as managers of those columns, but their title does not
reflect management authority. An audit or implementation that relies on title
matching would undercount these managers.

People affected: Karlo Siladi (8 reports), Goran Nikšić (7), Ivan Pavao
Lozančić (5), Renato-Zaneto Lukež (4), Paulo Radicchi (3), Neven Mendrila (3),
Ivan Lozić (2), Josip Pavlović (2), Tassio Jordao Silva (2), Ivan Lacković (2),
Filip Gadžo (1), Jakob Yousri (1), Leonardo Balsalobre (1).

### 2. Unparseable title: Mitchell Maddox

Raw text: `Mitchell Maddox Austin, TX`. No known title token is present.
The extractor now falls back to treating the first two words as `name` and
the remainder as `location`, so the stored record reads `name: "Mitchell Maddox"`,
`title: ""`, `location: "Austin, TX"`. The `missing_title` anomaly is still
emitted. His reporting line (depth 2, reports to David Brubacher) is correctly
extracted.

**Extractor fix applied:** `scripts/extractOrgChart.mts` — `parseRawText` now
uses a two-word name heuristic for cards with no recognised title token, instead
of storing the entire raw string as the name.

### 3. Figma vs. Confluence conflict: Ivan Dumančić / Karlo Siladi / Filip Gadžo

[Confluence — Space Inch Team](https://ooden.atlassian.net/wiki/spaces/apollo/pages/420347910)
(v3, last updated 2025-01-28) asserts:

- `Ivan Dumančić — Team Lead` over `Karlo Siladi` and `Filip Gadžo`

The Figma board instead places all three as siblings under Marko Barić, with no
Team Lead distinction. Additionally, Confluence lists `Ilija Istuk` who does not
appear anywhere in the Figma board.

**Resolution for downstream use:** treat the Figma board as authoritative for
reporting structure (it is more recent, last modified 2026-07-16), and flag
the Confluence discrepancy as a known conflict.

### 4. First-name collisions

The roster contains **10 first names shared by 27 people**, which makes
first-name-only stakeholder matching ambiguous:

| First name | Count | Affected full names |
|---|---|---|
| ivan | 7 | Ivan Vučak, Ivan Pavao Lozančić, Ivan Dumančić, Ivan Lozić, Ivan Lacković, Ivan Jurić, Ivan (one more) |
| luka | 4 | (various) |
| lucas | 2 | **Lucas Saeed** (Design Team Lead, CPO/COO reports), **Lucas Thomas** (Software Engineer) |
| david | 2 | David Brubacher (CPO/COO), David (one more) |
| mateo, karlo, neven, goran, alex, ante | 2 each | — |

**Critical collision:** `lucas`. The code previously used `stakeholders: ["Matt", "Lucas"]`
matched as a bare first name with substring matching. Lucas Thomas is a Software
Engineer; Lucas Saeed is the Design Team Lead who reports to the CPO/COO. A
transcript quoting Lucas Thomas would receive the same authority boost as Lucas Saeed.

**Fix applied:** `DEFAULT_HYDRA_CONFIG.stakeholders` now holds `["Matt Pettit", "Lucas Saeed"]`.
`src/lib/tasks/highAuthorityPeople.ts` declares the canonical table with explicit
aliases (`"Lucas"` resolves exclusively to Lucas Saeed via word-boundary matching).
Substring matching has been replaced throughout.

---

## Note: `depth <= 2` is NOT a usable authority test

The audit confirmed that depth in the extracted roster is a layout artefact of the
Figma board's column-stacking, not a proxy for seniority or authority. IC-titled
column heads (e.g. Karlo Siladi, `depth 2`) have the same depth as Product Managers
and the CPO/COO. Do not use `depth <= 2` as a heuristic for "high authority person"
in any code path or filter.
