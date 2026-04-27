import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { generateVariants, variantPath, VARIANT_SPECS } from "@/lib/photos/resize";

describe("variantPath", () => {
  it("retourne path original tel quel pour 'original'", () => {
    expect(variantPath("U123/abc.jpg", "original")).toBe("U123/abc.jpg");
  });

  it("ajoute _thumb.webp avant l'extension", () => {
    expect(variantPath("U123/abc.jpg", "thumb")).toBe("U123/abc_thumb.webp");
    expect(variantPath("U123/abc.png", "thumb")).toBe("U123/abc_thumb.webp");
    expect(variantPath("U123/abc.webp", "thumb")).toBe("U123/abc_thumb.webp");
  });

  it("ajoute _medium.webp avant l'extension", () => {
    expect(variantPath("U123/abc.jpg", "medium")).toBe("U123/abc_medium.webp");
  });

  it("gère un path sans extension", () => {
    expect(variantPath("U123/abc", "thumb")).toBe("U123/abc_thumb.webp");
  });
});

describe("generateVariants", () => {
  async function pngBuffer(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();
  }

  it("génère thumb et medium aux largeurs spécifiées", async () => {
    const input = await pngBuffer(2400, 1800);
    const { thumb, medium } = await generateVariants(input);

    const thumbMeta = await sharp(thumb).metadata();
    expect(thumbMeta.format).toBe("webp");
    expect(thumbMeta.width).toBe(VARIANT_SPECS.thumb.width);

    const medMeta = await sharp(medium).metadata();
    expect(medMeta.format).toBe("webp");
    expect(medMeta.width).toBe(VARIANT_SPECS.medium.width);
  });

  it("ne grossit pas une image plus petite que la cible", async () => {
    const input = await pngBuffer(300, 200);
    const { thumb, medium } = await generateVariants(input);

    const thumbMeta = await sharp(thumb).metadata();
    expect(thumbMeta.width).toBe(300); // < 400 cible, pas d'agrandissement

    const medMeta = await sharp(medium).metadata();
    expect(medMeta.width).toBe(300); // < 1200 cible, pas d'agrandissement
  });
});
