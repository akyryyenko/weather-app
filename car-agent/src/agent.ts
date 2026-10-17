import Anthropic from "@anthropic-ai/sdk";
import { getListing } from "./gumtree.js";
import { getMotHistory } from "./mot.js";
import { getPhotos } from "./photos.js";

const MODEL = "claude-opus-5-5";

const WORKFLOW = `You are an experienced UK used-car inspector helping a private buyer decide whether a car advertised online (Gumtree, Facebook Marketplace or similar) is worth viewing.

Workflow:
1. Call get_listing for the ad URL. Note make, model, year, engine, gearbox, mileage, owners, price, seller type, location and every claim in the description.
2. Call get_photos with the most useful imageUrls from the listing (exterior front/rear first, then interior, engine, tyres, dashboard with mileage). Use the photos to judge visible condition (rust, dents, panel gaps, paint mismatch, tyre wear, interior wear, warning lights, odometer reading).
3. Find the registration: use the plate the user gave, otherwise plateCandidates from the listing, otherwise read it from the photos. Only use a plate from a photo if every character is clearly legible; private plates are often blurred or covered, so never guess. Then call get_mot_history and check that the make, model, colour and fuel in the MOT record match the car; if they don't, the plate is wrong. In the report, say where the plate came from (user / ad text / photo) and that a plate read from a photo should be confirmed with the seller. If no plate can be found, say so and continue with what you have.
4. Use web_search to find 3-6 comparable cars for sale in the UK (same model/generation, similar year, mileage and gearbox) and, if useful, known common faults for this model/engine.
5. Analyse the MOT history carefully: mileage timeline (gaps, roll-backs, implausibly low/high annual mileage, does the advertised mileage fit the last MOT), repeated advisories, corrosion, brakes, suspension, tyres, emissions, oil leaks, failures and how quickly they were fixed, gaps between tests, current MOT expiry.
6. Cross-check the ad against the MOT data (mileage, colour, fuel, "full service history", "like new" etc.) and flag contradictions.

Be specific and honest; do not invent data. If something could not be fetched, say so clearly and state what the user should check manually (e.g. HPI/finance check, V5C).`;

const FULL_REPORT = `Write the final report in Ukrainian, in Markdown, with these sections:
- **Коротко** — 2-3 sentences and an overall verdict: "Варто дивитись" / "Дивитись з обережністю" / "Не рекомендую".
- **Оцінка стану: X/10** with reasoning.
- **Ціна** — asking price vs the comparables you found (list them with price, year, mileage, link), verdict (дешево / адекватно / дорого) and a sensible offer range in £.
- **Історія MOT** — a table of tests (date, result, mileage, key defects) and your interpretation.
- **Ризики** — ordered by severity, each with why it matters and a rough UK repair cost.
- **Що перевірити на огляді і що спитати продавця** — concrete checklist.
- **Червоні прапорці / ознаки шахрайства**, if any (price far below market, seller refusing a viewing, deposit requests, plate not matching the car, etc.).`;

const SHORT_REPORT = `Write a SHORT report in Ukrainian, in Markdown, at most ~20 lines:
- First line: \`## <make model year> — £<price>\` followed by the ad URL on its own line.
- **Вердикт:** "Варто дивитись" / "Дивитись з обережністю" / "Не рекомендую" + one sentence why.
- **Стан:** X/10.
- **Ціна:** дешево / адекватно / дорого, the market range you found and a sensible offer in £.
- **MOT:** 2-3 key facts (mileage consistency, recurring advisories, failures, expiry).
- **Головні ризики:** top 3, one line each with a rough repair cost.
- **Перевірити на огляді:** top 3 items.`;

const tools: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "get_listing",
    description:
      "Download a car ad (Gumtree, Facebook Marketplace or another site) and return its title, price, description, structured data (JSON-LD), visible text, UK number-plate candidates found in the text and imageUrls of the listing photos.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "Ad URL (or the saved-page file path the user gave)" } },
      required: ["url"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_photos",
    description:
      "Download up to 8 listing photos (URLs from get_listing imageUrls) and return them as images, to read the number plate and assess visible condition.",
    input_schema: {
      type: "object",
      properties: {
        image_urls: { type: "array", items: { type: "string" }, description: "Photo URLs, most useful first" },
      },
      required: ["image_urls"],
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
  /** Compact report for comparing several cars. */
  short?: boolean;
  registration?: string;
  htmlFile?: string;
  log?: (msg: string) => void;
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  opts: AnalyseOptions,
): Promise<Anthropic.Beta.BetaToolResultBlockParam["content"]> {
  if (name === "get_listing") {
    return JSON.stringify(await getListing(input.url as string, opts.htmlFile));
  }
  if (name === "get_mot_history") {
    return getMotHistory(input.registration as string);
  }
  if (name === "get_photos") {
    return getPhotos(input.image_urls as string[]);
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
      system: `${WORKFLOW}\n\n${opts.short ? SHORT_REPORT : FULL_REPORT}`,
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
      // Dynamic-filtering web search also emits code blocks; only queries are worth showing.
      const query = (b.type === "server_tool_use" && (b.input as { query?: string }).query) || undefined;
      if (query) log(`web_search: ${query}`);
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return finalText(response.content);
    }

    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        log(t.name === "get_photos" ? `get_photos: ${(t.input as { image_urls: string[] }).image_urls.length} photos` : `${t.name}: ${JSON.stringify(t.input)}`);
        try {
          const content = await runTool(t.name, t.input as Record<string, unknown>, opts);
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

/**
 * The report is the text after the last tool call; earlier text is the model
 * narrating its search. Search citations split one paragraph into several
 * text blocks, so they are joined without separators.
 */
function finalText(content: Anthropic.Beta.BetaContentBlock[]): string {
  const lastTool = content.findLastIndex((b) => b.type !== "text" && b.type !== "thinking");
  return content
    .slice(lastTool + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Ranks several short reports against each other. */
export async function compareCars(reports: string[]): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: `Ось короткі звіти по кількох авто з оголошень:\n\n${reports.join("\n\n---\n\n")}\n\nСклади українською Markdown-таблицю для порівняння (авто, ціна, стан /10, оцінка ціни, вердикт, головний ризик), відсортовану від найкращого варіанту до найгіршого, і під нею 2-3 речення: яку машину дивитись першою і чому. Тільки таблиця і висновок.`,
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
