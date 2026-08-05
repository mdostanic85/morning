/**
 * YYYY-MM-DD in the user's local timezone. `toISOString().slice(0, 10)` is
 * wrong here — it returns the UTC date, which is off by one for evening work
 * in UTC+ timezones (exactly when "End day" runs).
 */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Hello";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
