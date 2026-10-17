import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyseCar, compareCars } from "./agent.js";

const CONCURRENCY = 3;

const file = process.argv[2] ?? "links.txt";

// One car per line: "<gumtree-url> [REG]". Blank lines and # comments are skipped.
const cars = (await readFile(file, "utf8"))
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .filter((line) => {
    if (/^https?:\/\//.test(line)) return true;
    console.error(`Skipping line that is not a link: ${line}`);
    return false;
  })
  .map((line) => {
    const [url, ...reg] = line.split(/\s+/);
    return { url, registration: reg.join("") || undefined };
  });

if (cars.length === 0) {
  console.error(`No links found in ${file}. Put one Gumtree link per line (optionally followed by the plate).`);
  process.exit(1);
}

const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
const outDir = join("reports", stamp);
await mkdir(outDir, { recursive: true });
console.error(`Analysing ${cars.length} cars, reports → ${outDir}/`);

const reports: string[] = new Array(cars.length);
let next = 0;
async function worker() {
  while (next < cars.length) {
    const i = next++;
    const car = cars[i];
    const tag = `[${i + 1}/${cars.length}]`;
    try {
      reports[i] = await analyseCar({
        ...car,
        short: true,
        log: (msg) => console.error(`${tag} → ${msg}`),
      });
    } catch (err) {
      console.error(`${tag} ! ${(err as Error).message}`);
      reports[i] = `## Авто ${i + 1}: не вдалося проаналізувати\n${car.url}\n\nПомилка: ${(err as Error).message}`;
    }
    await writeFile(join(outDir, `car-${i + 1}.md`), reports[i]);
    console.error(`${tag} done`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cars.length) }, worker));

console.error("Comparing…");
let comparison = "";
if (cars.length > 1) {
  try {
    comparison = await compareCars(reports);
  } catch (err) {
    console.error(`! comparison failed: ${(err as Error).message}`);
  }
}
const summary = `# Порівняння авто (${stamp})\n\n${comparison}\n\n---\n\n${reports.join("\n\n---\n\n")}\n`;
const summaryPath = join(outDir, "summary.md");
await writeFile(summaryPath, summary);

console.log(summary);
console.error(`\nSummary saved to ${summaryPath}`);
