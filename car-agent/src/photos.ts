import type Anthropic from "@anthropic-ai/sdk";

const SUPPORTED = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof SUPPORTED)[number];
const MAX_PHOTOS = 8;
const MAX_BYTES = 4_500_000;

/**
 * Downloads listing photos and returns them as image blocks, so the model can
 * read the number plate and judge visible condition (rust, panels, tyres, interior).
 */
export async function getPhotos(urls: string[]): Promise<Anthropic.Beta.BetaToolResultBlockParam["content"]> {
  const blocks: Anthropic.Beta.BetaToolResultBlockParam["content"] = [];
  const skipped: string[] = [];
  for (const url of urls.slice(0, MAX_PHOTOS)) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "image/jpeg,image/png,image/webp,image/*" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!SUPPORTED.includes(type as MediaType)) throw new Error(`unsupported type ${type || "unknown"}`);
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length > MAX_BYTES) throw new Error("too large");
      blocks.push({ type: "text", text: `Photo: ${url}` });
      blocks.push({ type: "image", source: { type: "base64", media_type: type as MediaType, data: data.toString("base64") } });
    } catch (err) {
      skipped.push(`${url} (${(err as Error).message})`);
    }
  }
  if (skipped.length) blocks.push({ type: "text", text: `Could not load: ${skipped.join("; ")}` });
  if (blocks.length === 0) blocks.push({ type: "text", text: "No photos could be loaded." });
  return blocks;
}
