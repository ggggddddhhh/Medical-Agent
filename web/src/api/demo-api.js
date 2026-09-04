export class DemoApiError extends Error {
  constructor(message, code = "DEMO_API_ERROR", status = null) {
    super(message);
    this.name = "DemoApiError";
    this.code = code;
    this.status = status;
  }
}

function configuredBaseUrl() {
  return import.meta.env.VITE_DEMO_API_BASE_URL || "/api";
}

export function createDemoApi({
  baseUrl = configuredBaseUrl(),
  fetchImpl = globalThis.fetch
} = {}) {
  const root = baseUrl.replace(/\/$/, "");

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${root}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new DemoApiError(
        "Demo API 暂时不可用，请确认本地服务已启动。",
        "DEMO_API_UNAVAILABLE"
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new DemoApiError("Demo API 返回了无效数据。", "INVALID_DEMO_RESPONSE", response.status);
    }

    if (!response.ok) {
      throw new DemoApiError(
        payload?.error?.message || payload?.message || "Demo API 请求失败。",
        payload?.error?.code || "DEMO_API_ERROR",
        response.status
      );
    }
    return payload;
  }

  return {
    health: () => request("/health"),
    listCases: () => request("/v1/demo/cases"),
    runCase: (caseId) => request(`/v1/demo/cases/${encodeURIComponent(caseId)}/run`, { method: "POST" }),
    createSession: (context = { adultConfirmed: true }) => request("/v1/demo/sessions", {
      method: "POST",
      body: JSON.stringify({ context })
    }),
    sendMessage: (sessionId, message) => request(
      `/v1/demo/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", body: JSON.stringify({ message }) }
    ),
    getSession: (sessionId) => request(`/v1/demo/sessions/${encodeURIComponent(sessionId)}`)
  };
}

export const demoApi = createDemoApi();
