/**
 * Read-only extractor for the SpaceInch FigJam org chart.
 *
 * Fetches the board via the Figma REST API (PAT from data/connection-secrets.json),
 * applies the column-head decoding rule to distinguish real manager→report edges
 * from peer-stacking layout edges, and writes the result to docs/org/si-org-chart.json.
 *
 * Run:
 *   npx tsx scripts/extractOrgChart.mts
 *
 * No Figma writes. No LLM calls.
 */
import fs from "node:fs";
import path from "node:path";

const FIGMA_FILE_KEY = "DHfQm8F66zFlWB9dxC7CeV";
const FIGMA_BOARD_URL = `https://www.figma.com/board/${FIGMA_FILE_KEY}/SI-org-chart-full`;
const OUT_PATH = path.join(process.cwd(), "docs/org/si-org-chart.json");

// ── Rule version ──────────────────────────────────────────────────────────────
// Version bump this when the decoding algorithm changes so that downstream
// tools can detect a stale cached file.
const RULE_VERSION = 1;

// ── Figma shapes and connectors ───────────────────────────────────────────────

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FigmaNode {
  id: string;
  type: string;
  characters?: string;
  absoluteBoundingBox?: BoundingBox;
  connectorStart?: { endpointNodeId?: string };
  connectorEnd?: { endpointNodeId?: string };
  children?: FigmaNode[];
}

interface FigmaFileResponse {
  name?: string;
  lastModified?: string;
  document?: FigmaNode;
  err?: string;
}

// ── PAT ──────────────────────────────────────────────────────────────────────

function getFigmaPat(): string {
  const secretsPath = path.join(process.cwd(), "data/connection-secrets.json");
  if (!fs.existsSync(secretsPath)) {
    throw new Error(
      `Figma PAT not found. Run the app, connect Figma, then retry.\n(expected at ${secretsPath})`
    );
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8")) as Record<
    string,
    { pat?: string; accessToken?: string } | undefined
  >;
  const token = secrets["figma"]?.pat ?? secrets["figma"]?.accessToken;
  if (!token) {
    throw new Error("Figma connection secret exists but contains no PAT or accessToken.");
  }
  return token;
}

// ── Tree traversal ────────────────────────────────────────────────────────────

interface ShapeRecord {
  id: string;
  raw: string;
  x: number;
  y: number;
}

interface ConnectorRecord {
  sourceId: string;
  targetId: string;
  dx: number;
}

function collectNodesFromDocument(root: FigmaNode): {
  shapes: Map<string, ShapeRecord>;
  connectors: ConnectorRecord[];
} {
  const shapes = new Map<string, ShapeRecord>();
  const connectors: ConnectorRecord[] = [];

  function walk(node: FigmaNode): void {
    if (node.type === "SHAPE_WITH_TEXT") {
      const b = node.absoluteBoundingBox;
      shapes.set(node.id, {
        id: node.id,
        raw: (node.characters ?? "").replace(/\s+/g, " ").trim(),
        x: Math.round(b?.x ?? 0),
        y: Math.round(b?.y ?? 0),
      });
    }
    if (node.type === "CONNECTOR") {
      const s = node.connectorStart?.endpointNodeId;
      const e = node.connectorEnd?.endpointNodeId;
      if (s && e) {
        const sShape = shapes.get(s);
        const eShape = shapes.get(e);
        connectors.push({
          sourceId: s,
          targetId: e,
          // dx is computed after shapes are collected; fill in 0 for now
          dx: sShape && eShape ? eShape.x - sShape.x : 0,
        });
      }
    }
    (node.children ?? []).forEach(walk);
  }

  walk(root);

  // Recompute dx now that all shapes are known (connectors may appear before
  // the shapes they reference during the single-pass traversal).
  for (const conn of connectors) {
    const s = shapes.get(conn.sourceId);
    const e = shapes.get(conn.targetId);
    if (s && e) conn.dx = e.x - s.x;
  }

  return { shapes, connectors };
}

// ── Column-head decoding rule ────────────────────────────────────────────────
//
// The board uses two structurally different connector types:
//
//   Fan-out edge   |dx| >= 5   Real manager → direct report.
//                              Example: Joshua Segall → Ivan Vučak (dx = -4351).
//
//   Same-column    |dx| < 5    Vertical stacking of peers in one visual column.
//                              Example: eight Software Engineers stacked under
//                              Karlo Siladi (dx = 0).
//
// The tolerance MUST be < 5, not < 10, because the real fan-out edge
// Joshua Segall → David Brubacher has dx = -8.
//
// Column-head rule: the true manager of person N is the first ancestor reached
// by following parent edges whose incoming edge is a fan-out (|dx| >= 5).
//
//   head(n)    = n                    if n has no parent, or incoming edge is fan-out
//              = head(parent(n))      if incoming edge is same-column
//
//   manager(n) = parent(n)            if head(n) === n   (N is column head itself)
//              = head(n)              otherwise           (N is a peer in a column)

const SAME_COLUMN_THRESHOLD = 5; // |dx| < 5 → same-column peer edge

function buildHierarchy(
  shapes: Map<string, ShapeRecord>,
  connectors: ConnectorRecord[]
): {
  parentOf: Map<string, string>;
  managerOf: Map<string, string>;
  childrenOf: Map<string, string[]>;
} {
  const parentOf = new Map<string, string>();
  for (const { sourceId, targetId } of connectors) {
    if (shapes.has(sourceId) && shapes.has(targetId)) {
      parentOf.set(targetId, sourceId);
    }
  }

  function head(id: string): string {
    const p = parentOf.get(id);
    if (!p) return id;
    const s = shapes.get(id)!;
    const ps = shapes.get(p)!;
    const dx = Math.abs(s.x - ps.x);
    if (dx >= SAME_COLUMN_THRESHOLD) return id; // incoming edge is fan-out → I am a column head
    return head(p); // same-column: climb up
  }

  const managerOf = new Map<string, string>();
  for (const id of shapes.keys()) {
    const p = parentOf.get(id);
    if (!p) continue;
    const h = head(id);
    // If I am the column head my manager is my direct parent; otherwise my
    // column head is my manager.
    managerOf.set(id, h === id ? p : h);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, manager] of managerOf) {
    if (!childrenOf.has(manager)) childrenOf.set(manager, []);
    childrenOf.get(manager)!.push(child);
  }

  return { parentOf, managerOf, childrenOf };
}

