import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Mock node:fs promises so we can control fs.access per-test.
// Only stub `access`, `mkdir`, and `chmod` — keep `mkdtemp`/`writeFile` real
// so that downloadPhotos tests can verify files are actually written to disk.
//
// IMPORTANT: We mutate `actual.promises` IN PLACE rather than replacing it
// with a spread copy. The harness imports `{ promises as fs }` at module load
// time and holds a live reference to the original `fs.promises` object.
// Replacing it with a new object (via spread) would leave the harness pointing
// at the unmocked original. Mutating the original object directly ensures both
// the test file and the harness see the same vi.fn() stubs.
// ---------------------------------------------------------------------------
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  // Patch in place — harness holds a live reference to actual.promises
  (actual.promises as Record<string, unknown>).access = vi
    .fn()
    .mockResolvedValue(undefined); // default: file exists; override per test
  (actual.promises as Record<string, unknown>).mkdir = vi
    .fn()
    .mockResolvedValue(undefined);
  (actual.promises as Record<string, unknown>).chmod = vi
    .fn()
    .mockResolvedValue(undefined);
  return actual;
});

// ---------------------------------------------------------------------------
// Mock playwright BEFORE importing harness.
// Use vi.hoisted() so variables are available when vi.mock factory runs.
// ---------------------------------------------------------------------------
const { mockPage, mockCtx, mockBrowser, mockChromium } = vi.hoisted(() => {
  const mockPage = {
    screenshot: vi.fn().mockResolvedValue(undefined),
  };
  const mockCtx = {
    storageState: vi.fn().mockResolvedValue(undefined),
    pages: vi.fn().mockReturnValue([mockPage]),
  };
  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockCtx),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockChromium = {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  };
  return { mockPage, mockCtx, mockBrowser, mockChromium };
});

vi.mock("playwright", () => ({
  chromium: mockChromium,
}));

// ---------------------------------------------------------------------------
// Now import the module under test (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import {
  sessionPaths,
  runWithSession,
  downloadPhotos,
  pace,
} from "@/lib/bot/harness";
import type { Platform } from "@/lib/bot/types";
import { TransientError } from "@/lib/bot/types";
import { promises as fsMock } from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tempFiles: string[] = [];

