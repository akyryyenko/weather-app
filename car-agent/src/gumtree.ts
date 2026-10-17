import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { fetchHtml, findUkPlates, visibleText } from "./util.js";

export interface Listing {
  url: string;
  title?: string;
  price?: string;
  structuredData: unknown[];
  text: string;
  plateCandidates: string[];
}

/**
 * Downloads a Gumtree ad and pulls out everything useful for the model:
 * JSON-LD / meta tags (price, title, specs) plus the visible page text.
 * If Gumtree blocks the request, pass the saved page via `htmlFile`
 * (browser: Ctrl+S → "Webpage, HTML only").
 */
export async function getListing(url: string, htmlFile?: string): Promise<Listing> {
  const html = htmlFile ? await readFile(htmlFile, "utf8") : await fetchHtml(url);
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
    structuredData,
    text,
    plateCandidates: findUkPlates(`${$("title").text()}\n${text}`),
  };
}
