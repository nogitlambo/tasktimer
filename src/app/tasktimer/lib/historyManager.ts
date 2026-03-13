export function escapeHistoryManagerHtml(str: unknown) {
  return String(str || "").replace(/[&<>"']/g, (s) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[s] || s;
  });
}
