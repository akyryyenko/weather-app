import Anthropic from "@anthropic-ai/sdk";
import { getListing } from "./gumtree.js";
import { getMotHistory } from "./mot.js";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You are an experienced UK used-car inspector helping a private buyer decide whether a car advertised on Gumtree is worth viewing.

Workflow:
1. Call get_listing for the ad URL. Note make, model, year, engine, gearbox, mileage, owners, price, seller type, location and every claim in the description.
2. Find the registration: use the plate the user gave, otherwise plate_candidates from the listing (check it matches the car's age identifier). Then call get_mot_history. If no plate can be found, say so and continue with what you have.
3. Use web_search to find 3-6 comparable cars for sale in the UK (same model/generation, similar year, mileage and gearbox) and, if useful, known common faults for this model/engine.
4. Analyse the MOT history carefully: mileage timeline (gaps, roll-backs, implausibly low/high annual mileage, does the advertised mileage fit the last MOT), repeated advisories, corrosion, brakes, suspension, tyres, emissions, oil leaks, failures and how quickly they were fixed, gaps between tests, current MOT expiry.
5. Cross-check the ad against the MOT data (mileage, colour, fuel, "full service history", "like new" etc.) and flag contradictions.

Write the final report in Ukrainian, in Markdown, with these sections:
- **Коротко** — 2-3 sentences and an overall verdict: "Варто дивитись" / "Дивитись з обережністю" / "Не рекомендую".
- **Оцінка стану: X/10** with reasoning.
- **Ціна** — asking price vs the comparables you found (list them with price, year, mileage, link), verdict (дешево / адекватно / дорого) and a sensible offer range in £.
- **Історія MOT** — a table of tests (date, result, mileage, key defects) and your interpretation.
- **Ризики** — ordered by severity, each with why it matters and a rough UK repair cost.
- **Що перевірити на огляді і що спитати продавця** — concrete checklist.
- **Червоні прапорці / ознаки шахрайства**, if any (price far below market, seller refusing a viewing, deposit requests, plate not matching the car, etc.).

Be specific and honest; do not invent data. If something could not be fetched, say so clearly and state what the user should check manually (e.g. HPI/finance check, V5C).`;

const tools: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "get_listing",
    description:
      "Download a Gumtree ad and return its title, price, structured data (JSON-LD), visible text and UK number-plate candidates found on the page.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "Gumtree ad URL" } },
      required: ["url"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_mot_history",
    description:
      "Return the full UK MOT test history (dates, results, odometer readings, advisories, failures) for a registration number from DVSA.",
    input_schema: {
      type: "object",
      properties: { registration: { type: "string", description: "UK registration, e.g. NC53DMC" } },
      required: ["registration"],
      additionalProperties: false,
    },
    strict: true,
  },
  { type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "GB" } },
];

export interface AnalyseOptions {
  url: string;
  registration?: string;
  htmlFile?: string;
  log?: (msg: string) => void;
}

async function runTool(name: string, input: Record<string, string>, opts: AnalyseOptions): Promise<string> {
  if (name === "get_listing") {
    return JSON.stringify(await getListing(input.url, opts.htmlFile));
  }
  if (name === "get_mot_history") {
    return getMotHistory(input.registration);
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function analyseCar(opts: AnalyseOptions): Promise<string> {
  const log = opts.log ?? (() => {});
  const client = new Anthropic();

  let prompt = `Проаналізуй це оголошення: ${opts.url}`;
  if (opts.registration) prompt += `\nНомерний знак: ${opts.registration}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];

  for (let turn = 0; turn < 20; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: SYSTEM,
      tools,
      messages,
    });
    const response = await stream.finalMessage();
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      throw new Error(`Model declined: ${response.stop_details?.explanation ?? "no details"}`);
    }
    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    for (const b of response.content) {
      if (b.type === "server_tool_use") log(`web_search: ${JSON.stringify(b.input)}`);
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        log(`${t.name}: ${JSON.stringify(t.input)}`);
        try {
          const content = await runTool(t.name, t.input as Record<string, string>, opts);
          return { type: "tool_result", tool_use_id: t.id, content };
        } catch (err) {
          log(`  ! ${(err as Error).message}`);
          return { type: "tool_result", tool_use_id: t.id, content: String(err), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent did not finish within 20 turns");
}
