import { describe, expect, it, vi } from "vitest";
import { createDemoApi, DemoApiError } from "./demo-api.js";

function jsonResponse(payload, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload)
  });
}

describe("Demo API client", () => {
  it("uses only the published Phase 4 routes and encodes identifiers", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ ok: true }));
    const api = createDemoApi({ baseUrl: "http://demo.test/", fetchImpl });

    await api.health();
    await api.listCases();
    await api.runCase("ordinary headache");
    await api.createSession({ adultConfirmed: true });
    await api.sendMessage("session/1", "我头痛");
    await api.getSession("session/1");

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "http://demo.test/health",
      "http://demo.test/v1/demo/cases",
      "http://demo.test/v1/demo/cases/ordinary%20headache/run",
      "http://demo.test/v1/demo/sessions",
      "http://demo.test/v1/demo/sessions/session%2F1/messages",
      "http://demo.test/v1/demo/sessions/session%2F1"
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body)).toEqual({ context: { adultConfirmed: true } });
    expect(JSON.parse(fetchImpl.mock.calls[4][1].body)).toEqual({ message: "我头痛" });
  });

  it("maps transport and HTTP failures to safe user-facing errors", async () => {
    const offline = createDemoApi({ baseUrl: "/api", fetchImpl: vi.fn(() => Promise.reject(new Error("secret network details"))) });
    await expect(offline.health()).rejects.toMatchObject({ name: "DemoApiError", code: "DEMO_API_UNAVAILABLE" });

    const rejected = createDemoApi({ baseUrl: "/api", fetchImpl: vi.fn(() => jsonResponse({ error: { code: "INVALID_MESSAGE", message: "message required" } }, 400)) });
    await expect(rejected.sendMessage("one", " ")).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_MESSAGE", status: 400 })
    );
    expect(DemoApiError.prototype).toBeInstanceOf(Error);
  });
});
