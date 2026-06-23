import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET /dashboard/bot/screenshot?file=<basename>
 *
 * Route that serves PNG screenshots saved by the bot harness.
 * Screenshots are stored under sessions/failures/ — ONLY files in that
 * directory are served, with strict path-traversal protection.
 *
 * Security guarantees:
 * 1. Only .png files are served (MIME + extension check).
 * 2. The resolved file path must be strictly inside FAILURES_DIR — any
 *    `..` sequences or absolute paths that escape the directory are rejected.
 * Access is gated by the localhost bind + Tailscale (operator-level).
 */

const FAILURES_DIR = path.resolve(process.cwd(), "sessions", "failures");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const file = request.nextUrl.searchParams.get("file");

  // Must be provided
  if (!file) {
    return NextResponse.json({ error: "Paramètre 'file' manquant." }, { status: 400 });
  }

  // Only allow .png extension
  if (!file.endsWith(".png")) {
    return NextResponse.json({ error: "Seuls les fichiers .png sont servis." }, { status: 400 });
  }

  // Strip any directory components from the basename — we only allow bare filenames
  const basename = path.basename(file);

  // Paranoia: reject if basename differs from the original (catches encoded slashes etc.)
  if (basename !== file) {
    return NextResponse.json({ error: "Nom de fichier invalide." }, { status: 400 });
  }

  // Resolve the full path and verify it stays inside FAILURES_DIR
  const resolved = path.resolve(FAILURES_DIR, basename);
  if (!resolved.startsWith(FAILURES_DIR + path.sep) && resolved !== FAILURES_DIR) {
    // Should never reach this given the basename check above, but belt + suspenders.
    return NextResponse.json({ error: "Accès refusé." }, { status: 400 });
  }

  try {
    const data = await readFile(resolved);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier non trouvé." }, { status: 404 });
  }
}
