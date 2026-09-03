from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from . import CORPUS_VERSION

DEFAULT_CATALOG_PATH = Path(__file__).with_name("knowledge_base.json")
ALLOWED_TOPICS = frozenset({"headache", "chest_pain"})
ALLOWED_DOCUMENT_TOPICS = ALLOWED_TOPICS | {"all"}


class CatalogError(ValueError):
    pass


class ApprovedKnowledgeCatalog:
    def __init__(self, path: Path | str = DEFAULT_CATALOG_PATH) -> None:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("corpusVersion") != CORPUS_VERSION:
            raise CatalogError("Knowledge corpus version is not supported.")
        documents = payload.get("documents")
        if not isinstance(documents, list) or not documents:
            raise CatalogError("Knowledge corpus must contain documents.")
        self._documents: dict[str, dict[str, Any]] = {}
        for document in documents:
            self._validate_document(document)
            source_id = document["sourceId"]
            if source_id in self._documents:
                raise CatalogError(f"Duplicate sourceId: {source_id}")
            self._documents[source_id] = document

    @property
    def document_count(self) -> int:
        return len(self._documents)

    @property
    def source_ids(self) -> tuple[str, ...]:
        return tuple(self._documents)

    def lightrag_documents(self) -> tuple[list[str], list[str]]:
        ids: list[str] = []
        texts: list[str] = []
        for source_id, document in self._documents.items():
            ids.append(f"medical-source-{source_id.lower()}")
            texts.append(
                "\n".join(
                    [
                        f"SOURCE_ID: {source_id}",
                        f"TOPIC: {document['topic']}",
                        f"TITLE: {document['title']}",
                        f"KEYWORDS: {', '.join(document['keywords'])}",
                        f"APPROVED_HEALTH_EDUCATION: {document['snippet']}",
                    ]
                )
            )
        return ids, texts

    def materialize(
        self,
        source_ids: Iterable[str],
        limit: int,
        topic: str | None = None,
    ) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        for source_id in source_ids:
            document = self._documents.get(source_id)
            if (
                not document
                or (
                    topic is not None
                    and document["topic"] not in {topic, "all"}
                )
                or any(item["sourceId"] == source_id for item in result)
            ):
                continue
            result.append(
                {
                    "sourceId": source_id,
                    "title": document["title"],
                    "url": document["url"],
                    "reviewedAt": document["reviewedAt"],
                    "snippet": document["snippet"],
                }
            )
            if len(result) >= limit:
                break
        return result

    @staticmethod
    def _validate_document(document: Any) -> None:
        if not isinstance(document, dict):
            raise CatalogError("Knowledge document must be an object.")
        for key in ("sourceId", "topic", "title", "url", "reviewedAt", "snippet"):
            if not isinstance(document.get(key), str) or not document[key].strip():
                raise CatalogError(f"Knowledge document requires {key}.")
        if document["topic"] not in ALLOWED_DOCUMENT_TOPICS:
            raise CatalogError("Knowledge document topic is not supported.")
        parsed = urlparse(document["url"])
        if parsed.scheme != "https" or not parsed.netloc:
            raise CatalogError("Knowledge source URL must use HTTPS.")
        if not isinstance(document.get("keywords"), list) or not all(
            isinstance(item, str) and item for item in document["keywords"]
        ):
            raise CatalogError("Knowledge document keywords must be non-empty strings.")
