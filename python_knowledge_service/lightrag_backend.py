from __future__ import annotations

import asyncio
import os
import re
import threading
from concurrent.futures import Future, TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Coroutine

import numpy as np

from .catalog import ApprovedKnowledgeCatalog
from .embedding_provider import (
    BGE_M3_MODEL,
    OpenAICompatibleEmbeddingProvider,
    OpenAIEmbeddingConfig,
)

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
    startup_timeout_seconds: float = 600.0

    @classmethod
    def from_env(cls) -> "LightRagConfig":
        embedding = OpenAIEmbeddingConfig.from_env()
        return cls(
            working_dir=Path(os.getenv("LIGHTRAG_WORKING_DIR", "runtime/lightrag")),
            llm_model=os.getenv("LIGHTRAG_LLM_MODEL", "deepseek-v4-flash"),
            llm_api_key=os.getenv("LIGHTRAG_LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY", ""),
            llm_base_url=(
                os.getenv("LIGHTRAG_LLM_BASE_URL")
                or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
            ),
            embedding_model=embedding.model,
            embedding_api_key=embedding.api_key,
            embedding_base_url=embedding.base_url,
            embedding_dim=embedding.dimension,
            embedding_max_tokens=embedding.max_tokens,
            query_mode=os.getenv("LIGHTRAG_QUERY_MODE", "hybrid"),
            timeout_seconds=float(os.getenv("LIGHTRAG_TIMEOUT_SECONDS", "45")),
            startup_timeout_seconds=float(
                os.getenv("LIGHTRAG_STARTUP_TIMEOUT_SECONDS", "600")
            ),
        )

    def validate(self) -> None:
        missing = [
            name
            for name, value in (
                ("LIGHTRAG_LLM_API_KEY", self.llm_api_key),
                ("EMBEDDING_API_KEY", self.embedding_api_key),
                ("EMBEDDING_BASE_URL", self.embedding_base_url),
            )
            if not value
        ]
        if missing:
            raise LightRagConfigurationError(
                "Missing LightRAG configuration: " + ", ".join(missing)
            )
        if self.query_mode not in {"local", "global", "hybrid", "mix", "naive"}:
            raise LightRagConfigurationError("LIGHTRAG_QUERY_MODE is not supported.")
        try:
            OpenAIEmbeddingConfig(
                base_url=self.embedding_base_url,
                api_key=self.embedding_api_key,
                model=self.embedding_model,
                dimension=self.embedding_dim,
                max_tokens=self.embedding_max_tokens,
                timeout_seconds=self.timeout_seconds,
            ).validate()
        except Exception as exc:
            raise LightRagConfigurationError(str(exc)) from exc


@dataclass(frozen=True)
class LightRagRuntime:
    light_rag: Any
    query_param: Any
    complete: Any
    wrap_embedding: Any
    initialize_pipeline_status: Any


def load_lightrag_runtime() -> LightRagRuntime:
    try:
        from lightrag import LightRAG, QueryParam
        from lightrag.kg.shared_storage import initialize_pipeline_status
        from lightrag.llm.openai import openai_complete_if_cache
        from lightrag.utils import wrap_embedding_func_with_attrs
    except ImportError as exc:
        raise LightRagConfigurationError(
            "LightRAG is not installed; install python_knowledge_service/requirements.txt."
        ) from exc
    return LightRagRuntime(
        light_rag=LightRAG,
        query_param=QueryParam,
        complete=openai_complete_if_cache,
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
        try:
            return future.result(timeout=timeout)
        except FutureTimeoutError:
            future.cancel()
            raise

    def close(self) -> None:
        try:
            self.run(self._cancel_pending_tasks(), 5)
        except Exception:
            pass
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=2)
        self.loop.close()

    @staticmethod
    async def _cancel_pending_tasks() -> None:
        current = asyncio.current_task()
        tasks = [task for task in asyncio.all_tasks() if task is not current]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


class LightRagBackend:
    name = "lightrag"

    def __init__(
        self,
        catalog: ApprovedKnowledgeCatalog,
        config: LightRagConfig | None = None,
        runtime: LightRagRuntime | None = None,
        embedding_provider: OpenAICompatibleEmbeddingProvider | None = None,
    ) -> None:
        self.catalog = catalog
        self.config = config or LightRagConfig.from_env()
        self.runtime = runtime
        self.embedding_provider = embedding_provider or OpenAICompatibleEmbeddingProvider(
            OpenAIEmbeddingConfig(
                base_url=self.config.embedding_base_url,
                api_key=self.config.embedding_api_key,
                model=self.config.embedding_model,
                dimension=self.config.embedding_dim,
                max_tokens=self.config.embedding_max_tokens,
                timeout_seconds=self.config.timeout_seconds,
            )
        )
        self.worker: AsyncLoopWorker | None = None
        self.rag: Any | None = None
        self.ready = False
        self.embedding_model = self.config.embedding_model
        self.indexed_document_count = 0

    def start(self) -> None:
        if self.ready:
            return
        self.config.validate()
        self.config.working_dir.mkdir(parents=True, exist_ok=True)
        self.runtime = self.runtime or load_lightrag_runtime()
        self.worker = AsyncLoopWorker()
        try:
            self.worker.run(
                self.embedding_provider.embed(["medical knowledge retrieval readiness"]),
                self.config.timeout_seconds,
            )
            self.worker.run(self._initialize(), self.config.startup_timeout_seconds)
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
                self.worker.run(self._finalize(), self.config.timeout_seconds)
            except Exception:
                pass
        if self.worker:
            self.worker.close()
        self.worker = None
        self.rag = None
        self.ready = False

    async def _finalize(self) -> None:
        assert self.rag is not None
        wrappers = []
        embedding_func = getattr(self.rag, "embedding_func", None)
        if embedding_func is not None:
            wrappers.append(getattr(embedding_func, "func", None))
        for state in (getattr(self.rag, "_role_llm_states", None) or {}).values():
            wrappers.append(getattr(state, "wrapped", None))
        rerank = getattr(self.rag, "rerank_model_func", None)
        if rerank is not None:
            wrappers.append(rerank)
        seen = set()
        for wrapper in wrappers:
            if wrapper is None or id(wrapper) in seen:
                continue
            seen.add(id(wrapper))
            shutdown = getattr(wrapper, "shutdown", None)
            if callable(shutdown):
                await shutdown(graceful=True, timeout=5)
        await self.rag.finalize_storages()

    async def _initialize(self) -> None:
        assert self.runtime is not None

        @self.runtime.wrap_embedding(
            embedding_dim=self.config.embedding_dim,
            max_token_size=self.config.embedding_max_tokens,
            model_name=self.config.embedding_model,
        )
        async def embedding_func(texts: list[str]) -> Any:
            vectors = await self.embedding_provider.embed(texts)
            return np.asarray(vectors, dtype=np.float32)

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
        existing = await self.rag.aget_docs_by_ids(ids)
        missing = [
            (document_id, document)
            for document_id, document in zip(ids, documents, strict=True)
            if document_id not in existing
        ]
        if missing:
            await self.rag.ainsert(
                [document for _document_id, document in missing],
                ids=[document_id for document_id, _document in missing],
            )
        self.indexed_document_count = len(documents)

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
    embedding_model = BGE_M3_MODEL
    indexed_document_count = 0

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
