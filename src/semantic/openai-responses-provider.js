export class OpenAIResponsesProvider {
  #apiKey;
  #fetchImpl;
  #baseUrl;
  name = "openai";

  constructor({ apiKey, model, fetchImpl = globalThis.fetch, baseUrl } = {}) {
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new TypeError("OpenAIResponsesProvider requires apiKey.");
    }
    if (typeof model !== "string" || model.length === 0) {
      throw new TypeError("OpenAIResponsesProvider requires an explicit model.");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("OpenAIResponsesProvider requires fetch.");
    }
    this.#apiKey = apiKey;
    this.model = model;
    this.#fetchImpl = fetchImpl;
    this.#baseUrl = baseUrl ?? "https://api.openai.com/v1/responses";
  }

  async generate({ message, systemInstruction, jsonSchema, signal }) {
    const response = await this.#fetchImpl(this.#baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        input: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "clinical_fact_extraction",
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
      signal,
    });
    if (!response.ok) {
      const error = new Error(`OpenAI Responses API returned ${response.status}.`);
      error.status = response.status;
      error.code = response.status === 429 ? "RATE_LIMIT" : "PROVIDER_HTTP_ERROR";
      throw error;
    }
    const payload = await response.json();
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
    return outputText ?? "";
  }
}
