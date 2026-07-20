export type TestPingResult = {
  note: string;
  message: string;
  completedAt: string;
};

let lastTestPingResult: TestPingResult | null = null;

export function setLastTestPingResult(result: TestPingResult): void {
  lastTestPingResult = result;
}

export function getLastTestPingResult(): TestPingResult | null {
  return lastTestPingResult;
}
