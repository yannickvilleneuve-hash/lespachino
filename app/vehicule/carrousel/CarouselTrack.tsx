"use client";

import { useRef, type ReactNode } from "react";

/** Card width (260) plus the gap (12): one arrow press moves exactly one card. */
const STEP_PX = 272;

/**
 * The scrolling strip: CSS scroll-snap, plus two arrows for mice.
 *
 * No autoplay and no state. A strip that advances on a timer moves the card the
 * visitor is reading, and it would need a pause control to be usable at all.
 * Touch devices already scroll natively, so the arrows only show from `sm` up.
 *
 * The cards arrive as `children`, rendered on the server — this component adds
 * behaviour, it does not re-render the inventory.
 */
export function CarouselTrack({ children }: { children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);

  const scroll = (direction: 1 | -1) => {
    track.current?.scrollBy({ left: direction * STEP_PX, behavior: "smooth" });
  };

  return (
    <div className="relative h-full">
      {/* scroll-pl matches px: without it the first snap position lands past the
          padding, the strip opens flush to the edge and the left arrow sits on
          top of the first card. */}
      <ul
        ref={track}
        className="flex h-full snap-x snap-mandatory scroll-pl-4 items-center gap-3 overflow-x-auto scroll-smooth px-4 [scrollbar-width:none] sm:scroll-pl-12 sm:px-12 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>

      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Camions précédents"
        className="absolute left-1 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/60 text-xl text-white transition hover:bg-[#ed1c24] focus-visible:bg-[#ed1c24] sm:flex"
      >
        <span aria-hidden>‹</span>
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Camions suivants"
        className="absolute right-1 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/60 text-xl text-white transition hover:bg-[#ed1c24] focus-visible:bg-[#ed1c24] sm:flex"
      >
        <span aria-hidden>›</span>
      </button>
    </div>
  );
}
