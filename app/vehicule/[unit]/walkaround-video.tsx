"use client";

import { useRef } from "react";
import { logPublicVehicleEvent } from "@/lib/stats/event-actions";

export default function PublicWalkaroundVideo({
  unit,
  url,
}: {
  unit: string;
  url: string;
}) {
  const logged = useRef(false);
  return (
    <video
      src={url}
      controls
      className="mt-4 w-full rounded border bg-black"
      onPlay={() => {
        if (logged.current) return;
        logged.current = true;
        void logPublicVehicleEvent(unit, "video_play", {});
      }}
    />
  );
}