// ── Title parser ──────────────────────────────────────────────────────────────
//
// Raw text format: "FirstName LastName Title Location, Region"
// Title is matched longest-first to avoid partial matches.

const KNOWN_TITLES = [
  "CEO",
  "CTO",
  "CPO/COO",
  "QA Engineering Manager",
  "QA Automation Engineer",
  "Engineering Manager",
  "SVP of Engineering",
  "Director of Engineering",
  "Sr. Dir of Product Management",
  "Software Engineer",
  "Design Team Lead",
  "Designer",
  "Assistant Product Manager",
  "Product Manager",
  "Director of People",
  "Sr. Talent Acquisition Specialist",
  "Recruiter",
  "Director of Finance",
  "Head of Administration",
  "Bookkeeper/Accountant",
  "Assistant to the CEO",
].sort((a, b) => b.length - a.length); // longest first to avoid "Product Manager" matching inside "Sr. Dir..."

interface ParsedPerson {
  name: string;
  title: string;
  location: string;
  parseNote: string | null;
}

function parseRawText(raw: string): ParsedPerson {
  for (const title of KNOWN_TITLES) {
    const withSpaces = ` ${title} `;
    const idx = raw.indexOf(withSpaces);
    if (idx > 0) {
      return {
        name: raw.slice(0, idx).trim(),
        title,
        location: raw.slice(idx + withSpaces.length).trim(),
        parseNote: null,
      };
    }
    if (raw.endsWith(` ${title}`)) {
      return {
        name: raw.slice(0, raw.length - title.length - 1).trim(),
        title,
        location: "",
        parseNote: null,
      };
    }
  }
  // No known title found. Best-effort: first two words are the name,
  // everything after is an unknown remainder that may include location.
  // This keeps "Mitchell Maddox Austin, TX" from landing entirely in `name`.
  const words = raw.split(/\s+/);
  const name = words.slice(0, 2).join(" ");
  const remainder = words.slice(2).join(" ");
  return {
    name,
    title: "",
    location: remainder,
    parseNote: `No known title found in: "${raw}"`,
  };
}

// ── Depth ─────────────────────────────────────────────────────────────────────

