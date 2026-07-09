import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const home = os.homedir();
  const cwd = process.cwd();
  return resolved === home || resolved.startsWith(`${home}${path.sep}`) || resolved.startsWith(`${cwd}${path.sep}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("path")?.trim();
  const currentPath = requested ? path.resolve(requested) : os.homedir();

  if (!isPathAllowed(currentPath)) {
    return NextResponse.json({ error: "Path is outside the allowed directories." }, { status: 403 });
  }
  if (!fs.existsSync(currentPath)) {
    return NextResponse.json({ error: "Path does not exist." }, { status: 404 });
  }

  const stat = fs.statSync(currentPath);
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "Path is not a directory." }, { status: 400 });
  }

  const parent = path.dirname(currentPath);
  const entries = fs
    .readdirSync(currentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name),
      kind: "directory" as const,
      isGitRepo: fs.existsSync(path.join(currentPath, entry.name, ".git")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    path: currentPath,
    parent: parent !== currentPath && isPathAllowed(parent) ? parent : null,
    isGitRepo: fs.existsSync(path.join(currentPath, ".git")),
    entries,
  });
}
