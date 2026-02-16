export function nowMs(): number {
  return Date.now();
}

export function formatTwo(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const dd = String(d).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${dd}:${hh}:${mm}:${ss}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  try {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toLocaleString();
  }
}
