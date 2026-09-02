export const PYTHON_AI_SERVICE_PROVIDER_VERSION = "python-ai-service-provider-0.1.0";

export class PythonAiServiceProvider {
  #baseUrl;
  #fetch;

  constructor({
    baseUrl = process.env.PYTHON_AI_SERVICE_URL ?? "http://127.0.0.1:8001",
    model = "deepseek-v4-flash",
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof baseUrl !== "string" || baseUrl.length === 0) {
      throw new TypeError("PythonAiServiceProvider requires baseUrl.");
    }
    if (typeof model !== "string" || model.length === 0) {
      throw new TypeError("PythonAiServiceProvider requires model.");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("PythonAiServiceProvider requires fetch.");
    }
    this.name = "Python AI Service";
    this.model = model;
    this.baseApiFormat = "Phase 2B Python AI Service HTTP API";
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#fetch = fetchImpl;
  }

  get endpoint() {
    return `${this.#baseUrl}/v1/model/responses`;
  }

  async generate({
    message,
    systemInstruction,
    jsonSchema,
    schemaName = "clinical_fact_extraction",
    signal,
  }) {
    const response = await this.#fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        message,
        systemInstruction,
        jsonSchema,
        schemaName,
      }),
      signal,
    });
    if (!response.ok) {
      const error = new Error(`Python AI Service returned ${response.status}.`);
      error.status = response.status;
      error.code = response.status === 429 ? "RATE_LIMIT" : "PYTHON_AI_SERVICE_HTTP_ERROR";
      throw error;
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      const error = new Error("Python AI Service returned non-JSON output.");
      error.code = "PYTHON_AI_SERVICE_INVALID_JSON";
      throw error;
    }
    if (
      !payload || typeof payload !== "object" || Array.isArray(payload) ||
      !(typeof payload.outputText === "string" || isObject(payload.outputText))
    ) {
      const error = new Error("Python AI Service returned an invalid response envelope.");
      error.code = "PYTHON_AI_SERVICE_INVALID_ENVELOPE";
      throw error;
    }
    return {
      type: "semantic_provider_response",
      outputText: structuredClone(payload.outputText),
      metadata: {
        serviceVersion: payload.serviceVersion ?? null,
        responseId: payload.metadata?.responseId ?? null,
        modelSnapshot: payload.metadata?.modelSnapshot ?? this.model,
        responseStatus: payload.metadata?.responseStatus ?? null,
      },
    };
  }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
