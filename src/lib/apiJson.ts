function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getContentType(response: Response) {
  return asString(response.headers.get("content-type")).toLowerCase();
}

function buildNonJsonError(response: Response, fallbackMessage: string, body: string) {
  const contentType = getContentType(response) || "unknown";
  const bodyPreview = body.replace(/\s+/g, " ").trim().slice(0, 120);
  const status = response.status ? `HTTP ${response.status}` : "HTTP request";
  const detail = bodyPreview ? ` (${contentType}: ${bodyPreview})` : ` (${contentType})`;
  return new Error(`${fallbackMessage} ${status}${detail}`);
}

export async function readApiJson<T extends Record<string, unknown>>(response: Response, fallbackMessage: string) {
  const contentType = getContentType(response);
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  const body = await response.text().catch(() => "");
  throw buildNonJsonError(response, fallbackMessage, body);
}
