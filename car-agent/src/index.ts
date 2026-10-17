import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { analyseCar } from "./agent.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reg: { type: "string", short: "r" },
    html: { type: "string" },
    out: { type: "string", short: "o" },
  },
});

const url = positionals[0];
if (!url) {
  console.error(
    "Usage: npm run check -- <gumtree-url> [--reg NC53DMC] [--html saved-page.html] [--out report.md]",
  );
  process.exit(1);
}

const report = await analyseCar({
  url,
  registration: values.reg,
  htmlFile: values.html,
  log: (msg) => console.error(`→ ${msg}`),
});

if (values.out) {
  await writeFile(values.out, report);
  console.error(`Report saved to ${values.out}`);
}
console.log(report);
