"use client";

import { useEffect } from "react";
import { logPublicVehicleEvent } from "@/lib/stats/event-actions";

export default function PixelViewContent({
  unit,
}: {
  unit: string;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void logPublicVehicleEvent(unit, "engaged_30s", {});
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [unit]);
  return null;
}
