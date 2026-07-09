import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";

interface McpOAuthFile {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
}

const oauthDir = path.join(process.cwd(), "data", "mcp-oauth");

function filePath(provider: string): string {
  return path.join(oauthDir, `${provider}.json`);
}

function readFile(provider: string): McpOAuthFile {
  const file = filePath(provider);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as McpOAuthFile;
  } catch {
    return {};
  }
}

export function readMcpOAuthFile(provider: string): McpOAuthFile {
  return readFile(provider);
}

function writeFile(provider: string, data: McpOAuthFile) {
  if (!fs.existsSync(oauthDir)) fs.mkdirSync(oauthDir, { recursive: true });
  fs.writeFileSync(filePath(provider), JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function clearMcpOAuthState(provider: string) {
  const file = filePath(provider);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export class FileMcpOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly provider: string,
    private readonly origin: string
  ) {}

  get redirectUrl(): URL {
    return new URL(`/api/mcp/${this.provider}/callback`, this.origin);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Vantage",
      redirect_uris: [this.redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return readFile(this.provider).clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    const data = readFile(this.provider);
    data.clientInformation = clientInformation;
    writeFile(this.provider, data);
  }

  tokens(): OAuthTokens | undefined {
    return readFile(this.provider).tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    const data = readFile(this.provider);
    data.tokens = tokens;
    writeFile(this.provider, data);
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    // Overridden by ConnectMcpOAuthProvider during the connect route.
    throw new Error(`MCP authorization required: ${authorizationUrl.toString()}`);
  }

  async saveCodeVerifier(codeVerifier: string) {
    const data = readFile(this.provider);
    data.codeVerifier = codeVerifier;
    writeFile(this.provider, data);
  }

  codeVerifier(): string {
    const verifier = readFile(this.provider).codeVerifier;
    if (!verifier) throw new Error("Missing OAuth code verifier. Please try connecting again.");
    return verifier;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return readFile(this.provider).discoveryState;
  }

  async saveDiscoveryState(state: OAuthDiscoveryState) {
    const data = readFile(this.provider);
    data.discoveryState = state;
    writeFile(this.provider, data);
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    const data = readFile(this.provider);
    if (scope === "all") {
      clearMcpOAuthState(this.provider);
      return;
    }
    if (scope === "client") delete data.clientInformation;
    if (scope === "tokens") delete data.tokens;
    if (scope === "verifier") delete data.codeVerifier;
    if (scope === "discovery") delete data.discoveryState;
    writeFile(this.provider, data);
  }
}

/**
 * Route-handler variant that captures the authorization URL instead of redirecting.
 */
export class ConnectMcpOAuthProvider extends FileMcpOAuthProvider {
  authorizationUrl: URL | null = null;

  override async redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl;
  }
}
