export function isJiraDoneStatus(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  return /done|closed|resolved|complete/i.test(status.toLowerCase());
}
