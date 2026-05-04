import { describe, it, expect } from "vitest";
import { classifySource } from "@/lib/stats/channels";

describe("classifySource", () => {
  it("direct quand referrer vide ou null", () => {
    expect(classifySource(null)).toBe("direct");
    expect(classifySource(undefined)).toBe("direct");
    expect(classifySource("")).toBe("direct");
    expect(classifySource("   ")).toBe("direct");
  });

  it("FB Marketplace prioritaire sur Facebook", () => {
    expect(classifySource("https://www.marketplace.facebook.com/item/123")).toBe(
      "fb_marketplace",
    );
    expect(classifySource("https://m.facebook.com/marketplace/...")).toBe(
      "fb_marketplace",
    );
  });

  it("Facebook standard", () => {
    expect(classifySource("https://www.facebook.com/groups/abc")).toBe("facebook");
    expect(classifySource("https://m.facebook.com/")).toBe("facebook");
    expect(classifySource("https://fb.me/x")).toBe("facebook");
  });

  it("Instagram / Lespac / Kijiji / Google / Wix / camion-hino.ca", () => {
    expect(classifySource("https://www.instagram.com/")).toBe("instagram");
    expect(classifySource("https://www.lespac.com/annonce/123")).toBe("lespac");
    expect(classifySource("https://www.kijiji.ca/v-vehicle/")).toBe("kijiji");
    expect(classifySource("https://www.truckpaper.com/listing/123")).toBe("truckpaper");
    expect(classifySource("https://www.marketbook.ca/listings/123")).toBe("marketbook");
    expect(classifySource("https://www.google.com/search?q=hino")).toBe("google");
    expect(classifySource("https://google.ca/")).toBe("google");
    expect(classifySource("https://www.camion-hino.ca/inventaire")).toBe("wix");
    expect(classifySource("https://camion-hino.wixsite.com/")).toBe("wix");
  });

  it("autre par défaut", () => {
    expect(classifySource("https://random-site.com/")).toBe("autre");
  });
});
