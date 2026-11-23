// Shared OpenAI Responses API call for FireWatch AI features (server only).
// Key: OPENAI_API_KEY. Model: FIREWATCH_AI_MODEL (default gpt-5-mini).

export type OpenAIResult = { ok: true; text: string } | { ok: false; notice: string };

interface CallOptions {
  instructions: string;
  input: string | { role: "user" | "assistant"; content: string }[];
  /** JSON Schema for structured output; the reply text is then a JSON string. */
  schema?: { name: string; schema: Record<string, unknown> };
  /** Let the model search the web for current conditions. */
  webSearch?: boolean;
}

export const hasOpenAIKey = () => Boolean(process.env["OPENAI_API_KEY"]);

export async function callOpenAI(options: CallOptions): Promise<OpenAIResult> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      notice: "Offline mode — add OPENAI_API_KEY on the server for full AI answers.",
    };
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env["FIREWATCH_AI_MODEL"] || "gpt-5-mini",
        instructions: options.instructions,
        input: options.input,
        store: false,
        ...(options.webSearch ? { tools: [{ type: "web_search" }] } : {}),
        ...(options.schema
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: options.schema.name,
                  schema: options.schema.schema,
                  strict: true,
                },
              },
            }
          : {}),
      }),
    });
    if (!response.ok) {
      console.error(`FireWatch AI request failed [${response.status}]: ${await response.text()}`);
      return { ok: false, notice: statusNotice(response.status) };
    }
    const json = (await response.json()) as {
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    };
    const text = (json.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text" && part.text)
      .map((part) => part.text)
      .join("\n")
      .trim();
    return text
      ? { ok: true, text }
      : { ok: false, notice: "FireWatch AI returned an empty answer." };
  } catch (error) {
    console.error("FireWatch AI request failed", error);
    return {
      ok: false,
      notice: "FireWatch cannot reach OpenAI right now. Check the internet connection.",
    };
  }
}

/** Luke's kid-friendly error messages, keyed by OpenAI status code. */
function statusNotice(status: number): string {
  if (status === 401)
    return "OpenAI did not accept this API key. Check you copied the whole key, then restart.";
  if (status === 429)
    return "OpenAI needs billing credits or hit its usage limit. Ask an adult to check billing.";
  return `OpenAI could not run the FireWatch AI model (status ${status}).`;
}

/** Parses a structured reply; returns null if the model didn't return valid JSON. */
export function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
