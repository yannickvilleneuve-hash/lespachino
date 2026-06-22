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
      // Should not be negative and should not exceed max + a 50ms tolerance
      expect(elapsed).toBeGreaterThanOrEqual(0);
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
