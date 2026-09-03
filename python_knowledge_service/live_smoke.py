from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path

from .app import KnowledgeService, create_server
from .catalog import ApprovedKnowledgeCatalog
from .lightrag_backend import LightRagBackend, LightRagConfig


def main() -> None:
    catalog = ApprovedKnowledgeCatalog()
    config = LightRagConfig.from_env()
    backend = LightRagBackend(catalog, config=config)
    backend.start()
    server = None
    server_thread = None
    try:
        service = KnowledgeService(backend, catalog)
        queries = {}
        for topic in ("headache", "chest_pain"):
            result = service.query(
                {"topic": topic, "intent": "health_education", "limit": 3}
            )
            if result["status"] != "available" or not result["items"]:
                raise RuntimeError(f"No approved context returned for {topic}.")
            queries[topic] = [item["sourceId"] for item in result["items"]]

        server = create_server("127.0.0.1", 0, backend=backend, catalog=catalog)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        integration = run_node_integration(server.server_address[1])
        print(
            json.dumps(
                {
                    "status": "passed",
                    "embeddingModel": config.embedding_model,
                    "embeddingDimension": config.embedding_dim,
                    "indexedDocumentCount": catalog.document_count,
                    "queries": queries,
                    "agentIntegration": integration,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
            if server_thread is not None:
                server_thread.join(timeout=5)
        else:
            backend.close()


def run_node_integration(port: int) -> dict[str, object]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for the Phase 3.1 integration smoke test.")
    script = Path(__file__).resolve().parents[1] / "scripts" / "run-phase3-agent-rag-client-smoke.js"
    env = os.environ.copy()
    env["PYTHON_KNOWLEDGE_SERVICE_URL"] = f"http://127.0.0.1:{port}"
    completed = subprocess.run(
        [node, str(script)],
        cwd=script.parents[1],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        details = (completed.stderr or completed.stdout).strip()[-2_000:]
        raise RuntimeError(f"Node.js Agent-to-RAG integration failed: {details}")
    try:
        return json.loads(completed.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RuntimeError("Node.js integration returned invalid JSON.") from exc


if __name__ == "__main__":
    main()
