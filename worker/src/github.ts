import type { Env } from "./index.js";
import { createGitHubAppJwt } from "./jwt.js";

type GitHubAuth =
  | { kind: "token"; token: string }
  | {
      kind: "app";
      appId: string;
      installationId: string;
      privateKeyPem: string;
    };

function getAuth(env: Env): GitHubAuth | null {
  if (env.GITHUB_TOKEN) return { kind: "token", token: env.GITHUB_TOKEN };

  if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_APP_INSTALLATION_ID) {
    return {
      kind: "app",
      appId: env.GITHUB_APP_ID,
      installationId: env.GITHUB_APP_INSTALLATION_ID,
      privateKeyPem: env.GITHUB_APP_PRIVATE_KEY
    };
  }

  return null;
}

function githubHeaders(token: string, scheme: "Bearer" | "token" = "Bearer"): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `${scheme} ${token}`,
    "user-agent": "sygnalista-worker",
    "x-github-api-version": "2022-11-28"
  };
}

function ensureOk(response: Response, context: string): Promise<Response> {
  if (response.ok) return Promise.resolve(response);
  return response.text().then((text) => {
    throw new Error(`${context}: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  });
}

let cachedInstallationToken:
  | { token: string; expiresAtEpochMs: number; installationId: string }
  | null = null;

async function getInstallationToken(auth: Extract<GitHubAuth, { kind: "app" }>): Promise<string> {
  const now = Date.now();
  if (
    cachedInstallationToken &&
    cachedInstallationToken.installationId === auth.installationId &&
    now < cachedInstallationToken.expiresAtEpochMs - 60_000
  ) {
    return cachedInstallationToken.token;
  }

  const jwt = await createGitHubAppJwt({
    appId: auth.appId,
    privateKeyPem: auth.privateKeyPem
  });

  const url = `https://api.github.com/app/installations/${encodeURIComponent(
    auth.installationId
  )}/access_tokens`;
  const resp = await fetch(url, {
    method: "POST",
    headers: githubHeaders(jwt, "Bearer")
  });
  await ensureOk(resp, "GitHub create installation token");
  const json = (await resp.json()) as { token: string; expires_at: string };
  const expiresAtEpochMs = Date.parse(json.expires_at);
  cachedInstallationToken = {
    token: json.token,
    expiresAtEpochMs,
    installationId: auth.installationId
  };
  return json.token;
}

async function getApiToken(
  env: Env
): Promise<{ token: string; scheme: "Bearer" | "token" } | null> {
  const auth = getAuth(env);
  if (!auth) return null;
  if (auth.kind === "token") return { token: auth.token, scheme: "token" };
  const token = await getInstallationToken(auth);
  return { token, scheme: "Bearer" };
}

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CreateIssueResult {
  number: number;
  url: string;
  html_url: string;
}

export interface PutFileInput {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  contentBase64: string;
}

export interface GitHubClient {
  createIssue(input: CreateIssueInput): Promise<CreateIssueResult>;
  putFile(input: PutFileInput): Promise<void>;
  base64EncodeUtf8(text: string): string;
}

export async function getGitHubClient(env: Env): Promise<GitHubClient | null> {
  const auth = await getApiToken(env);
  if (!auth) return null;
  const token = auth.token;
  const scheme = auth.scheme;

  async function githubFetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(githubHeaders(token, scheme));
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) || {})) {
      headers.set(k, v);
    }
    const resp = await fetch(url, { ...init, headers });
    return resp;
  }

  async function createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
    const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
      input.repo
    )}/issues`;
    const resp = await githubFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        labels: input.labels
      })
    });

    if (!resp.ok && input.labels?.length) {
      // Labels may not exist in repo; retry without them.
      const retry = await githubFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          title: input.title,
          body: input.body
        })
      });
      await ensureOk(retry, "GitHub create issue (no labels)");
      const json = (await retry.json()) as CreateIssueResult;
      return json;
    }

    await ensureOk(resp, "GitHub create issue");
    const json = (await resp.json()) as CreateIssueResult;
    return json;
  }

  async function putFile(input: PutFileInput): Promise<void> {
    const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
      input.repo
    )}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}`;
    const resp = await githubFetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        message: input.message,
        content: input.contentBase64,
        branch: input.branch
      })
    });
    await ensureOk(resp, "GitHub put file");
  }

  return {
    createIssue,
    putFile,
    base64EncodeUtf8
  };
}

function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  // btoa expects binary string (Latin1)
  return btoa(binary);
}
