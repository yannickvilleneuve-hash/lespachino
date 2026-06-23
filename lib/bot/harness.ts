import { chromium, type BrowserContext } from "playwright";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Platform } from "@/lib/bot/types";
import { TransientError } from "@/lib/bot/types";

const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");
const FAILURES_DIR = path.join(SESSIONS_DIR, "failures");

export interface SessionPaths {
  storageState: string;
}

export function sessionPaths(platform: Platform): SessionPaths {
  return { storageState: path.join(SESSIONS_DIR, `${platform}.json`) };
}

/** Randomized human-like delay (jitter). Bounds overridable via args or env vars. */
export function pace(minMs?: number, maxMs?: number): Promise<void> {
  const min = minMs ?? Number(process.env.BOT_PACE_MIN_MS ?? 4000);
  const max = maxMs ?? Number(process.env.BOT_PACE_MAX_MS ?? 12000);
  const ms = min + Math.random() * Math.max(0, max - min);
  return new Promise((r) => setTimeout(r, ms));
}

/** Download remote photos to temp files; return local paths for upload. */
export async function downloadPhotos(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-photos-"));
  const out: string[] = [];
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url);
    if (!res.ok) throw new TransientError(`photo download ${res.status}: ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (url.split("?")[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? "jpg").toLowerCase();
    const file = path.join(dir, `${String(i).padStart(2, "0")}.${ext}`);
    await fs.writeFile(file, buf);
    out.push(file);
  }
  return out;
}

/**
 * Launch headless Chromium, load sessions/<platform>.json storageState, run fn,
 * re-save storageState on success; on throw capture a failure screenshot to
 * sessions/failures/<platform>-<ts>.png, then rethrow. Always closes the browser.
 */
export async function runWithSession<T>(
  platform: Platform,
  fn: (ctx: BrowserContext) => Promise<T>,
): Promise<T> {
  const { storageState } = sessionPaths(platform);
  await fs.mkdir(FAILURES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let ctx: BrowserContext | undefined;
  try {
    // Guard against missing session file (normal state before `bot:login` has run).
    let storageStateArg: string | undefined;
    try {
      await fs.access(storageState);
      storageStateArg = storageState;
    } catch {
      storageStateArg = undefined; // first run — no saved session yet
    }
    ctx = await browser.newContext(
      storageStateArg ? { storageState: storageStateArg } : {},
    );
    const result = await fn(ctx);
    const sessionsDir = path.dirname(storageState);
    await fs.mkdir(sessionsDir, { recursive: true, mode: 0o700 });
    await fs.chmod(sessionsDir, 0o700);
    await ctx.storageState({ path: storageState });
    await fs.chmod(storageState, 0o600);
    return result;
  } catch (err) {
    if (ctx) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const shot = path.join(FAILURES_DIR, `${platform}-${ts}.png`);
      try {
        const pages = ctx.pages();
        const page = pages[pages.length - 1];
        if (page) await page.screenshot({ path: shot, fullPage: true });
      } catch {
        /* screenshot is best-effort; never mask the original error */
      }
    }
    throw err;
  } finally {
    await browser.close();
  }
}
