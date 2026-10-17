import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

/** Visible page text with scripts/styles/nav stripped, collapsed whitespace. */
export function visibleText(html: string, maxChars = 30000): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, header nav, footer").remove();
  $("br, p, div, li, tr, td, th, dt, dd, h1, h2, h3, h4, h5, h6, section, article").append("\n");
  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return text.slice(0, maxChars);
}

// Current (AB12 CDE), prefix (A123 BCD) and suffix (ABC 123D) UK formats.
const UK_PLATE =
  /\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3}|[A-HJ-PR-Y][0-9]{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?[0-9]{1,3}[A-HJ-PR-Y])\b/g;

export function findUkPlates(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.toUpperCase().matchAll(UK_PLATE)) {
    found.add(m[1].replace(/\s/g, ""));
  }
  return [...found];
}

export function normaliseReg(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
