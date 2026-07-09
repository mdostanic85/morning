import "server-only";

// This is the only import path the app (route handlers, server components,
// services) should use to reach the database. The `server-only` guard turns
// an accidental import from a client component into a build error.
// Standalone scripts (migrations) import `./connection` directly since
// they never run inside the Next.js client bundle.
export { db } from "./connection";
