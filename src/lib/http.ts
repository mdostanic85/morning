import "server-only";

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * `fetch` with a hard timeout, so a hung external API (connector sync, OAuth
 * token exchange) can never stall a request handler indefinitely. Callers can
 * still pass their own `signal` to override.
 */
export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {};
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
    ...rest,
  });
}