function computeDepth(id: string, managerOf: Map<string, string>, cache: Map<string, number>): number {
  if (cache.has(id)) return cache.get(id)!;
  const m = managerOf.get(id);
  if (!m) {
    cache.set(id, 0);
    return 0;
  }
  const d = 1 + computeDepth(m, managerOf, cache);
  cache.set(id, d);
  return d;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

interface Anomaly {
  kind: "ic_with_reports" | "missing_title" | "parse_failed";
  name: string;
  figmaNodeId: string;
  detail: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface OrgChartPerson {
  figmaNodeId: string;
  name: string;
  title: string;
  location: string;
  managerName: string | null;
  depth: number;
}

export interface OrgChart {
  provenance: {
    fileKey: string;
    boardUrl: string;
    lastModified: string;
    extractedAt: string;
    ruleVersion: number;
    shapeCount: number;
    connectorCount: number;
    rosterCount: number;
  };
  roster: OrgChartPerson[];
  anomalies: Anomaly[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function extract(): Promise<OrgChart> {
  const pat = getFigmaPat();

  console.log(`Fetching FigJam board ${FIGMA_FILE_KEY}…`);
  const resp = await fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`, {
    headers: { "X-Figma-Token": pat },
  });

  const json = (await resp.json()) as FigmaFileResponse;
  if (!resp.ok) {
    throw new Error(`Figma API error ${resp.status}: ${json.err ?? JSON.stringify(json)}`);
  }
  if (!json.document) {
    throw new Error("Figma response contained no document.");
  }

  const { shapes, connectors } = collectNodesFromDocument(json.document);
  console.log(`  shapes: ${shapes.size}  connectors (both ends present): ${connectors.length}`);

  const { managerOf, childrenOf } = buildHierarchy(shapes, connectors);

  const parsed = new Map<string, ParsedPerson>();
  for (const [id, shape] of shapes) {
    parsed.set(id, parseRawText(shape.raw));
  }

  const depthCache = new Map<string, number>();
  for (const id of shapes.keys()) computeDepth(id, managerOf, depthCache);

  const IC_MANAGEMENT_TITLES = new Set(["Software Engineer"]); // titles that indicate ICs, not management
  const anomalies: Anomaly[] = [];

  const roster: OrgChartPerson[] = [...shapes.keys()]
    .sort((a, b) => (depthCache.get(a) ?? 0) - (depthCache.get(b) ?? 0) || a.localeCompare(b))
    .map((id) => {
      const p = parsed.get(id)!;
      const managerId = managerOf.get(id) ?? null;
      const managerParsed = managerId ? parsed.get(managerId) : null;

      // Record anomalies but do not suppress the person.
      if (!p.title) {
        anomalies.push({
          kind: "missing_title",
          name: p.name,
          figmaNodeId: id,
          detail: p.parseNote ?? "No title parsed",
        });
      }
      if (p.parseNote && p.title) {
        // partial parse issue; just note it
      }
      const reports = childrenOf.get(id) ?? [];
      if (p.title && IC_MANAGEMENT_TITLES.has(p.title) && reports.length > 0) {
        anomalies.push({
          kind: "ic_with_reports",
          name: p.name,
          figmaNodeId: id,
          detail: `Title "${p.title}" is an IC role but has ${reports.length} direct report(s) in the chart. These are column-head artifacts — the column-head decoding rule already treats them correctly; this anomaly records the tension with the stated title.`,
        });
      }

      return {
        figmaNodeId: id,
        name: p.name,
        title: p.title,
        location: p.location,
        managerName: managerParsed?.name ?? null,
        depth: depthCache.get(id) ?? 0,
      };
    });

  return {
    provenance: {
      fileKey: FIGMA_FILE_KEY,
      boardUrl: FIGMA_BOARD_URL,
      lastModified: json.lastModified ?? "(unknown)",
      extractedAt: new Date().toISOString(),
      ruleVersion: RULE_VERSION,
      shapeCount: shapes.size,
      connectorCount: connectors.length,
      rosterCount: roster.length,
    },
    roster,
    anomalies,
  };
}

async function main(): Promise<void> {
  const chart = await extract();

  const outDir = path.dirname(OUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(chart, null, 2), "utf-8");

  console.log(`\nWrote ${chart.provenance.rosterCount} people to ${OUT_PATH}`);
  console.log(`Anomalies: ${chart.anomalies.length}`);
  for (const a of chart.anomalies) {
    console.log(`  [${a.kind}] ${a.name} — ${a.detail.slice(0, 100)}`);
  }
}

main().catch((err) => {
  console.error("extractOrgChart failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
