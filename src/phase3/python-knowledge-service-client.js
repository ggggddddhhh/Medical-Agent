export const PYTHON_KNOWLEDGE_CLIENT_VERSION = "python-knowledge-client-0.1.0";

export class KnowledgeServiceClientError extends Error {
  constructor(code) {
    super(`Python knowledge service request failed: ${code}`);
    this.name = "KnowledgeServiceClientError";
    this.code = code;
  }
}

export class PythonKnowledgeServiceClient {
  #baseUrl;
  #fetch;
  #timeoutMs;

  constructor({
    baseUrl = process.env.PYTHON_KNOWLEDGE_SERVICE_URL ?? "http://127.0.0.1:8002",
    fetchImpl = globalThis.fetch,
    timeoutMs = 2_000,
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("PythonKnowledgeServiceClient requires fetch.");
    }
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
  }

  async query(payload) {
    assertRequest(payload);
    let response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/v1/knowledge/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      throw new KnowledgeServiceClientError("SERVICE_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new KnowledgeServiceClientError(`HTTP_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new KnowledgeServiceClientError("INVALID_JSON");
    }
  }
}

function assertRequest(payload) {
  const keys = Object.keys(payload ?? {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["intent", "limit", "topic"])) {
    throw new TypeError("Knowledge request must contain only topic, intent and limit.");
  }
  if (!["headache", "chest_pain"].includes(payload.topic)) {
    throw new TypeError("Knowledge request topic is not supported.");
  }
}
