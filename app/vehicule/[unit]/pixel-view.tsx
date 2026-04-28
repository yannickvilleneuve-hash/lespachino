"use client";

import { useEffect } from "react";

export default function PixelViewContent({
  unit,
  price,
}: {
  unit: string;
  price: number;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.fbq) return;
    window.fbq("track", "ViewContent", {
      content_ids: [unit],
      content_type: "vehicle",
      value: price,
      currency: "CAD",
    });
  }, [unit, price]);
  return null;
}
