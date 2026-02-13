export function cryptoRandomId(): string {
  try {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return arr[0].toString(16) + arr[1].toString(16);
  } catch {
    return Math.random().toString(16).slice(2);
  }
}

export function newTaskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

export function escapeRegExp(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}