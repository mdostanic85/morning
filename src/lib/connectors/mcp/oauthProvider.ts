import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  clearConnectionSecret,
  getConnectionSecret,
  saveConnectionSecret,
} from "@/services/connectionSecrets";

export interface McpOAuthState {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  oauthState?: string;
}

type PersistMcpOAuthState = (state: McpOAuthState) => Promise<void>;
type ClearMcpOAuthState = () => Promise<void>;

function secretProvider(provider: string): string {
  return `mcp:${provider}`;
}

function asMcpOAuthState(value: unknown): McpOAuthState {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as McpOAuthState)
    : {};
}

export async function readMcpOAuthState(provider: string): Promise<McpOAuthState> {
  const secret = await getConnectionSecret(secretProvider(provider));
  return asMcpOAuthState(secret?.mcpOAuth);
}

async function writeMcpOAuthState(provider: string, state: McpOAuthState): Promise<void> {
  await saveConnectionSecret(secretProvider(provider), {
    mcpOAuth: state as Record<string, unknown>,
  });
}

export async function clearMcpOAuthState(provider: string): Promise<void> {
  await clearConnectionSecret(secretProvider(provider));
}

/**
 * MCP's OAuth interface exposes synchronous credential getters, so each
 * request loads the encrypted state once and keeps an in-memory snapshot.
 * Every SDK mutation is immediately persisted back to the user-scoped DB row.
 */
export class DatabaseMcpOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly provider: string,
    private readonly origin: string,
    private currentState: McpOAuthState,
    private readonly persistState: PersistMcpOAuthState,
    private readonly clearState: ClearMcpOAuthState
  ) {}

  get redirectUrl(): URL {
    return new URL(`/api/mcp/${this.provider}/callback`, this.origin);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Worklight",
      redirect_uris: [this.redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    if (!this.currentState.oauthState) {
      throw new Error("Missing MCP OAuth state. Please reconnect this source.");
    }
    return this.currentState.oauthState;
  }

  assertOAuthState(receivedState: string | null): void {
    const expectedState = this.currentState.oauthState;
    if (!expectedState || !receivedState) {
      throw new Error("Missing MCP OAuth state. Please try connecting again.");
    }
    const expected = Buffer.from(expectedState);
    const received = Buffer.from(receivedState);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new Error("Invalid MCP OAuth state. Please try connecting again.");
    }
  }

  async clearAuthorizationState(): Promise<void> {
    delete this.currentState.oauthState;
    delete this.currentState.codeVerifier;
    await this.persistState(this.currentState);
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.currentState.clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    this.currentState.clientInformation = clientInformation;
    await this.persistState(this.currentState);
  }

  tokens(): OAuthTokens | undefined {
    return this.currentState.tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    this.currentState.tokens = tokens;
    await this.persistState(this.currentState);
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    // Overridden by ConnectMcpOAuthProvider during the connect route.
    throw new Error(`MCP authorization required: ${authorizationUrl.toString()}`);
  }

  async saveCodeVerifier(codeVerifier: string) {
    this.currentState.codeVerifier = codeVerifier;
    await this.persistState(this.currentState);
  }

  codeVerifier(): string {
    const verifier = this.currentState.codeVerifier;
    if (!verifier) throw new Error("Missing OAuth code verifier. Please try connecting again.");
    return verifier;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.currentState.discoveryState;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    this.currentState.discoveryState = state;
    await this.persistState(this.currentState);
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") {
      this.currentState = {};
      await this.clearState();
      return;
    }
    if (scope === "client") delete this.currentState.clientInformation;
    if (scope === "tokens") delete this.currentState.tokens;
    if (scope === "verifier") delete this.currentState.codeVerifier;
    if (scope === "discovery") delete this.currentState.discoveryState;
    await this.persistState(this.currentState);
  }
}

/**
 * Route-handler variant that captures the authorization URL instead of redirecting.
 */
export class ConnectMcpOAuthProvider extends DatabaseMcpOAuthProvider {
  authorizationUrl: URL | null = null;

  override async redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }
}

function persistence(provider: string): {
  save: PersistMcpOAuthState;
  clear: ClearMcpOAuthState;
} {
  return {
    save: (state) => writeMcpOAuthState(provider, state),
    clear: () => clearMcpOAuthState(provider),
  };
}

export async function createMcpOAuthProvider(
  provider: string,
  origin: string
): Promise<DatabaseMcpOAuthProvider> {
  const state = await readMcpOAuthState(provider);
  const store = persistence(provider);
  return new DatabaseMcpOAuthProvider(provider, origin, state, store.save, store.clear);
}

export async function createConnectMcpOAuthProvider(
  provider: string,
  origin: string
): Promise<ConnectMcpOAuthProvider> {
  const state = await readMcpOAuthState(provider);
  state.oauthState = randomBytes(32).toString("base64url");
  await writeMcpOAuthState(provider, state);
  const store = persistence(provider);
  return new ConnectMcpOAuthProvider(provider, origin, state, store.save, store.clear);
}
