import { describe, it, expect } from "vitest";
import type { BrowserContext } from "playwright";
import { DRIVERS } from "@/lib/bot/drivers";
import { FatalError } from "@/lib/bot/types";

describe("DRIVERS registry", () => {
  it("exports facebook driver with correct platform", () => {
    expect(DRIVERS.facebook).toBeDefined();
    expect(DRIVERS.facebook.platform).toBe("facebook");
  });

  it("exports kijiji stub driver", () => {
    expect(DRIVERS.kijiji).toBeDefined();
    expect(DRIVERS.kijiji.platform).toBe("kijiji");
  });

  it("exports autotrader stub driver", () => {
    expect(DRIVERS.autotrader).toBeDefined();
    expect(DRIVERS.autotrader.platform).toBe("autotrader");
  });

  it("kijiji stub throws FatalError on publish", async () => {
    const ctx = {} as BrowserContext;
    const listing = {
      lespacId: "123",
      title: "Test",
      priceCad: 50000,
      description: "Test",
      photoUrls: [],
      contentHash: "hash",
    };
    await expect(DRIVERS.kijiji.publish(ctx, listing)).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.kijiji.publish(ctx, listing);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("kijiji");
    }
  });

  it("kijiji stub throws FatalError on update", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    const listing = {
      lespacId: "123",
      title: "Test",
      priceCad: 50000,
      description: "Test",
      photoUrls: [],
      contentHash: "hash",
    };
    await expect(DRIVERS.kijiji.update(ctx, "ext123", listing)).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.kijiji.update(ctx, "ext123", listing);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("kijiji");
    }
  });

  it("kijiji stub throws FatalError on remove", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    await expect(DRIVERS.kijiji.remove(ctx, "ext123")).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.kijiji.remove(ctx, "ext123");
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("kijiji");
    }
  });

  it("kijiji stub throws FatalError on checkSession", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    await expect(DRIVERS.kijiji.checkSession(ctx)).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.kijiji.checkSession(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("kijiji");
    }
  });

  it("autotrader stub throws FatalError on publish", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    const listing = {
      lespacId: "123",
      title: "Test",
      priceCad: 50000,
      description: "Test",
      photoUrls: [],
      contentHash: "hash",
    };
    await expect(DRIVERS.autotrader.publish(ctx, listing)).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.autotrader.publish(ctx, listing);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("autotrader");
    }
  });

  it("autotrader stub throws FatalError on update", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    const listing = {
      lespacId: "123",
      title: "Test",
      priceCad: 50000,
      description: "Test",
      photoUrls: [],
      contentHash: "hash",
    };
    await expect(
      DRIVERS.autotrader.update(ctx, "ext123", listing)
    ).rejects.toThrow(FatalError);
    try {
      await DRIVERS.autotrader.update(ctx, "ext123", listing);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("autotrader");
    }
  });

  it("autotrader stub throws FatalError on remove", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    await expect(DRIVERS.autotrader.remove(ctx, "ext123")).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.autotrader.remove(ctx, "ext123");
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("autotrader");
    }
  });

  it("autotrader stub throws FatalError on checkSession", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = {} as any;
    await expect(DRIVERS.autotrader.checkSession(ctx)).rejects.toThrow(
      FatalError
    );
    try {
      await DRIVERS.autotrader.checkSession(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(FatalError);
      expect((err as Error).message).toContain("autotrader");
    }
  });
});
