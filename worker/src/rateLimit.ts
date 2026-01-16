import type { Env } from "./index.js";
import { tooManyRequests } from "./response.js";

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function rateLimit(request: Request, env: Env): Promise<Response | null> {
  const limitPerMinute = Number(env.RATE_LIMIT_PER_MINUTE || "6");
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) return null;

  const cache: Cache =
    // Cloudflare Workers provides `caches.default`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((caches as any).default as Cache | undefined) ?? (await caches.open("default"));

  const ip = getClientIp(request);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const key = `https://sygnalista-rate-limit/${encodeURIComponent(ip)}/${minuteBucket}`;
  const cacheKey = new Request(key);

  const cached = await cache.match(cacheKey);
  const count = cached ? Number(await cached.text()) : 0;
  if (Number.isFinite(count) && count >= limitPerMinute) {
    return tooManyRequests("Rate limit exceeded");
  }

  const nextCount = Number.isFinite(count) ? count + 1 : 1;
  await cache.put(
    cacheKey,
    new Response(String(nextCount), {
      headers: {
        "cache-control": "max-age=60"
      }
    })
  );

  return null;
}
