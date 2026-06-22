/**
 * Unit tests for app/dashboard/bot/actions.ts
 *
 * Auth, child_process.spawn, fs, next/cache, and lib/bot/config are all mocked.
 * No real subprocesses are spawned, no real files are written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mutable stubs so vi.mock factories can close over them.
// ---------------------------------------------------------------------------
const { mockRequireAllowedUser, mockSpawn, mockChild, mockExistsSync, mockMkdir, mockWriteFile, mockRevalidatePath, mockLoadBotConfig } =
  vi.hoisted(() => {
    const mockChild = { unref: vi.fn() };
    const mockSpawn = vi.fn().mockReturnValue(mockChild);
    const mockExistsSync = vi.fn().mockReturnValue(true);
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);
    const mockRevalidatePath = vi.fn();
    const mockRequireAllowedUser = vi.fn().mockResolvedValue("user@example.com");
    const mockLoadBotConfig = vi.fn().mockReturnValue({
      sessionsDir: "/tmp/sessions",
      enabledPlatforms: ["facebook", "kijiji", "autotrader"],
      syncIntervalSec: 3600,
      maxJobsPerCycle: 10,
      maxAttempts: 3,
      operatorEmail: "op@example.com",
      screenshotsDir: "/tmp/sessions/screenshots",
    });
    return {
      mockRequireAllowedUser,
      mockSpawn,
      mockChild,
      mockExistsSync,
      mockMkdir,
      mockWriteFile,
      mockRevalidatePath,
      mockLoadBotConfig,
    };
  });

vi.mock("@/lib/auth/require-user", () => ({
  requireAllowedUser: mockRequireAllowedUser,
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  default: { existsSync: mockExistsSync },
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  default: { mkdir: mockMkdir, writeFile: mockWriteFile },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/bot/config", () => ({
  ALL_PLATFORMS: ["facebook", "kijiji", "autotrader"] as const,
  loadBotConfig: mockLoadBotConfig,
}));

// Import AFTER mocks are set up
import { syncNow, uploadSession } from "@/app/dashboard/bot/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFile(content: string): File {
  const blob = new Blob([content], { type: "application/json" });
  return new File([blob], "session.json", { type: "application/json" });
}

// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAllowedUser.mockResolvedValue("user@example.com");
  mockSpawn.mockReturnValue(mockChild);
  mockExistsSync.mockReturnValue(true);
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockLoadBotConfig.mockReturnValue({
    sessionsDir: "/tmp/sessions",
    enabledPlatforms: ["facebook", "kijiji", "autotrader"],
    syncIntervalSec: 3600,
    maxJobsPerCycle: 10,
    maxAttempts: 3,
    operatorEmail: "op@example.com",
    screenshotsDir: "/tmp/sessions/screenshots",
  });
});

// ---------------------------------------------------------------------------
// syncNow
// ---------------------------------------------------------------------------
describe("syncNow", () => {
  it("returns ok:false when worker build is missing", async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await syncNow();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/bot:build/);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("spawns the worker detached and unrefs it", async () => {
    const result = await syncNow();
    expect(result.ok).toBe(true);
    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args, opts] = mockSpawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(cmd).toBe("node");
    // tsconfig-paths/register removed (Nit 5) — worker is pre-compiled, no runtime path aliasing needed
    expect(args).not.toContain("tsconfig-paths/register");
    expect(args.some((a: string) => a.includes("run-once.js"))).toBe(true);
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toBe("ignore");
    expect(mockChild.unref).toHaveBeenCalledOnce();
  });

  it("revalidates /dashboard/bot on success", async () => {
    await syncNow();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/bot");
  });

  it("calls requireAllowedUser before anything else", async () => {
    mockExistsSync.mockReturnValue(false); // even the missing-build path must auth-gate
    await syncNow();
    expect(mockRequireAllowedUser).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// uploadSession
// ---------------------------------------------------------------------------
describe("uploadSession", () => {
  const validJson = JSON.stringify({ cookies: [], origins: [] });

  it("returns ok:false for an unknown platform", async () => {
    const result = await uploadSession(
      "unknown" as "facebook",
      makeFile(validJson),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Plateforme inconnue/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("returns ok:false for an empty file", async () => {
    const emptyFile = new File([], "session.json", { type: "application/json" });
    const result = await uploadSession("facebook", emptyFile);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/vide/);
  });

  it("returns ok:false for invalid JSON", async () => {
    const result = await uploadSession("facebook", makeFile("not-json{{"));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/JSON/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes sessions/<platform>.json on valid upload", async () => {
    const result = await uploadSession("facebook", makeFile(validJson));
    expect(result.ok).toBe(true);
    expect(mockMkdir).toHaveBeenCalledWith("/tmp/sessions", { recursive: true });
    const [writePath, writeContent] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toMatch(/facebook\.json$/);
    expect(writeContent).toBe(validJson);
  });

  it("revalidates /dashboard/bot after a successful upload", async () => {
    await uploadSession("kijiji", makeFile(validJson));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/bot");
  });

  it("gates auth before validating anything", async () => {
    mockRequireAllowedUser.mockRejectedValueOnce(new Error("Non authentifié"));
    await expect(uploadSession("facebook", makeFile(validJson))).rejects.toThrow(
      "Non authentifié",
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("accepts all three known platforms", async () => {
    const platforms = ["facebook", "kijiji", "autotrader"] as const;
    for (const p of platforms) {
      vi.clearAllMocks();
      mockRequireAllowedUser.mockResolvedValue("user@example.com");
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockLoadBotConfig.mockReturnValue({ sessionsDir: "/tmp/sessions" });
      const r = await uploadSession(p, makeFile(validJson));
      expect(r.ok).toBe(true);
    }
  });
});
