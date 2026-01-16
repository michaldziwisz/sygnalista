export function json(status: number, body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export function notFound(): Response {
  return json(404, { error: { code: "not_found", message: "Not found" } });
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    405,
    { error: { code: "method_not_allowed", message: `Allowed: ${allowed.join(", ")}` } },
    { headers: { allow: allowed.join(", ") } }
  );
}

export function badRequest(message: string, details?: unknown): Response {
  return json(400, { error: { code: "bad_request", message, details } });
}

export function unauthorized(message = "Unauthorized"): Response {
  return json(401, { error: { code: "unauthorized", message } });
}

export function tooManyRequests(message = "Too many requests"): Response {
  return json(429, { error: { code: "too_many_requests", message } });
}

export function internalError(message = "Internal error"): Response {
  return json(500, { error: { code: "internal_error", message } });
}

export function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  if (origin) headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-sygnalista-app-token");
  headers.set("access-control-max-age", "86400");
  return new Response(response.body, { status: response.status, headers });
}

