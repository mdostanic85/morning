import "server-only";

let pending: { nextSyncToken: string | null; syncTokenExpired: boolean } | null = null;

export function setPendingCalendarSync(meta: {
  nextSyncToken: string | null;
  syncTokenExpired: boolean;
}): void {
  pending = meta;
}

export function consumePendingCalendarSync(): {
  nextSyncToken: string | null;
  syncTokenExpired: boolean;
} | null {
  const value = pending;
  pending = null;
  return value;
}
