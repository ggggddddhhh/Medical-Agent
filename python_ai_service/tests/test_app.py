import json
import threading
import unittest
from urllib import error, request

from python_ai_service.app import (
    ServiceError,
    build_upstream_request,
    create_server,
    extract_output_text,
)


class FakeGateway:
    def __init__(self):
        self.payloads = []

    def generate(self, payload):
        self.payloads.append(payload)
        return {
            "outputText": '{"ok":true}',
            "metadata": {"responseId": "resp-1", "modelSnapshot": payload["model"], "responseStatus": "completed"},
        }


class PythonAiServiceTest(unittest.TestCase):
    def test_builds_responses_api_request_without_owning_clinical_policy(self):
        body = build_upstream_request(model_payload())
        self.assertEqual(body["model"], "deepseek-v4-flash")
        self.assertEqual(body["input"][0]["content"], "node-owned-instruction")
        self.assertEqual(body["text"]["format"]["schema"], {"type": "object"})
        self.assertFalse(body["store"])
        self.assertNotIn("disposition", body)

    def test_extracts_both_supported_responses_shapes(self):
        self.assertEqual(extract_output_text({"output_text": "one"}), "one")
        self.assertEqual(extract_output_text({"output": [{"content": [{"type": "output_text", "text": "two"}]}]}), "two")
        with self.assertRaises(ServiceError):
            extract_output_text({"output": {}})

    def test_http_health_and_model_gateway_contract(self):
        gateway = FakeGateway()
        server = create_server(port=0, gateway=gateway)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with request.urlopen(f"{base}/health") as response:
                self.assertEqual(json.load(response)["status"], "ok")
            req = request.Request(
                f"{base}/v1/model/responses",
                data=json.dumps(model_payload()).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with request.urlopen(req) as response:
                payload = json.load(response)
            self.assertEqual(payload["outputText"], '{"ok":true}')
            self.assertEqual(len(gateway.payloads), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_http_rejects_invalid_request(self):
        server = create_server(port=0, gateway=FakeGateway())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            req = request.Request(
                f"http://127.0.0.1:{server.server_port}/v1/model/responses",
                data=b"not-json",
                method="POST",
            )
            with self.assertRaises(error.HTTPError) as caught:
                request.urlopen(req)
            self.assertEqual(caught.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def model_payload():
    return {
        "model": "deepseek-v4-flash",
        "message": "test",
        "systemInstruction": "node-owned-instruction",
        "jsonSchema": {"type": "object"},
        "schemaName": "test_schema",
    }


if __name__ == "__main__":
    unittest.main()
