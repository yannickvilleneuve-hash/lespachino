"use client";

import { useEffect } from "react";
import { logPublicVehicleEvent } from "@/lib/stats/event-actions";

export default function PixelViewContent({
  unit,
}: {
  unit: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.fbq) return;
    window.fbq("track", "ViewContent", {
      content_ids: [unit],
      content_type: "vehicle",
    });
  }, [unit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void logPublicVehicleEvent(unit, "engaged_30s", {});
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [unit]);
  return null;
}
