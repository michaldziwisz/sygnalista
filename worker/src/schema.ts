export type ReportKind = "bug" | "suggestion";

export interface ReportRequest {
  app: {
    id: string;
    version?: string;
    build?: string;
    channel?: string;
  };
  kind: ReportKind;
  title: string;
  description: string;
  email?: string;
  diagnostics?: Record<string, unknown>;
  logs?: {
    fileName?: string;
    contentType?: string;
    encoding?: "base64";
    dataBase64?: string;
    truncated?: boolean;
    originalBytes?: number;
  };
}

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; message: string; details?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function clampString(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replaceAll("\\", "/").split("/").pop() ?? "app.log.gz";
  return clampString(cleaned.replaceAll(/[^a-zA-Z0-9._-]/g, "_"), 80);
}

export function parseReportRequest(rawBody: string): ParseOk<ReportRequest> | ParseErr {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, message: "Invalid JSON" };
  }

  if (!isRecord(parsed)) return { ok: false, message: "Body must be a JSON object" };

  const app = parsed.app;
  if (!isRecord(app)) return { ok: false, message: "Missing or invalid app" };
  const appId = asString(app.id);
  if (!appId) return { ok: false, message: "Missing app.id" };
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(appId)) {
    return { ok: false, message: "Invalid app.id format", details: { appId } };
  }

  const kind = asString(parsed.kind) as ReportKind | null;
  if (kind !== "bug" && kind !== "suggestion") {
    return { ok: false, message: "Invalid kind (expected 'bug' or 'suggestion')" };
  }

  const title = asString(parsed.title);
  if (!title) return { ok: false, message: "Missing title" };
  const description = asString(parsed.description);
  if (!description) return { ok: false, message: "Missing description" };

  const email = asOptionalString(parsed.email);

  const diagnostics = isRecord(parsed.diagnostics) ? parsed.diagnostics : undefined;

  let logs: ReportRequest["logs"] | undefined;
  if (parsed.logs !== undefined) {
    if (!isRecord(parsed.logs)) return { ok: false, message: "Invalid logs (expected object)" };
    const dataBase64 = asOptionalString(parsed.logs.dataBase64);
    if (dataBase64 && typeof dataBase64 !== "string") {
      return { ok: false, message: "Invalid logs.dataBase64" };
    }
    logs = {
      fileName: asOptionalString(parsed.logs.fileName),
      contentType: asOptionalString(parsed.logs.contentType),
      encoding: parsed.logs.encoding === "base64" ? "base64" : undefined,
      dataBase64: dataBase64 ? dataBase64.replaceAll(/\s+/g, "") : undefined,
      truncated: typeof parsed.logs.truncated === "boolean" ? parsed.logs.truncated : undefined,
      originalBytes: typeof parsed.logs.originalBytes === "number" ? parsed.logs.originalBytes : undefined
    };
  }

  const value: ReportRequest = {
    app: {
      id: appId,
      version: asOptionalString(app.version),
      build: asOptionalString(app.build),
      channel: asOptionalString(app.channel)
    },
    kind,
    title: clampString(title, 180),
    description: clampString(description, 50_000),
    ...(email ? { email: clampString(email, 254) } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    ...(logs ? { logs } : {})
  };

  return { ok: true, value };
}

function stringifyDiagnostics(diag: Record<string, unknown> | undefined): string {
  if (!diag) return "{}";
  try {
    return JSON.stringify(diag, null, 2);
  } catch {
    return "{}";
  }
}

function formatAppLine(app: ReportRequest["app"]): string {
  const parts = [app.id];
  if (app.version) parts.push(`v${app.version}`);
  if (app.build) parts.push(`build ${app.build}`);
  if (app.channel) parts.push(`(${app.channel})`);
  return parts.join(" ");
}

export function renderIssueBody(input: {
  reportId: string;
  receivedAtIso: string;
  report: ReportRequest;
  intake: {
    owner: string;
    repo: string;
    branch: string;
    reportJsonPath: string;
    logPath?: string;
  };
}): string {
  const { reportId, receivedAtIso, report, intake } = input;

  const intakeReportUrl = `https://github.com/${intake.owner}/${intake.repo}/blob/${encodeURIComponent(
    intake.branch
  )}/${intake.reportJsonPath}`;
  const intakeLogUrl = intake.logPath
    ? `https://github.com/${intake.owner}/${intake.repo}/blob/${encodeURIComponent(intake.branch)}/${intake.logPath}`
    : null;

  const emailLine = report.email ? `- Email (publiczny): ${report.email}\n` : "";
  const logLine = intakeLogUrl
    ? `- Log (repo prywatne): ${intakeLogUrl}${report.logs?.truncated ? " _(log ucięty)_" : ""}\n`
    : "- Log: brak\n";

  return (
    `## Zgłoszenie z aplikacji\n\n` +
    `- Aplikacja: ${formatAppLine(report.app)}\n` +
    `- Typ: ${report.kind}\n` +
    emailLine +
    `- Report ID: ${reportId}\n` +
    `- Otrzymano: ${receivedAtIso}\n` +
    `- Szczegóły (repo prywatne): ${intakeReportUrl}\n` +
    logLine +
    `\n` +
    `## Opis\n\n` +
    `${report.description}\n\n` +
    `## Diagnostyka\n\n` +
    "```json\n" +
    `${stringifyDiagnostics(report.diagnostics)}\n` +
    "```\n"
  );
}

