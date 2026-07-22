import { describe, it, expect } from "vitest";
import { withMirroredPhotos } from "@/lib/feeds/snapshot-source";
import type { SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

function row(over: Partial<SnapshotVehicle> = {}): SnapshotVehicle {
  const vehicle: CatalogVehicle = {
    id: "1", title: "Hino L8 2026", description: "", priceCad: 1, year: 2026,
    make: "Hino", model: "L8", km: 1, isNew: true, isVehicle: true,
    bodyStyle: "TRUCK", exteriorColor: null, transmission: null, fuelType: null,
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
  };
  return { vehicle, status: "online", photos: [], ...over };
}

describe("withMirroredPhotos", () => {
  it("remplace les URLs LesPAC par les copies miroir", () => {
    const [v] = withMirroredPhotos([
      row({ photos: [{ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: "u/1.jpg" }] }),
    ]);
    // Le mode dégradé sert justement quand LesPAC est en panne: publier ses URLs
    // reviendrait à publier des images mortes.
    expect(v.photoUrls[0]).toContain("/storage/v1/object/public/");
    expect(v.photoUrls[0]).not.toContain("cdn.lespac.com");
  });

  it("retombe sur l'URL source quand la photo n'a pas été copiée", () => {
    const [v] = withMirroredPhotos([
      row({ photos: [{ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: null }] }),
    ]);
    expect(v.photoUrls[0]).toBe("https://cdn.lespac.com/a.jpg");
  });

  it("garde le véhicule intact quand le snapshot n'a aucune photo", () => {
    const [v] = withMirroredPhotos([row()]);
    expect(v.photoUrls).toEqual(["https://cdn.lespac.com/a.jpg"]);
  });
});
