import { handleReport } from "./report.js";
import { json, methodNotAllowed, notFound, withCors } from "./response.js";

export interface Env {
  APP_REPO_MAP: string;
  INTAKE_REPO: string;
  INTAKE_BRANCH?: string;

  GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;

  APP_TOKEN_MAP?: string;

  RATE_LIMIT_PER_MINUTE?: string;
  MAX_LOG_BASE64_LENGTH?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(json(200, { ok: true }), request);
    }

    if (url.pathname === "/v1/report") {
      if (request.method !== "POST") return withCors(methodNotAllowed(["POST"]), request);
      return withCors(await handleReport(request, env), request);
    }

    return withCors(notFound(), request);
  }
};
