export type BackgroundRemovalResult =
  | { ok: true; buffer: Buffer; contentType: "image/png" }
  | { ok: false; reason: "missing_config" | "api_error"; message: string };

export async function removeBackgroundWithRemoveBg(
  input: Buffer,
  filename: string,
): Promise<BackgroundRemovalResult> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_config",
      message: "REMOVEBG_API_KEY manquant",
    };
  }

  const formData = new FormData();
  formData.append("size", "auto");
  formData.append("format", "png");
  formData.append("bg_color", "FFFFFF");
  formData.append("image_file", new Blob([new Uint8Array(input)]), filename);

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      reason: "api_error",
      message: `${response.status} ${body.slice(0, 180)}`.trim(),
    };
  }

  return {
    ok: true,
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: "image/png",
  };
}
