export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CONNECTION_AUTH_TYPES = ["oauth", "api_key", "pat", "mcp", "none"] as const;
export type ConnectionAuthType = (typeof CONNECTION_AUTH_TYPES)[number];

export const CONNECTION_TRANSPORTS = ["api", "mcp"] as const;
export type ConnectionTransport = (typeof CONNECTION_TRANSPORTS)[number];

export interface Connection {
  id: number;
  provider: string;
  status: ConnectionStatus;
  authType: ConnectionAuthType;
  scopes: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type NewConnection = Pick<Connection, "provider" | "authType"> &
  Partial<Pick<Connection, "status" | "scopes" | "metadata">>;

export type ConnectionPatch = Partial<Omit<Connection, "id" | "createdAt" | "updatedAt">>;
