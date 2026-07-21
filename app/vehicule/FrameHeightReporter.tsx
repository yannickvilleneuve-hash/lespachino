"use client";

import { useEffect } from "react";

/**
 * Posts the document height to the WordPress parent so the iframe can grow with
 * the inventory. Without it the embed needs a fixed height and gets an inner
 * scrollbar — the flaw of the old Wix embed we are replacing.
 */
export function FrameHeightReporter() {
  useEffect(() => {
    if (window.parent === window) return;

    const post = () => {
      window.parent.postMessage(
        { source: "pacman-inventaire", height: document.documentElement.scrollHeight },
        "*",
      );
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.addEventListener("load", post);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", post);
    };
  }, []);

  return null;
}
