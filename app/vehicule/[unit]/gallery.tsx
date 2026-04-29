"use client";

import Image from "next/image";
import { useState } from "react";
import { VehiclePlaceholder } from "@/app/vehicle-placeholder";

export default function Gallery({
  photos,
  alt,
}: {
  photos: { url_medium: string; url_thumb: string; url_original: string; is_hero: boolean }[];
  alt: string;
}) {
  const heroIndex = Math.max(
    photos.findIndex((p) => p.is_hero),
    0,
  );
  const [active, setActive] = useState(heroIndex);
  if (photos.length === 0) {
    return (
      <VehiclePlaceholder className="aspect-[4/3] rounded border" />
    );
  }

  return (
    <div>
      <a
        href={photos[active].url_original}
        target="_blank"
        rel="noreferrer"
        className="block relative aspect-[4/3] bg-gray-100 rounded overflow-hidden border"
        title="Voir en haute résolution"
      >
        <Image
          src={photos[active].url_medium}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
          priority
          unoptimized
        />
      </a>
      {photos.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.url_thumb}
              type="button"
              onClick={() => setActive(i)}
              className={
                "relative w-24 h-18 flex-shrink-0 rounded overflow-hidden border-2 transition " +
                (i === active ? "border-blue-600" : "border-transparent opacity-75 hover:opacity-100")
              }
            >
              <Image
                src={p.url_thumb}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
