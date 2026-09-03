from __future__ import annotations

import asyncio
import os
import re
import threading
from concurrent.futures import Future
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Coroutine

from .catalog import ApprovedKnowledgeCatalog

SOURCE_ID_PATTERN = re.compile(r"SOURCE_ID\s*:\s*([A-Z0-9_]+)")


class LightRagConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class LightRagConfig:
    working_dir: Path
    llm_model: str
    llm_api_key: str
    llm_base_url: str
    embedding_model: str
    embedding_api_key: str
    embedding_base_url: str
    embedding_dim: int
    embedding_max_tokens: int = 8192
    query_mode: str = "hybrid"
    timeout_seconds: float = 45.0

    @classmethod
    def from_env(cls) -> "LightRagConfig":
        return cls(
            working_dir=Path(os.getenv("LIGHTRAG_WORKING_DIR", "runtime/lightrag")),
            llm_model=os.getenv("LIGHTRAG_LLM_MODEL", "deepseek-v4-flash"),
            llm_api_key=os.getenv("LIGHTRAG_LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY", ""),
            llm_base_url=(
                os.getenv("LIGHTRAG_LLM_BASE_URL")
                or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
            ),
            embedding_model=os.getenv("LIGHTRAG_EMBEDDING_MODEL", "BAAI/bge-m3"),
            embedding_api_key=os.getenv("LIGHTRAG_EMBEDDING_API_KEY", ""),
            embedding_base_url=os.getenv("LIGHTRAG_EMBEDDING_BASE_URL", ""),
            embedding_dim=int(os.getenv("LIGHTRAG_EMBEDDING_DIM", "1024")),
            embedding_max_tokens=int(os.getenv("LIGHTRAG_EMBEDDING_MAX_TOKENS", "8192")),
            query_mode=os.getenv("LIGHTRAG_QUERY_MODE", "hybrid"),
            timeout_seconds=float(os.getenv("LIGHTRAG_TIMEOUT_SECONDS", "45")),
        )

    def validate(self) -> None:
        missing = [
            name
            for name, value in (
                ("LIGHTRAG_LLM_API_KEY", self.llm_api_key),
                ("LIGHTRAG_EMBEDDING_API_KEY", self.embedding_api_key),
                ("LIGHTRAG_EMBEDDING_BASE_URL", self.embedding_base_url),
            )
            if not value
        ]
        if missing:
            raise LightRagConfigurationError(
                "Missing LightRAG configuration: " + ", ".join(missing)
            )
        if self.query_mode not in {"local", "global", "hybrid", "mix", "naive"}:
            raise LightRagConfigurationError("LIGHTRAG_QUERY_MODE is not supported.")
        if self.embedding_model != "BAAI/bge-m3" or self.embedding_dim != 1024:
            raise LightRagConfigurationError(
                "Embedding must use BAAI/bge-m3 with dimension 1024."
            )


@dataclass(frozen=True)
class LightRagRuntime:
    light_rag: Any
    query_param: Any
    complete: Any
    embed: Any
    wrap_embedding: Any
    initialize_pipeline_status: Any


def load_lightrag_runtime() -> LightRagRuntime:
    try:
        from lightrag import LightRAG, QueryParam
        from lightrag.kg.shared_storage import initialize_pipeline_status
        from lightrag.llm.openai import openai_complete_if_cache, openai_embed
        from lightrag.utils import wrap_embedding_func_with_attrs
    except ImportError as exc:
        raise LightRagConfigurationError(
            "LightRAG is not installed; install python_knowledge_service/requirements.txt."
        ) from exc
    return LightRagRuntime(
        light_rag=LightRAG,
        query_param=QueryParam,
        complete=openai_complete_if_cache,
        embed=openai_embed,
        wrap_embedding=wrap_embedding_func_with_attrs,
        initialize_pipeline_status=initialize_pipeline_status,
    )


class AsyncLoopWorker:
    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()

    def run(self, coroutine: Coroutine[Any, Any, Any], timeout: float) -> Any:
        future: Future[Any] = asyncio.run_coroutine_threadsafe(coroutine, self.loop)
        return future.result(timeout=timeout)

    def close(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=2)
        self.loop.close()


