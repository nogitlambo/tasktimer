const allowedCorsOrigins = new Set([
  "https://tasklaunch.app",
  "https://www.tasklaunch.app",
  "https://preview.tasklaunch.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
]);

export function getAuthenticatedApiCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Firebase-Auth",
    "Access-Control-Max-Age": "600",
  });
  if (allowedCorsOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function authenticatedApiOptions(req: Request) {
  return new Response(null, {
    status: 204,
    headers: getAuthenticatedApiCorsHeaders(req),
  });
}

export function withAuthenticatedApiCors(req: Request, response: Response) {
  const headers = new Headers(response.headers);
  getAuthenticatedApiCorsHeaders(req).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
