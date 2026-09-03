import asyncio
import json
import os
import threading
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from python_knowledge_service.embedding_provider import (
    BGE_M3_DIMENSION,
    BGE_M3_MAX_TOKENS,
    BGE_M3_MODEL,
    EmbeddingProviderError,
    OpenAICompatibleEmbeddingProvider,
    OpenAIEmbeddingConfig,
)


class EmbeddingProviderTest(unittest.TestCase):
    def test_canonical_environment_configures_bge_m3(self):
        with patch.dict(
            os.environ,
            {
                "EMBEDDING_BASE_URL": "https://embedding.example/v1",
                "EMBEDDING_API_KEY": "secret",
                "EMBEDDING_MODEL": BGE_M3_MODEL,
            },
            clear=True,
        ):
            config = OpenAIEmbeddingConfig.from_env()
        config.validate()
        self.assertEqual(config.endpoint, "https://embedding.example/v1/embeddings")
        self.assertEqual(config.dimension, BGE_M3_DIMENSION)
        self.assertEqual(config.max_tokens, BGE_M3_MAX_TOKENS)

    def test_openai_compatible_request_returns_ordered_1024_vectors(self):
        with embedding_server() as server:
            provider = provider_for(server)
            vectors = asyncio.run(provider.embed(["first", "second"]))
        self.assertEqual(len(vectors), 2)
        self.assertEqual(len(vectors[0]), BGE_M3_DIMENSION)
        self.assertEqual(vectors[0][0], 1.0)
        self.assertEqual(vectors[1][0], 2.0)
        self.assertEqual(server.received[0]["path"], "/v1/embeddings")
        self.assertEqual(server.received[0]["model"], BGE_M3_MODEL)
        self.assertEqual(server.received[0]["authorization"], "Bearer test-key")

    def test_unavailable_embedding_api_fails_closed(self):
        with embedding_server(status=503) as server:
            with self.assertRaisesRegex(EmbeddingProviderError, "EMBEDDING_HTTP_503"):
                asyncio.run(provider_for(server).embed(["probe"]))

    def test_wrong_embedding_dimension_is_rejected(self):
        with embedding_server(dimension=12) as server:
            with self.assertRaisesRegex(
                EmbeddingProviderError,
                "INVALID_EMBEDDING_DIMENSION",
            ):
                asyncio.run(provider_for(server).embed(["probe"]))


def provider_for(server):
    return OpenAICompatibleEmbeddingProvider(
        OpenAIEmbeddingConfig(
            base_url=f"http://127.0.0.1:{server.server_port}/v1",
            api_key="test-key",
            model=BGE_M3_MODEL,
            timeout_seconds=2,
        )
    )


@contextmanager
def embedding_server(status=200, dimension=BGE_M3_DIMENSION):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            self.server.received.append(
                {
                    "path": self.path,
                    "model": payload.get("model"),
                    "authorization": self.headers.get("Authorization"),
                }
            )
            if self.server.response_status != 200:
                self.send_response(self.server.response_status)
                self.end_headers()
                return
            inputs = payload.get("input", [])
            data = [
                {
                    "object": "embedding",
                    "index": index,
                    "embedding": [float(index + 1)] + [0.0] * (self.server.dimension - 1),
                }
                for index, _text in reversed(list(enumerate(inputs)))
            ]
            body = json.dumps({"object": "list", "data": data}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format, *_args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.response_status = status
    server.dimension = dimension
    server.received = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