class LightRagBackend:
    name = "lightrag"

    def __init__(
        self,
        catalog: ApprovedKnowledgeCatalog,
        config: LightRagConfig | None = None,
        runtime: LightRagRuntime | None = None,
    ) -> None:
        self.catalog = catalog
        self.config = config or LightRagConfig.from_env()
        self.runtime = runtime
        self.worker: AsyncLoopWorker | None = None
        self.rag: Any | None = None
        self.ready = False

    def start(self) -> None:
        if self.ready:
            return
        self.config.validate()
        self.config.working_dir.mkdir(parents=True, exist_ok=True)
        self.runtime = self.runtime or load_lightrag_runtime()
        self.worker = AsyncLoopWorker()
        try:
            self.worker.run(self._initialize(), self.config.timeout_seconds)
            self.ready = True
        except Exception:
            self.close()
            raise

    def query_source_ids(self, query: str, limit: int) -> list[str]:
        if not self.ready or not self.worker:
            raise RuntimeError("LightRAG backend is not ready.")
        context = self.worker.run(
            self._query_context(query, limit),
            self.config.timeout_seconds,
        )
        return extract_approved_source_ids(context, self.catalog.source_ids, limit)

    def close(self) -> None:
        if self.worker and self.rag:
            try:
                self.worker.run(self.rag.finalize_storages(), self.config.timeout_seconds)
            except Exception:
                pass
        if self.worker:
            self.worker.close()
        self.worker = None
        self.rag = None
        self.ready = False

    async def _initialize(self) -> None:
        assert self.runtime is not None

        @self.runtime.wrap_embedding(
            embedding_dim=self.config.embedding_dim,
            max_token_size=self.config.embedding_max_tokens,
            model_name=self.config.embedding_model,
        )
        async def embedding_func(texts: list[str]) -> Any:
            return await self.runtime.embed.func(
                texts,
                model=self.config.embedding_model,
                api_key=self.config.embedding_api_key,
                base_url=self.config.embedding_base_url,
            )

        async def llm_model_func(
            prompt: str,
            system_prompt: str | None = None,
            history_messages: list[dict[str, str]] | None = None,
            **kwargs: Any,
        ) -> str:
            return await self.runtime.complete(
                self.config.llm_model,
                prompt,
                system_prompt=system_prompt,
                history_messages=history_messages or [],
                api_key=self.config.llm_api_key,
                base_url=self.config.llm_base_url,
                **kwargs,
            )

        self.rag = self.runtime.light_rag(
            working_dir=str(self.config.working_dir),
            workspace="medical_agent_phase3",
            llm_model_func=llm_model_func,
            llm_model_name=self.config.llm_model,
            embedding_func=embedding_func,
            addon_params={"language": "Chinese"},
        )
        await self.rag.initialize_storages()
        await self.runtime.initialize_pipeline_status()
        ids, documents = self.catalog.lightrag_documents()
        await self.rag.ainsert(documents, ids=ids)

    async def _query_context(self, query: str, limit: int) -> Any:
        assert self.runtime is not None and self.rag is not None
        parameters = self.runtime.query_param(
            mode=self.config.query_mode,
            only_need_context=True,
            top_k=max(4, limit * 2),
            chunk_top_k=max(4, limit * 2),
            enable_rerank=False,
        )
        return await self.rag.aquery(query, param=parameters)


class UnavailableKnowledgeBackend:
    name = "lightrag"
    ready = False

    def __init__(self, reason: str) -> None:
        self.reason = reason

    def start(self) -> None:
        return

    def query_source_ids(self, _query: str, _limit: int) -> list[str]:
        raise RuntimeError(self.reason)

    def close(self) -> None:
        return


def create_backend_from_env(catalog: ApprovedKnowledgeCatalog) -> Any:
    if os.getenv("LIGHTRAG_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        return UnavailableKnowledgeBackend("LightRAG is disabled.")
    try:
        config = LightRagConfig.from_env()
        config.validate()
        backend = LightRagBackend(catalog, config=config)
        backend.start()
        return backend
    except Exception as exc:
        return UnavailableKnowledgeBackend(str(exc))


def extract_approved_source_ids(
    context: Any,
    approved_source_ids: tuple[str, ...],
    limit: int,
) -> list[str]:
    text = context if isinstance(context, str) else repr(context)
    approved = set(approved_source_ids)
    result: list[str] = []
    for match in SOURCE_ID_PATTERN.finditer(text):
        source_id = match.group(1)
        if source_id in approved and source_id not in result:
            result.append(source_id)
        if len(result) >= limit:
            break
    return result
