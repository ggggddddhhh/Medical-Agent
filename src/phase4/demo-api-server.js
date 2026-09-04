import { createServer } from "node:http";

import { DEMO_APPLICATION_VERSION } from "./demo-application.js";

export const DEMO_API_VERSION = "phase-4-demo-api-0.1.0";

export function createDemoApiServer({ demo, maxBodyBytes = 65_536 } = {}) {
  if (!demo || typeof demo.runCase !== "function") {
    throw new TypeError("createDemoApiServer requires a DemoApplication.");
  }
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, {
          status: "ok",
          apiVersion: DEMO_API_VERSION,
          demoVersion: DEMO_APPLICATION_VERSION,
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/demo/cases") {
        return send(response, 200, {
          apiVersion: DEMO_API_VERSION,
          cases: demo.listCases(),
        });
      }
      const runCase = /^\/v1\/demo\/cases\/([^/]+)\/run$/.exec(url.pathname);
      if (request.method === "POST" && runCase) {
        const result = await demo.runCase(decodeURIComponent(runCase[1]));
        return send(response, 200, result);
      }
      if (request.method === "POST" && url.pathname === "/v1/demo/sessions") {
        const body = await readJson(request, maxBodyBytes);
        return send(response, 201, demo.startSession(body));
      }
      const messages = /^\/v1\/demo\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
      if (request.method === "POST" && messages) {
        const body = await readJson(request, maxBodyBytes);
        const result = await demo.handleMessage(
          decodeURIComponent(messages[1]),
          body.message,
        );
        return send(response, 200, result);
      }
      const resume = /^\/v1\/demo\/sessions\/([^/]+)\/resume$/.exec(url.pathname);
      if (request.method === "POST" && resume) {
        const sessionId = decodeURIComponent(resume[1]);
        return send(response, 200, await demo.resumeSession(sessionId));
      }
      const history = /^\/v1\/demo\/sessions\/([^/]+)\/history$/.exec(url.pathname);
      if (request.method === "GET" && history) {
        const sessionId = decodeURIComponent(history[1]);
        return send(response, 200, { sessionId, history: demo.getHistory(sessionId) });
      }
      const session = /^\/v1\/demo\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && session) {
        return send(response, 200, demo.getSession(decodeURIComponent(session[1])));
      }
      return send(response, 404, errorBody("NOT_FOUND", "Route not found."));
    } catch (error) {
      const unknownSession = /Unknown session|Session is not active/.test(error?.message ?? "")
        || error?.code === "SESSION_CHECKPOINT_NOT_FOUND";
      const status = unknownSession || error?.code === "DEMO_CASE_NOT_FOUND"
        ? 404
        : error?.code === "SESSION_TURN_IN_PROGRESS" ? 409 : 400;
      return send(response, status, errorBody(
        unknownSession ? "SESSION_NOT_FOUND" : error?.code ?? "BAD_REQUEST",
        unknownSession ? "Session not found." : error?.message ?? "Request failed.",
      ));
    }
  });
}

async function readJson(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function errorBody(code, message) {
  return { error: { code, message }, apiVersion: DEMO_API_VERSION };
}
