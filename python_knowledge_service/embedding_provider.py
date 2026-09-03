from __future__ import annotations

import asyncio
import json
import math
from dataclasses import dataclass
from typing import Any
from urllib import error, request
from urllib.parse import urlparse

BGE_M3_MODEL = "BAAI/bge-m3"
BGE_M3_DIMENSION = 1024
BGE_M3_MAX_TOKENS = 8192
MAX_EMBEDDING_RESPONSE_BYTES = 16 * 1024 * 1024


class EmbeddingConfigurationError(RuntimeError):
    pass


class EmbeddingProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class OpenAIEmbeddingConfig:
    base_url: str
    api_key: str
    model: str = BGE_M3_MODEL
    dimension: int = BGE_M3_DIMENSION
    max_tokens: int = BGE_M3_MAX_TOKENS
    timeout_seconds: float = 45.0

    @classmethod
    def from_env(cls) -> "OpenAIEmbeddingConfig":
        import os

        return cls(
            base_url=(
                os.getenv("EMBEDDING_BASE_URL")
                or os.getenv("LIGHTRAG_EMBEDDING_BASE_URL", "")
            ),
            api_key=(
                os.getenv("EMBEDDING_API_KEY")
                or os.getenv("LIGHTRAG_EMBEDDING_API_KEY", "")
            ),
            model=(
                os.getenv("EMBEDDING_MODEL")
                or os.getenv("LIGHTRAG_EMBEDDING_MODEL", BGE_M3_MODEL)
            ),
            dimension=int(os.getenv("LIGHTRAG_EMBEDDING_DIM", str(BGE_M3_DIMENSION))),
            max_tokens=int(
                os.getenv("LIGHTRAG_EMBEDDING_MAX_TOKENS", str(BGE_M3_MAX_TOKENS))
            ),
            timeout_seconds=float(os.getenv("LIGHTRAG_TIMEOUT_SECONDS", "45")),
        )

    def validate(self) -> None:
        missing = [
            name
            for name, value in (
                ("EMBEDDING_BASE_URL", self.base_url),
                ("EMBEDDING_API_KEY", self.api_key),
                ("EMBEDDING_MODEL", self.model),
            )
            if not value
        ]
        if missing:
            raise EmbeddingConfigurationError(
                "Missing embedding configuration: " + ", ".join(missing)
            )
        parsed = urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise EmbeddingConfigurationError("EMBEDDING_BASE_URL must be an HTTP(S) URL.")
        if self.model != BGE_M3_MODEL:
            raise EmbeddingConfigurationError("EMBEDDING_MODEL must be BAAI/bge-m3.")
        if self.dimension != BGE_M3_DIMENSION or self.max_tokens != BGE_M3_MAX_TOKENS:
            raise EmbeddingConfigurationError(
                "BAAI/bge-m3 must use dimension 1024 and max tokens 8192."
            )

    @property
    def endpoint(self) -> str:
        base = self.base_url.rstrip("/")
        return base if base.endswith("/embeddings") else f"{base}/embeddings"


class OpenAICompatibleEmbeddingProvider:
    def __init__(self, config: OpenAIEmbeddingConfig | None = None) -> None:
        self.config = config or OpenAIEmbeddingConfig.from_env()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.config.validate()
        if not isinstance(texts, list) or not texts or not all(
            isinstance(text, str) and text.strip() for text in texts
        ):
            raise EmbeddingProviderError("INVALID_EMBEDDING_INPUT")
        return await asyncio.to_thread(self._embed_sync, texts)

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        body = json.dumps(
            {"model": self.config.model, "input": texts},
            ensure_ascii=False,
        ).encode("utf-8")
        req = request.Request(
            self.config.endpoint,
            data=body,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.config.timeout_seconds) as response:
                raw = response.read(MAX_EMBEDDING_RESPONSE_BYTES + 1)
        except error.HTTPError as exc:
            raise EmbeddingProviderError(f"EMBEDDING_HTTP_{exc.code}") from exc
        except (error.URLError, TimeoutError, OSError) as exc:
            raise EmbeddingProviderError("EMBEDDING_UNAVAILABLE") from exc
        if len(raw) > MAX_EMBEDDING_RESPONSE_BYTES:
            raise EmbeddingProviderError("EMBEDDING_RESPONSE_TOO_LARGE")
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise EmbeddingProviderError("INVALID_EMBEDDING_JSON") from exc
        return validate_embedding_response(payload, len(texts), self.config.dimension)


def validate_embedding_response(
    payload: Any,
    expected_count: int,
    expected_dimension: int,
) -> list[list[float]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise EmbeddingProviderError("INVALID_EMBEDDING_RESPONSE")
    indexed: dict[int, list[float]] = {}
    for item in payload["data"]:
        if not isinstance(item, dict) or not isinstance(item.get("index"), int):
            raise EmbeddingProviderError("INVALID_EMBEDDING_RESPONSE")
        vector = item.get("embedding")
        if (
            not isinstance(vector, list)
            or len(vector) != expected_dimension
            or not all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                for value in vector
            )
        ):
            raise EmbeddingProviderError("INVALID_EMBEDDING_DIMENSION")
        index = item["index"]
        if index in indexed or not 0 <= index < expected_count:
            raise EmbeddingProviderError("INVALID_EMBEDDING_INDEX")
        indexed[index] = [float(value) for value in vector]
    if set(indexed) != set(range(expected_count)):
        raise EmbeddingProviderError("INVALID_EMBEDDING_COUNT")
    return [indexed[index] for index in range(expected_count)]
