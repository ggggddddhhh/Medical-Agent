"""Minimal HTTP model gateway for the Phase 2B Node.js Agent Core.

The Node.js process owns prompts, schemas, Semantic Gate, CaseState and safety
decisions. This service owns model transport only; future embedding, retrieval
and knowledge-base components can be added behind separate endpoints.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib import error, request

from . import SERVICE_VERSION

MAX_BODY_BYTES = 1_048_576


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class DeepSeekGateway:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = (base_url or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")).rstrip("/")
        self.timeout_seconds = timeout_seconds

    def generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.api_key:
            raise ServiceError(503, "MODEL_CREDENTIAL_UNAVAILABLE", "Model credential is not configured.")
        upstream_body = build_upstream_request(payload)
        upstream_request = request.Request(
            f"{self.base_url}/responses",
            data=json.dumps(upstream_body, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(upstream_request, timeout=self.timeout_seconds) as response:
                upstream = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            code = "RATE_LIMIT" if exc.code == 429 else "MODEL_HTTP_ERROR"
            raise ServiceError(exc.code, code, f"Model service returned HTTP {exc.code}.") from exc
        except (error.URLError, TimeoutError) as exc:
            raise ServiceError(503, "MODEL_UNAVAILABLE", "Model service is unavailable.") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ServiceError(502, "MODEL_INVALID_JSON", "Model service returned invalid JSON.") from exc

        return {
            "outputText": extract_output_text(upstream),
            "metadata": {
                "responseId": upstream.get("id") if isinstance(upstream.get("id"), str) else None,
                "modelSnapshot": upstream.get("model") if isinstance(upstream.get("model"), str) else payload["model"],
                "responseStatus": upstream.get("status") if isinstance(upstream.get("status"), str) else None,
            },
        }


def build_upstream_request(payload: dict[str, Any]) -> dict[str, Any]:
    validate_model_request(payload)
    return {
        "model": payload["model"],
        "input": [
            {"role": "system", "content": payload["systemInstruction"]},
            {"role": "user", "content": payload["message"]},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": payload["schemaName"],
                "schema": payload["jsonSchema"],
            }
        },
        "store": False,
        "reasoning": {"effort": "none"},
        "temperature": 0,
    }


def validate_model_request(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ServiceError(400, "INVALID_REQUEST", "Request body must be a JSON object.")
    for key in ("model", "message", "systemInstruction", "schemaName"):
        if not isinstance(payload.get(key), str) or not payload[key]:
            raise ServiceError(400, "INVALID_REQUEST", f"{key} must be a non-empty string.")
    if not isinstance(payload.get("jsonSchema"), dict):
        raise ServiceError(400, "INVALID_REQUEST", "jsonSchema must be an object.")


def extract_output_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise ServiceError(502, "MODEL_INVALID_ENVELOPE", "Model response must be an object.")
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    output = payload.get("output")
    if output is not None and not isinstance(output, list):
        raise ServiceError(502, "MODEL_INVALID_ENVELOPE", "Model output must be an array.")
    for item in output or []:
        for content in item.get("content", []) if isinstance(item, dict) else []:
            if isinstance(content, dict) and content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    return ""


def create_server(
    host: str = "127.0.0.1",
    port: int = 8001,
    gateway: Any | None = None,
) -> ThreadingHTTPServer:
    model_gateway = gateway or DeepSeekGateway()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/health":
                self._send(200, {"status": "ok", "serviceVersion": SERVICE_VERSION})
                return
            self._send(404, error_body("NOT_FOUND", "Route not found."))

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/v1/model/responses":
                self._send(404, error_body("NOT_FOUND", "Route not found."))
                return
            try:
                payload = self._read_json()
                result = model_gateway.generate(payload)
                self._send(200, {"serviceVersion": SERVICE_VERSION, **result})
            except ServiceError as exc:
                self._send(exc.status, error_body(exc.code, str(exc)))
            except Exception:
                self._send(500, error_body("INTERNAL_ERROR", "AI service request failed."))

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ServiceError(400, "INVALID_BODY_SIZE", "Request body size is invalid.")
            try:
                return json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ServiceError(400, "INVALID_JSON", "Request body must be valid JSON.") from exc

        def _send(self, status: int, body: dict[str, Any]) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, _format: str, *_args: Any) -> None:
            # Never log patient/model request bodies through the default HTTP logger.
            return

    return ThreadingHTTPServer((host, port), Handler)


def error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}, "serviceVersion": SERVICE_VERSION}


def main() -> None:
    host = os.getenv("PYTHON_AI_SERVICE_HOST", "127.0.0.1")
    port = int(os.getenv("PYTHON_AI_SERVICE_PORT", "8001"))
    server = create_server(host, port)
    print(f"Python AI Service listening on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
