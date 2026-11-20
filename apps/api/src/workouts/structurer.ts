import { WorkoutStructureSchema } from "@activen/contracts/requests";
import { parseWorkout, type WorkoutStructure } from "@activen/domain";

/** Turns free text into a structured workout suggestion, or null when it cannot. */
export interface WorkoutAi {
  structure(text: string, locale: string): Promise<WorkoutStructure | null>;
}

const SYSTEM = `You convert a running/cycling coach's workout description into JSON.
Answer with one JSON object only, no prose, matching:
{"items":[Item...]}
Item = {"kind":"step","intensity":"warmup"|"active"|"recovery"|"rest"|"cooldown",
        "duration":{"type":"distance","meters":N}|{"type":"time","seconds":N}|{"type":"open"},
        "target":{"type":"none"}|{"type":"pace","low":SECONDS_PER_KM,"high":SECONDS_PER_KM}
                 |{"type":"hr_zone","zone":1-5}|{"type":"label","text":"named effort"}}
     | {"kind":"repeat","count":N,"steps":[step...]}
Rules: use only numbers present in the text; a named effort without numbers ("5K pace",
"маратонско темпо") is a label target; do not invent paces or zones. If the text is not a
workout, answer {"items":[]}. The text may be Macedonian or English.`;

/**
 * Claude via the Messages API. Only the workout text is sent: no names, no health data
 * (see docs/coach-workout-authoring.md). Disabled unless ACTIVEN_AI_API_KEY and
 * ACTIVEN_AI_MODEL are configured.
 */
export class AnthropicWorkoutAi implements WorkoutAi {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async structure(text: string, locale: string): Promise<WorkoutStructure | null> {
    const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: `Locale: ${locale}\nWorkout: ${text}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const out = body.content?.find((c) => c.type === "text")?.text ?? "";
    const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    if (!json) return null;
    try {
      const parsed = WorkoutStructureSchema.safeParse({ ...JSON.parse(json), source: "ai" });
      return parsed.success && parsed.data.items.length ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

/** Parser first (fast, free, checkable); AI only for text the parser does not understand. */
export async function structureWorkout(
  text: string,
  locale: string,
  ai: WorkoutAi | null,
): Promise<WorkoutStructure | null> {
  const parsed = parseWorkout(text);
  if (parsed) return parsed;
  if (!ai) return null;
  try {
    return await ai.structure(text, locale);
  } catch {
    return null;
  }
}
