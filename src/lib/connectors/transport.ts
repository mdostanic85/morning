import "server-only";
import type { Connection } from "@/domain/connection";
import type { ConnectionTransport } from "@/domain/connection";

export function getConnectionTransport(connection: Connection | null | undefined): ConnectionTransport {
  const transport = connection?.metadata?.transport;
  return transport === "mcp" ? "mcp" : "api";
}

export function isMcpTransport(connection: Connection | null | undefined): boolean {
  return getConnectionTransport(connection) === "mcp";
}

export function getMcpProvider(connection: Connection | null | undefined): string | null {
  const value = connection?.metadata?.mcpProvider;
  return typeof value === "string" ? value : null;
}
