"use server";

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireAllowedUser } from "@/lib/auth/require-user";
import { loadBotConfig, ALL_PLATFORMS } from "@/lib/bot/config";
import type { Platform } from "@/lib/bot/types";

const RUN_ONCE = "worker/dist/worker/run-once.js";

/**
 * Trigger a LesPAC mirror bot sync cycle in the background.
 * Spawns the compiled one-shot worker detached so the web request returns
 * immediately — the operator watches progress refresh into the dashboard board.
 */
export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  await requireAllowedUser();

  const entry = path.join(process.cwd(), RUN_ONCE);
  if (!existsSync(entry)) {
    return {
      ok: false,
      message: "Worker non compilé — lancer `pnpm bot:build`.",
    };
  }

  const child = spawn(
    "node",
    ["-r", "tsconfig-paths/register", entry],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref();

  revalidatePath("/dashboard/bot");
  return { ok: true, message: "Cycle de sync lancé en arrière-plan." };
}

/**
 * Upload a Playwright storageState JSON file for a platform session.
 * The file is written to sessions/<platform>.json (same path the worker reads).
 */
export async function uploadSession(
  platform: Platform,
  file: File,
): Promise<{ ok: boolean; message: string }> {
  await requireAllowedUser();

  if (!(ALL_PLATFORMS as readonly string[]).includes(platform)) {
    return { ok: false, message: `Plateforme inconnue: ${platform}` };
  }

  if (!file || file.size === 0) {
    return { ok: false, message: "Fichier de session vide." };
  }

  const text = await file.text();
  try {
    JSON.parse(text); // storageState must be valid JSON
  } catch {
    return {
      ok: false,
      message: "Le fichier n'est pas un storageState JSON valide.",
    };
  }

  const { sessionsDir } = loadBotConfig();
  await mkdir(sessionsDir, { recursive: true });
  await writeFile(path.join(sessionsDir, `${platform}.json`), text, "utf8");

  revalidatePath("/dashboard/bot");
  return { ok: true, message: `Session ${platform} mise à jour.` };
}
