from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from . import CORPUS_VERSION, SERVICE_VERSION
from .catalog import ALLOWED_TOPICS, ApprovedKnowledgeCatalog
from .lightrag_backend import create_backend_from_env

MAX_BODY_BYTES = 16_384
ALLOWED_INTENTS = frozenset({"health_education", "medical_explanation", "reference_support"})
QUERY_TEMPLATES = {
    "headache": "成年人头痛的一般健康教育、需要关注的危险信号和可靠参考依据",
    "chest_pain": "成年人胸痛的一般健康教育、需要关注的危险信号和可靠参考依据",
}


class KnowledgeServiceError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class KnowledgeService:
    def __init__(self, backend: Any, catalog: ApprovedKnowledgeCatalog) -> None:
        self.backend = backend
        self.catalog = catalog

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok" if self.backend.ready else "degraded",
            "serviceVersion": SERVICE_VERSION,
            "backend": self.backend.name,
            "ready": bool(self.backend.ready),
            "corpusVersion": CORPUS_VERSION,
            "documentCount": self.catalog.document_count,
        }

    def query(self, payload: Any) -> dict[str, Any]:
        topic, intent, limit = validate_query_request(payload)
        query = f"{QUERY_TEMPLATES[topic]}。用途：{intent}。"
        try:
            source_ids = self.backend.query_source_ids(query, limit)
        except Exception as exc:
            raise KnowledgeServiceError(
                503,
                "KNOWLEDGE_BACKEND_UNAVAILABLE",
                "Knowledge retrieval is unavailable.",
            ) from exc
        items = self.catalog.materialize(source_ids, limit, topic=topic)
        return {
            "serviceVersion": SERVICE_VERSION,
            "status": "available" if items else "no_results",
            "corpusVersion": CORPUS_VERSION,
            "items": items,
        }


class KnowledgeHttpServer(ThreadingHTTPServer):
    def __init__(self, server_address: tuple[str, int], handler: Any, backend: Any) -> None:
        super().__init__(server_address, handler)
        self.backend = backend

    def server_close(self) -> None:
        try:
            self.backend.close()
        finally:
            super().server_close()


def create_server(
    host: str = "127.0.0.1",
    port: int = 8002,
    backend: Any | None = None,
    catalog: ApprovedKnowledgeCatalog | None = None,
) -> KnowledgeHttpServer:
    knowledge_catalog = catalog or ApprovedKnowledgeCatalog()
    knowledge_backend = backend or create_backend_from_env(knowledge_catalog)
    service = KnowledgeService(knowledge_backend, knowledge_catalog)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send(200, service.health())
                return
            self._send(404, error_body("NOT_FOUND", "Route not found."))

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/v1/knowledge/query":
                self._send(404, error_body("NOT_FOUND", "Route not found."))
                return
            try:
                self._send(200, service.query(self._read_json()))
            except KnowledgeServiceError as exc:
                self._send(exc.status, error_body(exc.code, str(exc)))
            except Exception:
                self._send(500, error_body("INTERNAL_ERROR", "Knowledge request failed."))

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise KnowledgeServiceError(400, "INVALID_BODY_SIZE", "Request body size is invalid.")
            try:
                return json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise KnowledgeServiceError(400, "INVALID_JSON", "Request body must be valid JSON.") from exc

        def _send(self, status: int, body: dict[str, Any]) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    return KnowledgeHttpServer((host, port), Handler, knowledge_backend)


def validate_query_request(payload: Any) -> tuple[str, str, int]:
    if not isinstance(payload, dict):
        raise KnowledgeServiceError(400, "INVALID_REQUEST", "Request must be an object.")
    if set(payload) - {"topic", "intent", "limit"}:
        raise KnowledgeServiceError(400, "FORBIDDEN_REQUEST_FIELD", "Request contains forbidden fields.")
    topic = payload.get("topic")
    intent = payload.get("intent", "health_education")
    limit = payload.get("limit", 2)
    if topic not in ALLOWED_TOPICS:
        raise KnowledgeServiceError(400, "INVALID_TOPIC", "topic is not supported.")
    if intent not in ALLOWED_INTENTS:
        raise KnowledgeServiceError(400, "INVALID_INTENT", "intent is not supported.")
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 3:
        raise KnowledgeServiceError(400, "INVALID_LIMIT", "limit must be an integer from 1 to 3.")
    return topic, intent, limit


def error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}, "serviceVersion": SERVICE_VERSION}


def main() -> None:
    host = os.getenv("PYTHON_KNOWLEDGE_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("PYTHON_KNOWLEDGE_SERVICE_PORT", "8002"))
    server = create_server(host, port)
    print(f"Python LightRAG Knowledge Service listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
