import type { Env } from "./index.js";
import { getGitHubClient } from "./github.js";
import { rateLimit } from "./rateLimit.js";
import { badRequest, internalError, unauthorized } from "./response.js";
import { parseReportRequest, renderIssueBody, sanitizeFileName } from "./schema.js";
import { sendTelegramIssueNotification } from "./telegram.js";

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseJsonMap(text: string | undefined): Record<string, string> | null {
  if (!text) return null;
  const value = parseJsonObject(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const map: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string") map[key] = val;
  }
  return map;
}

function parseRepo(ref: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = ref.split("/");
  if (!owner || !repo || rest.length > 0) return null;
  return { owner, repo };
}

function getAppRepo(env: Env, appId: string): { owner: string; repo: string } | null {
  const map = parseJsonMap(env.APP_REPO_MAP);
  if (!map) throw new Error("Invalid APP_REPO_MAP (expected JSON object mapping appId->owner/repo)");
  const repoRef = map[appId];
  if (!repoRef) return null;
  return parseRepo(repoRef);
}

export async function handleReport(
  request: Request,
  env: Env,
  ctx?: { waitUntil(promise: Promise<unknown>): void }
): Promise<Response> {
  const rl = await rateLimit(request, env);
  if (rl) return rl;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return badRequest("Expected content-type: application/json");
  }

  const appTokenMap = parseJsonMap(env.APP_TOKEN_MAP);
  const reportId = crypto.randomUUID();
  const receivedAtIso = new Date().toISOString();

  const rawBody = await request.text();
  const parsed = parseReportRequest(rawBody);
  if (!parsed.ok) return badRequest(parsed.message, parsed.details);

  const report = parsed.value;
  const appRepo = (() => {
    try {
      return getAppRepo(env, report.app.id);
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "Invalid APP_REPO_MAP");
    }
  })();
  if (!appRepo) return badRequest(`Unknown app.id: ${report.app.id}`);

  if (appTokenMap?.[report.app.id]) {
    const provided = request.headers.get("x-sygnalista-app-token");
    if (!provided || provided !== appTokenMap[report.app.id]) {
      return unauthorized("Invalid x-sygnalista-app-token for this app.id");
    }
  }

  const maxLogBase64Length = Number(env.MAX_LOG_BASE64_LENGTH || "8000000");
  if (report.logs?.dataBase64 && report.logs.dataBase64.length > maxLogBase64Length) {
    return badRequest("logs.dataBase64 is too large", {
      maxLogBase64Length,
      actual: report.logs.dataBase64.length
    });
  }

  const intakeRepo = parseRepo(env.INTAKE_REPO);
  if (!intakeRepo) return internalError("Invalid INTAKE_REPO (expected owner/repo)");
  const intakeBranch = env.INTAKE_BRANCH || "main";

  const gh = await getGitHubClient(env);
  if (!gh) return internalError("Missing GitHub auth (GITHUB_TOKEN or GitHub App vars)");

  const reportJson = {
    reportId,
    receivedAt: receivedAtIso,
    ...report
  };

  const month = receivedAtIso.slice(0, 7);
  const baseDir = `reports/${report.app.id}/${month}`;
  const reportJsonPath = `${baseDir}/${reportId}.json`;

  const uploadedPaths: { reportJsonPath: string; logPath?: string } = { reportJsonPath };

  try {
    await gh.putFile({
      owner: intakeRepo.owner,
      repo: intakeRepo.repo,
      branch: intakeBranch,
      path: reportJsonPath,
      message: `report(${report.app.id}): ${reportId}`,
      contentBase64: gh.base64EncodeUtf8(JSON.stringify(reportJson, null, 2) + "\n")
    });

    if (report.logs?.dataBase64) {
      const safeName = sanitizeFileName(report.logs.fileName || "app.log.gz");
      const logPath = `${baseDir}/${reportId}--${safeName}`;
      uploadedPaths.logPath = logPath;
      await gh.putFile({
        owner: intakeRepo.owner,
        repo: intakeRepo.repo,
        branch: intakeBranch,
        path: logPath,
        message: `report(${report.app.id}): ${reportId} log`,
        contentBase64: report.logs.dataBase64
      });
    }

    const issueBody = renderIssueBody({
      reportId,
      receivedAtIso,
      report,
      intake: {
        owner: intakeRepo.owner,
        repo: intakeRepo.repo,
        branch: intakeBranch,
        ...uploadedPaths
      }
    });

    const labels =
      report.kind === "bug"
        ? ["bug", "from-app"]
        : report.kind === "suggestion"
          ? ["enhancement", "from-app"]
          : ["from-app"];

    const issueResult = await gh.createIssue({
      owner: appRepo.owner,
      repo: appRepo.repo,
      title: report.title,
      body: issueBody,
      labels
    });

    const notifyPromise = sendTelegramIssueNotification({
      env,
      appRepo,
      reportId,
      receivedAtIso,
      report,
      issue: issueResult
    }).catch((err: unknown) => {
      // Best-effort; issue creation must succeed even if Telegram fails.
      console.warn("Telegram notification failed", err);
    });
    if (ctx) ctx.waitUntil(notifyPromise);
    else await notifyPromise;

    return new Response(
      JSON.stringify(
        {
          ok: true,
          reportId,
          issue: issueResult
        },
        null,
        2
      ),
      {
        status: 201,
        headers: { "content-type": "application/json; charset=utf-8" }
      }
    );
  } catch (err: unknown) {
    // Avoid leaking secrets in error payload
    return internalError(err instanceof Error ? err.message : "Unknown error");
  }
}
