import type { CreateIssueResult } from "./github.js";
import type { Env } from "./index.js";
import type { ReportRequest } from "./schema.js";

export async function sendTelegramIssueNotification(input: {
  env: Env;
  appRepo: { owner: string; repo: string };
  reportId: string;
  receivedAtIso: string;
  report: ReportRequest;
  issue: CreateIssueResult;
}): Promise<void> {
  const token = input.env.TELEGRAM_BOT_TOKEN;
  const chatIdsRaw = input.env.TELEGRAM_CHAT_ID;
  if (!token || !chatIdsRaw) return;

  const chatIds = chatIdsRaw
    .split(/[,\s]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
  if (!chatIds.length) return;

  const text = formatTelegramIssueText(input);

  for (const chatId of chatIds) {
    await telegramSendMessage({
      token,
      chatId,
      text
    });
  }
}

function formatTelegramIssueText(input: {
  appRepo: { owner: string; repo: string };
  reportId: string;
  receivedAtIso: string;
  report: ReportRequest;
  issue: CreateIssueResult;
}): string {
  const kind = input.report.kind === "bug" ? "BUG" : "SUGGESTIA";
  const appLine = formatAppLine(input.report.app);
  const repoRef = `${input.appRepo.owner}/${input.appRepo.repo}`;
  const issueLine = `#${input.issue.number} ${input.report.title}`;

  return [
    `Sygnalista: nowe zgłoszenie (${kind})`,
    `Aplikacja: ${appLine}`,
    `Repo: ${repoRef}`,
    `Issue: ${issueLine}`,
    input.issue.html_url,
    `Report ID: ${input.reportId}`,
    `Otrzymano: ${input.receivedAtIso}`
  ].join("\n");
}

function formatAppLine(app: ReportRequest["app"]): string {
  const parts = [app.id];
  if (app.version) parts.push(`v${app.version}`);
  if (app.build) parts.push(`build ${app.build}`);
  if (app.channel) parts.push(`(${app.channel})`);
  return parts.join(" ");
}

async function telegramSendMessage(input: {
  token: string;
  chatId: string;
  text: string;
}): Promise<void> {
  const resp = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true
    })
  });

  if (resp.ok) return;
  const body = await resp.text().catch(() => "");
  throw new Error(
    `Telegram sendMessage failed: ${resp.status} ${resp.statusText}${body ? `: ${body}` : ""}`
  );
}

