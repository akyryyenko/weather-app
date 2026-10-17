import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { fetchHtml, findUkPlates, visibleText } from "./util.js";

export interface Listing {
  url: string;
  title?: string;
  price?: string;
  description?: string;
  warning?: string;
  structuredData: unknown[];
  text: string;
  plateCandidates: string[];
  imageUrls: string[];
}

// Facebook serves the full page only to logged-in users, but gives Open Graph
// tags (title, price, description, main photo) to its own link-preview crawler.
const FACEBOOK_CRAWLER_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

/**
 * Downloads a car ad (Gumtree, Facebook Marketplace or any other site) and
 * pulls out everything useful for the model: JSON-LD / meta tags (price,
 * title, specs) plus the visible page text. If the site blocks the request,
 * pass the page saved from the browser via `htmlFile`.
 */
export async function getListing(url: string, htmlFile?: string): Promise<Listing> {
  const isFacebook = /(^|\.)facebook\.com$/.test(safeHost(url));
  const html = htmlFile
    ? await readFile(htmlFile, "utf8")
    : isFacebook
      ? await fetchHtml(url.split("?")[0], FACEBOOK_CRAWLER_UA)
      : await fetchHtml(url);
  const $ = cheerio.load(html);

  const structuredData: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      structuredData.push(JSON.parse($(el).text()));
    } catch {
      // ignore malformed blocks
    }
  });

  const meta = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content");

  const text = visibleText(html);
  return {
    url,
    title: meta("og:title") ?? ($("h1").first().text().trim() || undefined),
    price: meta("product:price:amount") ?? ($('[data-q="ad-price"]').first().text().trim() || undefined),
    description: meta("og:description") ?? meta("description"),
    warning:
      isFacebook && !htmlFile
        ? "Facebook only exposes the preview (title, price, short description, main photo) without login. Specs such as mileage may be missing; if so, tell the user to save the page from a logged-in browser and pass the file."
        : undefined,
    structuredData,
    text,
    plateCandidates: findUkPlates(`${$("title").text()}\n${meta("og:description") ?? ""}\n${text}`),
    imageUrls: collectImageUrls($, structuredData),
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Photo URLs from meta tags, JSON-LD and <img> elements, in page order. */
function collectImageUrls($: cheerio.CheerioAPI, structuredData: unknown[]): string[] {
  const urls: string[] = [];
  $('meta[property="og:image"]').each((_, el) => {
    urls.push($(el).attr("content") ?? "");
  });
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "image") [value].flat().forEach((v) => typeof v === "string" ? urls.push(v) : walk(v));
        else if (key === "url" && typeof value === "string" && /\.(jpe?g|png|webp)/i.test(value)) urls.push(value);
        else walk(value);
      }
    }
  };
  walk(structuredData);
  $("img").each((_, el) => {
    urls.push($(el).attr("data-src") ?? $(el).attr("src") ?? "");
  });
  const photos = urls.filter((u) => /^https?:\/\//.test(u) && !/\.svg|logo|icon|avatar|sprite/i.test(u));
  return [...new Set(photos)].slice(0, 30);
}
