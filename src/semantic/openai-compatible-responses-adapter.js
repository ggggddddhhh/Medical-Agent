export class OpenAICompatibleResponsesAdapter {
  #apiKey;
  #fetchImpl;
  #endpoint;
  #includeStore;
  #includeStrict;
  #reasoningEffort;
  #temperature;

  constructor({
    provider = "openai",
    apiKey,
    model,
    fetchImpl = globalThis.fetch,
    baseUrl = "https://api.openai.com/v1/responses",
    includeStore = true,
    includeStrict = true,
    reasoningEffort,
    temperature,
  } = {}) {
    if (typeof provider !== "string" || provider.length === 0) {
      throw new TypeError("OpenAICompatibleResponsesAdapter requires provider.");
    }
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      throw new TypeError("OpenAICompatibleResponsesAdapter requires apiKey.");
    }
    if (typeof model !== "string" || model.length === 0) {
      throw new TypeError("OpenAICompatibleResponsesAdapter requires an explicit model.");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("OpenAICompatibleResponsesAdapter requires fetch.");
    }
    this.name = provider;
    this.model = model;
    this.baseApiFormat = "Responses API";
    this.#apiKey = apiKey;
    this.#fetchImpl = fetchImpl;
    this.#endpoint = responsesEndpoint(baseUrl);
    this.#includeStore = includeStore;
    this.#includeStrict = includeStrict;
    this.#reasoningEffort = reasoningEffort;
    this.#temperature = temperature;
  }

  get endpoint() {
    return this.#endpoint;
  }

  async generate({
    message,
    systemInstruction,
    jsonSchema,
    schemaName = "clinical_fact_extraction",
    signal,
  }) {
    const format = {
      type: "json_schema",
      name: schemaName,
      schema: jsonSchema,
    };
    if (this.#includeStrict) {
      format.strict = true;
    }
    const body = {
      model: this.model,
      input: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message },
      ],
      text: { format },
    };
    if (this.#includeStore) {
      body.store = false;
    }
    if (this.#reasoningEffort) {
      body.reasoning = { effort: this.#reasoningEffort };
    }
    if (this.#temperature !== undefined) {
      body.temperature = this.#temperature;
    }

    const response = await this.#fetchImpl(this.#endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const error = new Error(`${this.name} Responses API returned ${response.status}.`);
      error.status = response.status;
      error.code = response.status === 429 ? "RATE_LIMIT" : "PROVIDER_HTTP_ERROR";
      throw error;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const error = new Error(`${this.name} returned a non-JSON response.`);
      error.code = "PROVIDER_RESPONSE_JSON_ERROR";
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      const error = new Error(`${this.name} returned an unexpected response shape.`);
      error.code = "UNEXPECTED_RESPONSE_SHAPE";
      throw error;
    }
    const outputText = extractOutputText(payload);
    return {
      type: "semantic_provider_response",
      outputText,
      metadata: {
        responseId: typeof payload.id === "string" ? payload.id : null,
        modelSnapshot: typeof payload.model === "string" ? payload.model : this.model,
        responseStatus: typeof payload.status === "string" ? payload.status : null,
      },
    };
  }
}

function responsesEndpoint(baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new TypeError("baseUrl must be a non-empty string.");
  }
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/responses") ? normalized : `${normalized}/responses`;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  if (payload.output !== undefined && !Array.isArray(payload.output)) {
    const error = new Error("Responses API output must be an array.");
    error.code = "UNEXPECTED_RESPONSE_SHAPE";
    throw error;
  }
  return (
    payload.output
      ?.flatMap((item) => item?.content ?? [])
      .find((item) => item?.type === "output_text" && typeof item.text === "string")
      ?.text ?? ""
  );
}
