export function toIso(date: Date) {
  return date.toISOString();
}

export function addMs(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

export function addMinutes(date: Date, minutes: number) {
  return addMs(date, minutes * 60_000);
}

export function addHours(date: Date, hours: number) {
  return addMs(date, hours * 3_600_000);
}

export function parseIsoMs(iso: string) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

