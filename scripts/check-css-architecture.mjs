import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const tokenFile = path.join(sourceRoot, "styles", "tokens.css");
const vendorRoot = path.join(sourceRoot, "styles", "vendor");
const baseFile = path.join(sourceRoot, "styles", "base.css");
const forbiddenGlobalPrefixes = [
  "brief-",
  "chat-",
  "decide-",
  "meetings-",
  "minimal-",
  "ni-",
  "type-heading-",
  "welcome-beam",
];

function collectFiles(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(target, extension);
    return entry.name.endsWith(extension) ? [target] : [];
  });
}

function relative(file) {
  return path.relative(projectRoot, file);
}

function atRuleContext(node) {
  const context = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "atrule") context.unshift(`@${parent.name} ${parent.params}`);
  }
  return context.join(" > ");
}

function hasAncestor(node, predicate) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (predicate(parent)) return true;
  }
  return false;
}

const errors = [];
const cssFiles = collectFiles(sourceRoot, ".css");
const sourceFiles = [
  ...collectFiles(sourceRoot, ".ts"),
  ...collectFiles(sourceRoot, ".tsx"),
];
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

for (const file of cssFiles) {
  const isModule = file.endsWith(".module.css");
  const isVendor = file.startsWith(`${vendorRoot}${path.sep}`);
  const root = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  const selectors = new Map();

  root.walkDecls((declaration) => {
    if (
      file !== tokenFile &&
      /(?:#[\da-f]{3,8}\b|(?:rgb|hsl|hwb|lab|lch|oklab|oklch)a?\()/i.test(
        declaration.value
      )
    ) {
      errors.push(
        `${relative(file)}:${declaration.source.start.line} raw color outside tokens.css`
      );
    }

    const reducedMotionException =
      file === baseFile &&
      hasAncestor(
        declaration,
        (node) =>
          node.type === "atrule" &&
          node.name === "media" &&
          node.params.includes("prefers-reduced-motion")
      );
    if (declaration.important && !isVendor && !reducedMotionException) {
      errors.push(
        `${relative(file)}:${declaration.source.start.line} !important outside vendor CSS`
      );
    }
  });

  root.walkRules((rule) => {
    const line = rule.source.start.line;
    const normalized = rule.selector.replace(/\s+/g, " ").trim();
    const context = atRuleContext(rule);
    const key = `${context}::${normalized}`;

    if (selectors.has(key)) {
      errors.push(
        `${relative(file)}:${line} duplicate selector (first at ${selectors.get(key)})`
      );
    } else {
      selectors.set(key, line);
    }

    if (rule.nodes.length === 0) {
      errors.push(`${relative(file)}:${line} empty rule`);
    }

    const insideKeyframes = hasAncestor(
      rule,
      (node) => node.type === "atrule" && node.name.endsWith("keyframes")
    );
    const insideLayer = hasAncestor(
      rule,
      (node) => node.type === "atrule" && node.name === "layer"
    );
    // CSS Modules stay unlayered on purpose. Next.js may emit their chunks
    // before globals.css; assigning a named layer there would establish the
    // global layer order before the canonical declaration in globals.css.
    if (!isModule && !insideKeyframes && !insideLayer) {
      errors.push(`${relative(file)}:${line} application rule is outside a cascade layer`);
    }

    if (!isModule && !isVendor) {
      for (const prefix of forbiddenGlobalPrefixes) {
        if (normalized.includes(`.${prefix}`)) {
          errors.push(
            `${relative(file)}:${line} component/page selector must live in a CSS Module`
          );
        }
      }

      if (
        normalized === "[id]" ||
        (!normalized.startsWith(
          ":where(button, a, input, textarea, select, summary):focus-visible"
        ) &&
          /(^|,)\s*(button|a|input|textarea|select|summary)\s*(,|$)/.test(normalized))
      ) {
        errors.push(`${relative(file)}:${line} overly broad global selector`);
      }
    }

    if (isModule && normalized.includes(":global(")) {
      errors.push(`${relative(file)}:${line} permanent :global() escape in CSS Module`);
    }
  });

  if (isModule) {
    const importPath = `./${path.basename(file)}`;
    const aliasImportPath = relative(file).replace(/^src\//, "@/");
    if (!sourceText.includes(importPath) && !sourceText.includes(aliasImportPath)) {
      errors.push(`${relative(file)} has no TypeScript owner import`);
    }
  }
}

if (errors.length > 0) {
  console.error("CSS architecture check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`CSS architecture check passed (${cssFiles.length} files).`);