afterEach(() => {
  // Clean up any temp files created by downloadPhotos
  for (const f of tempFiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  tempFiles = [];
  // Reset all mocks between tests
  vi.clearAllMocks();
  // Restore mock implementations that clearAllMocks resets
  mockChromium.launch.mockResolvedValue(mockBrowser);
  mockBrowser.newContext.mockResolvedValue(mockCtx);
  mockBrowser.close.mockResolvedValue(undefined);
  mockCtx.storageState.mockResolvedValue(undefined);
  mockCtx.pages.mockReturnValue([mockPage]);
  mockPage.screenshot.mockResolvedValue(undefined);
  vi.mocked(fsMock.chmod).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// sessionPaths
// ---------------------------------------------------------------------------
describe("sessionPaths", () => {
  it("returns the correct storageState path for each platform", () => {
    const platforms: Platform[] = ["facebook", "kijiji", "autotrader"];
    for (const p of platforms) {
      const { storageState } = sessionPaths(p);
      expect(storageState).toContain(`${p}.json`);
      expect(path.basename(storageState)).toBe(`${p}.json`);
      expect(path.basename(path.dirname(storageState))).toBe("sessions");
    }
  });

  it("facebook resolves to sessions/facebook.json inside project root", () => {
    const { storageState } = sessionPaths("facebook");
    expect(storageState).toBe(path.resolve(process.cwd(), "sessions", "facebook.json"));
  });
});

// ---------------------------------------------------------------------------
// pace
// ---------------------------------------------------------------------------
describe("pace", () => {
  it("resolves within the configured [min, max] bounds", async () => {
    process.env.BOT_PACE_MIN_MS = "5";
    process.env.BOT_PACE_MAX_MS = "15";
    try {
      const t0 = Date.now();
      await pace();
      const elapsed = Date.now() - t0;
      // Should be at least the configured min (5 ms) and not exceed max + 50ms tolerance
      expect(elapsed).toBeGreaterThanOrEqual(5);
      expect(elapsed).toBeLessThan(60);
    } finally {
      delete process.env.BOT_PACE_MIN_MS;
      delete process.env.BOT_PACE_MAX_MS;
    }
  });

  it("returns a Promise", () => {
    process.env.BOT_PACE_MIN_MS = "0";
    process.env.BOT_PACE_MAX_MS = "1";
    try {
      const result = pace();
      expect(result).toBeInstanceOf(Promise);
      return result;
    } finally {
      delete process.env.BOT_PACE_MIN_MS;
      delete process.env.BOT_PACE_MAX_MS;
    }
  });
});

// ---------------------------------------------------------------------------
// downloadPhotos
// ---------------------------------------------------------------------------
describe("downloadPhotos", () => {
  const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes

  beforeEach(() => {
    // Mock global fetch to return a fake Response with a small ArrayBuffer
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(fakeBytes.buffer),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns N local file paths for N URLs", async () => {
    const urls = [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.png",
    ];
    const paths = await downloadPhotos(urls);
    tempFiles.push(...paths);

    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/\.jpg$/);
    expect(paths[1]).toMatch(/\.png$/);
  });

  it("each returned file exists on disk and contains the stubbed bytes", async () => {
    const urls = ["https://example.com/image.jpg"];
    const paths = await downloadPhotos(urls);
    tempFiles.push(...paths);

    expect(fs.existsSync(paths[0])).toBe(true);
    const contents = fs.readFileSync(paths[0]);
    expect(Buffer.from(fakeBytes)).toEqual(contents);
  });

  it("throws TransientError on non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      }),
    );

    await expect(
      downloadPhotos(["https://example.com/missing.jpg"]),
    ).rejects.toThrow(TransientError);
  });

  it("returns empty array for empty URL list", async () => {
    const paths = await downloadPhotos([]);
    expect(paths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runWithSession — success path
// ---------------------------------------------------------------------------
describe("runWithSession — success path", () => {
  beforeEach(() => {
    // Simulate session file exists so storageState is loaded from disk
    vi.mocked(fsMock.access).mockResolvedValue(undefined);
  });

  it("calls fn with the browser context and returns its resolved value", async () => {
    const fn = vi.fn().mockResolvedValue("result-value");
    const result = await runWithSession("facebook", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(mockCtx);
    expect(result).toBe("result-value");
  });

  it("re-saves storageState to sessions/<platform>.json on success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await runWithSession("kijiji", fn);

    expect(mockCtx.storageState).toHaveBeenCalledTimes(1);
    const callArg = mockCtx.storageState.mock.calls[0][0];
    expect(callArg).toHaveProperty("path");
    expect((callArg as { path: string }).path).toContain("sessions");
    expect((callArg as { path: string }).path).toContain("kijiji.json");
  });

  it("closes the browser after success", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runWithSession("autotrader", fn);

    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("launches chromium with headless: true", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runWithSession("facebook", fn);

    expect(mockChromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true }),
    );
  });

  it("chmods the storageState file to 0o600 after saving", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runWithSession("facebook", fn);

    const { storageState } = sessionPaths("facebook");
    expect(vi.mocked(fsMock.chmod)).toHaveBeenCalledWith(storageState, 0o600);
  });

  it("chmods the sessions directory to 0o700 after mkdir", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runWithSession("kijiji", fn);

    const { storageState } = sessionPaths("kijiji");
    const sessionsDir = path.dirname(storageState);
    expect(vi.mocked(fsMock.chmod)).toHaveBeenCalledWith(sessionsDir, 0o700);
  });
});

// ---------------------------------------------------------------------------
// runWithSession — failure path
// ---------------------------------------------------------------------------
describe("runWithSession — failure path", () => {
  it("captures a screenshot into sessions/failures/<platform>-<ts>.png when fn throws", async () => {
    const error = new Error("test error");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(runWithSession("facebook", fn)).rejects.toThrow("test error");

    expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
    const screenshotArg = mockPage.screenshot.mock.calls[0][0] as { path: string };
    expect(screenshotArg.path).toMatch(/sessions[/\\]failures[/\\]facebook-.*\.png$/);
  });

  it("rethrows the original error after capturing screenshot", async () => {
    const originalError = new Error("original error message");
    const fn = vi.fn().mockRejectedValue(originalError);

    await expect(runWithSession("facebook", fn)).rejects.toBe(originalError);
  });

  it("still closes the browser when fn throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(runWithSession("kijiji", fn)).rejects.toThrow("boom");

    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("does not re-save storageState when fn throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(runWithSession("autotrader", fn)).rejects.toThrow();

    // storageState should not be called for re-saving (may be called 0 times)
    // The mock resolves to undefined by default so check it was NOT called with { path }
    const saveCall = mockCtx.storageState.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "path" in c[0],
    );
    expect(saveCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runWithSession — first-run path (no session file)
// ---------------------------------------------------------------------------
describe("runWithSession — first-run path (no session file)", () => {
  beforeEach(() => {
    // Simulate session file NOT existing (ENOENT — normal before bot:login)
    vi.mocked(fsMock.access).mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
    );
  });

  it("does NOT throw when the session file is missing", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(runWithSession("facebook", fn)).resolves.toBe("ok");
  });

  it("calls browser.newContext WITHOUT a storageState property when session file is missing", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await runWithSession("facebook", fn);

    expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
    const callArg = mockBrowser.newContext.mock.calls[0][0] as Record<string, unknown>;
    // Either called with an empty object or with storageState explicitly undefined/absent
    expect(callArg).not.toHaveProperty("storageState", expect.any(String));
  });

  it("still invokes fn and closes the browser on first run", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await runWithSession("facebook", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
