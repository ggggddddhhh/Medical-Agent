import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib import error, request

from python_knowledge_service import CORPUS_VERSION
from python_knowledge_service.app import KnowledgeService, create_server, validate_query_request
from python_knowledge_service.catalog import ApprovedKnowledgeCatalog
from python_knowledge_service.lightrag_backend import (
    LightRagBackend,
    LightRagConfig,
    LightRagRuntime,
    extract_approved_source_ids,
)


class FakeBackend:
    name = "lightrag"
    ready = True
    embedding_model = "BAAI/bge-m3"
    indexed_document_count = 5

    def __init__(self, source_ids=None, failure=None):
        self.source_ids = source_ids or []
        self.failure = failure
        self.queries = []

    def query_source_ids(self, query, limit):
        self.queries.append((query, limit))
        if self.failure:
            raise self.failure
        return self.source_ids[:limit]

    def close(self):
        return


class PythonKnowledgeServiceTest(unittest.TestCase):
    def setUp(self):
        self.catalog = ApprovedKnowledgeCatalog()
        FakeLightRag.existing_document_ids = set()

    def test_small_catalog_has_only_approved_https_sources(self):
        self.assertEqual(self.catalog.document_count, 5)
        self.assertEqual(CORPUS_VERSION, "medical-education-mini-corpus-0.2.0")
        items = self.catalog.materialize(self.catalog.source_ids, 5)
        self.assertTrue(all(item["url"].startswith("https://") for item in items))
        self.assertTrue(all("snippet" in item and item["snippet"] for item in items))

    def test_query_materializes_only_catalog_content(self):
        backend = FakeBackend(["CDC_HEART_ATTACK_2024", "MADE_UP_SOURCE"])
        result = KnowledgeService(backend, self.catalog).query(
            {"topic": "chest_pain", "intent": "health_education", "limit": 3}
        )
        self.assertEqual(result["status"], "available")
        self.assertEqual([item["sourceId"] for item in result["items"]], ["CDC_HEART_ATTACK_2024"])
        self.assertNotIn("riskLevel", json.dumps(result))
        self.assertIn("成年人胸痛", backend.queries[0][0])

    def test_no_retrieval_result_returns_no_content(self):
        result = KnowledgeService(FakeBackend(), self.catalog).query(
            {"topic": "headache", "intent": "reference_support"}
        )
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["items"], [])

    def test_health_reports_real_embedding_and_index_state(self):
        health = KnowledgeService(FakeBackend(), self.catalog).health()
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["embeddingModel"], "BAAI/bge-m3")
        self.assertEqual(health["indexedDocumentCount"], 5)
        self.assertEqual(health["documentCount"], 5)

    def test_cross_topic_retrieval_is_filtered_before_response(self):
        result = KnowledgeService(
            FakeBackend(["CDC_HEART_ATTACK_2024"]),
            self.catalog,
        ).query({"topic": "headache", "intent": "health_education"})
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["items"], [])

    def test_general_emergency_source_is_available_to_both_supported_topics(self):
        for topic in ("headache", "chest_pain"):
            with self.subTest(topic=topic):
                items = self.catalog.materialize(
                    ["NHS_EMERGENCY_HELP_2023"],
                    1,
                    topic=topic,
                )
                self.assertEqual(items[0]["sourceId"], "NHS_EMERGENCY_HELP_2023")

    def test_request_rejects_decision_and_case_state_fields(self):
        for field in ("riskLevel", "disposition", "caseState", "diagnosis"):
            with self.subTest(field=field):
                with self.assertRaises(Exception):
                    validate_query_request({"topic": "headache", field: "forbidden"})

    def test_http_backend_failure_is_explicit_and_contains_no_fabricated_knowledge(self):
        server = create_server(
            port=0,
            backend=FakeBackend(failure=RuntimeError("offline")),
            catalog=self.catalog,
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            body = json.dumps({"topic": "headache", "intent": "health_education"}).encode()
            req = request.Request(
                f"http://127.0.0.1:{server.server_port}/v1/knowledge/query",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(error.HTTPError) as caught:
                request.urlopen(req)
            self.assertEqual(caught.exception.code, 503)
            payload = json.loads(caught.exception.read())
            self.assertNotIn("items", payload)
            self.assertEqual(payload["error"]["code"], "KNOWLEDGE_BACKEND_UNAVAILABLE")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_lightrag_adapter_initializes_inserts_and_queries_context_only(self):
        FakeLightRag.instances.clear()
        with tempfile.TemporaryDirectory() as directory:
            backend = LightRagBackend(
                self.catalog,
                config=LightRagConfig(
                    working_dir=Path(directory),
                    llm_model="test-llm",
                    llm_api_key="test-key",
                    llm_base_url="https://llm.example/v1",
                    embedding_model="BAAI/bge-m3",
                    embedding_api_key="embedding-key",
                    embedding_base_url="https://embedding.example/v1",
                    embedding_dim=1024,
                    timeout_seconds=5,
                ),
                runtime=fake_runtime(),
                embedding_provider=FakeEmbeddingProvider(),
            )
            backend.start()
            try:
                result = backend.query_source_ids("头痛健康教育", 2)
                instance = FakeLightRag.instances[0]
                self.assertTrue(instance.initialized)
                self.assertEqual(len(instance.inserted_documents), 5)
                self.assertEqual(backend.indexed_document_count, 5)
                self.assertEqual(result, ["NHS_HEADACHE_2024", "CDC_STROKE_SIGNS_2026"])
                self.assertTrue(instance.query_parameters.only_need_context)
                self.assertFalse(instance.query_parameters.enable_rerank)
            finally:
                backend.close()

    def test_context_parser_ignores_unknown_and_duplicate_source_ids(self):
        context = "SOURCE_ID: UNKNOWN\nSOURCE_ID: NHS_HEADACHE_2024\nSOURCE_ID: NHS_HEADACHE_2024"
        self.assertEqual(
            extract_approved_source_ids(context, self.catalog.source_ids, 3),
            ["NHS_HEADACHE_2024"],
        )

    def test_lightrag_restart_skips_documents_already_in_the_index(self):
        document_ids, _documents = self.catalog.lightrag_documents()
        FakeLightRag.existing_document_ids = set(document_ids)
        with tempfile.TemporaryDirectory() as directory:
            backend = LightRagBackend(
                self.catalog,
                config=LightRagConfig(
                    working_dir=Path(directory),
                    llm_model="test-llm",
                    llm_api_key="test-key",
                    llm_base_url="https://llm.example/v1",
                    embedding_model="BAAI/bge-m3",
                    embedding_api_key="embedding-key",
                    embedding_base_url="https://embedding.example/v1",
                    embedding_dim=1024,
                    timeout_seconds=5,
                ),
                runtime=fake_runtime(),
                embedding_provider=FakeEmbeddingProvider(),
            )
            backend.start()
            try:
                self.assertEqual(FakeLightRag.instances[-1].inserted_documents, [])
                self.assertEqual(backend.indexed_document_count, 5)
            finally:
                backend.close()


class FakeQueryParam:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class FakeEmbeddingProvider:
    def __init__(self):
        self.calls = []

    async def embed(self, texts):
        self.calls.append(list(texts))
        return [[0.0] * 1024 for _text in texts]


class FakeLightRag:
    instances = []
    existing_document_ids = set()

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.initialized = False
        self.inserted_documents = []
        self.query_parameters = None
        FakeLightRag.instances.append(self)

    async def initialize_storages(self):
        self.initialized = True

    async def aget_docs_by_ids(self, ids):
        return {
            document_id: {"status": "processed"}
            for document_id in ids
            if document_id in self.existing_document_ids
        }

    async def ainsert(self, documents, ids):
        await self.kwargs["embedding_func"](documents)
        self.inserted_documents = list(documents)
        self.inserted_ids = list(ids)

    async def aquery(self, _query, param):
        await self.kwargs["embedding_func"]([_query])
        self.query_parameters = param
        return "SOURCE_ID: NHS_HEADACHE_2024\nSOURCE_ID: CDC_STROKE_SIGNS_2026"

    async def finalize_storages(self):
        return


async def fake_complete(*_args, **_kwargs):
    return ""


async def fake_initialize_pipeline_status():
    return


def fake_wrap_embedding(**_kwargs):
    return lambda function: function


def fake_runtime():
    return LightRagRuntime(
        light_rag=FakeLightRag,
        query_param=FakeQueryParam,
        complete=fake_complete,
        wrap_embedding=fake_wrap_embedding,
        initialize_pipeline_status=fake_initialize_pipeline_status,
    )


if __name__ == "__main__":
    unittest.main()
