import { createServer } from "node:http";

export const AGENT_API_VERSION = "phase-2b-agent-api-0.1.0";

export function createAgentApiServer({ loop, maxBodyBytes = 65_536 } = {}) {
  if (!loop || typeof loop.handleMessage !== "function") {
    throw new TypeError("createAgentApiServer requires a MultiTurnAgentLoop.");
  }
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { status: "ok", apiVersion: AGENT_API_VERSION });
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions") {
        const body = await readJson(request, maxBodyBytes);
        const sessionId = loop.startSession(body.context ?? {});
        return send(response, 201, { sessionId, ...loop.getSession(sessionId) });
      }
      const messages = /^\/v1\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
      if (request.method === "POST" && messages) {
        const body = await readJson(request, maxBodyBytes);
        if (typeof body.message !== "string" || body.message.trim().length === 0) {
          return send(response, 400, errorBody("INVALID_MESSAGE", "message must be non-empty."));
        }
        const result = await loop.handleMessage(decodeURIComponent(messages[1]), body.message);
        return send(response, 200, result);
      }
      const traces = /^\/v1\/sessions\/([^/]+)\/traces$/.exec(url.pathname);
      if (request.method === "GET" && traces) {
        const sessionId = decodeURIComponent(traces[1]);
        return send(response, 200, { sessionId, traces: loop.getDecisionTraces(sessionId) });
      }
      const session = /^\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && session) {
        const sessionId = decodeURIComponent(session[1]);
        return send(response, 200, { sessionId, ...loop.getSession(sessionId) });
      }
      return send(response, 404, errorBody("NOT_FOUND", "Route not found."));
    } catch (error) {
      const unknownSession = /Unknown session/.test(error?.message ?? "");
      const status = unknownSession ? 404 : error?.code === "SESSION_TURN_IN_PROGRESS" ? 409 : 400;
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
  return { error: { code, message }, apiVersion: AGENT_API_VERSION };
}
