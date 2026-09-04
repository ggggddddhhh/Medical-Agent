# Medical-Agent

> **Safety-Constrained Multi-turn Medical AI Agent**

[![Release](https://img.shields.io/github/v/release/ggggddddhhh/Medical-Agent?include_prereleases&label=release)](https://github.com/ggggddddhhh/Medical-Agent/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Research Prototype](https://img.shields.io/badge/status-research%20prototype-orange.svg)](#limitations)

Medical-Agent is a **research prototype** for building verifiable, safety-constrained medical assistants. It focuses on helping users understand the appropriate **next action** through structured evidence extraction, conservative risk routing, multi-turn clarification, persistent session memory, and read-only medical knowledge support.

The project combines:

- **LangGraph.js Agent Orchestration** for workflow and state-flow management;
- an independent **Safety Core** as the only source of risk decisions;
- **Multi-turn Memory** for session recovery and duplicate-question prevention;
- **LightRAG Knowledge Support** for optional, source-backed health education;
- a **React Demo UI** for inspecting the agent's state, trace, and safety boundaries.

> [!WARNING]
> This project is not a medical device and does not provide diagnosis, prescriptions, or individualized treatment. It cannot replace a clinician or emergency service. If emergency symptoms are present, contact local emergency services immediately.

![Medical-Agent React Demo](docs/images/react-web-demo.png)

## Overview（项目定位）

Medical conversations are often incomplete, ambiguous, and multi-turn. A generic language model can lose track of what the user actually said, repeat questions, confuse another person's symptoms with the user's symptoms, or produce an answer that is more confident than the evidence supports.

Medical-Agent explores an alternative architecture:

1. Locate evidence in the user's original text.
2. Interpret linguistic attributes such as subject, polarity, certainty, and temporality.
3. Map supported evidence to the existing clinical facts and pathway state.
4. Let the Semantic Gate and Safety Core make conservative, deterministic routing decisions.
5. Use LangGraph and Memory to plan the next turn without changing the risk decision.
6. Optionally attach read-only knowledge context through the Python LightRAG service.

The current MVP is limited to adult-oriented HEADACHE_V1 and CHEST_PAIN_V1 pathways. It is intended for architecture research, safety evaluation, and competition demonstration—not clinical deployment or real patient data processing.

## Architecture

### Logical view

~~~mermaid
flowchart TB
    U[User] --> UI[React Demo UI]
    UI --> LG[LangGraph.js Orchestrator]
    LG --> SC[Safety Core]
    SC --> ML[Memory Layer]
    ML --> RAG[LightRAG Knowledge Support]
~~~

This is a product-level view of the main collaboration path. In the implementation, Memory is a persistence and planning aid, while LightRAG is an optional read-only support service. Neither can override the Safety Core.

### Runtime components

~~~mermaid
flowchart LR
    U[User] --> UI[React + Vite Demo]
    UI --> API[Node.js Demo API]
    API --> LG[LangGraph Orchestrator]
    LG --> EX[Semantic Extraction]
    EX --> SG[Semantic Gate]
    SG --> CS[CaseState]
    CS --> SC[Safety Core]
    SC --> CP[Clinical Pathway]
    CP --> QP[Question Planner]
    QP --> RL[Response Layer]
    RL --> UI

    LG <--> MEM[Session + Fact Memory]
    MEM --> CK[runtime checkpoints]
    RL -. optional knowledge context .-> KR[Python LightRAG Service]
    KR --> EMB[BAAI/bge-m3 Embedding API]
    EX -. model-assisted extraction .-> AI[Python AI Service]
~~~

The Node.js Agent Core owns CaseState, Semantic Gate, Clinical Pathway, Safety Core, risk disposition, Decision Trace, and Response Layer. Python services are isolated behind HTTP APIs: the AI service supports extraction, and LightRAG supplies knowledge context only.

See [architecture.md](docs/architecture.md) for component boundaries and [phase-5-memory-layer.md](docs/phase-5-memory-layer.md) for session and fact memory details.

## Key Features

| Capability | What it provides |
| --- | --- |
| **Evidence-grounded extraction** | Requires evidence from the user's original words before a fact can be accepted. |
| **Linguistic assertion analysis** | Tracks subject, negation, certainty, temporality, quotation, hypotheticals, and corrections. |
| **Conservative Semantic Gate** | Routes facts through ACCEPT, UNCERTAIN, or REJECT without allowing unsupported upgrades. |
| **Safety Core** | Produces the final risk decision and prioritizes red-flag routing. |
| **LangGraph orchestration** | Coordinates state flow, checkpoint recovery, fact reconciliation, and question planning. |
| **Multi-turn memory** | Restores sessions and retains confirmed facts, answered fields, pending questions, and decision trace. |
| **Duplicate-question prevention** | Filters already answered fields before planning the next clarification. |
| **Response Layer** | Converts structured decisions into constrained, user-readable safety responses. |
| **LightRAG support** | Adds optional medical education context and sources without participating in risk decisions. |
| **React demo** | Visualizes the conversation, risk level, CaseState, Safety Core, Semantic Gate, memory, trace, and sources. |

The legacy orchestrator remains available as a fallback. Configure AGENT_ORCHESTRATOR=legacy, shadow, or langgraph; the default is langgraph.

## Safety Design

Safety boundaries are explicit and testable:

- **LangGraph only orchestrates.** It manages workflow transitions, checkpointing, and planner state; it cannot decide or rewrite clinical risk.
- **Safety Core is the sole risk authority.** riskLevel, disposition, red-flag routing, and final safety decisions remain in the Node.js core.
- **Semantic Gate controls fact admission.** Unsupported, ambiguous, contradicted, quoted, hypothetical, or incorrectly attributed facts must not be silently accepted.
- **Clarification is safer than guessing.** Missing high-risk information enters UNCERTAIN and triggers a targeted question rather than an unsupported ACCEPT or REJECT.
- **RAG is read-only.** LightRAG provides explanation material and sources; it cannot modify CaseState, risk level, pathway outcome, or Safety Core results.
- **Failures degrade safely.** AI, embedding, checkpoint, planner, or RAG failures preserve the deterministic safety response and can fall back to Legacy orchestration.
- **Decision Trace is auditable.** The system records structured events and evidence references, not hidden chain-of-thought.

## Demo（Demo 展示）

The React demo is designed for an evaluator to see the complete loop in one screen:

- **Three-column layout:** case selection and session history on the left, conversation in the center, and Agent status plus Memory/Trace panels on the right;
- **Multi-turn clarification:** the agent asks for missing information, updates the same session, and reevaluates safety after the user's reply;
- **Memory recovery:** session ID, confirmed facts, answered fields, pending question, and CaseState snapshots can be restored;
- **RAG transparency:** the UI shows whether knowledge support was called and which sources were returned;
- **Safety visibility:** risk level, Semantic Gate result, Safety Core status, and fallback state remain inspectable.

| Demo case | Expected routing | Knowledge behavior |
| --- | --- | --- |
| Ordinary headache | SELF_MONITOR after appropriate clarification | Optional headache education |
| Ambiguous chest pain | URGENT_SAME_DAY or clarification while information is incomplete | Optional chest-pain education |
| High-risk chest pain | EMERGENCY_NOW | Safety response is not delayed by RAG |

See [Demo Guide](docs/demo-guide.md) for the recommended presentation flow.

## Quick Start

### Prerequisites

- Git
- Node.js 22+
- Python 3.11+ (Python 3.12 recommended)
- A DeepSeek API key for the Python AI service
- An OpenAI-compatible embedding endpoint serving BAAI/bge-m3 with 1024-dimensional output

### 1. Clone and install

~~~powershell
git clone https://github.com/ggggddddhhh/Medical-Agent.git
cd Medical-Agent

npm ci
npm ci --prefix web

py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r python_knowledge_service/requirements.txt
~~~

On macOS/Linux, use python3 -m venv .venv, then .venv/bin/python -m pip ....

### 2. Configure environment variables

~~~powershell
Copy-Item .env.example .env
Copy-Item web/.env.example web/.env
~~~

At minimum, edit the root .env with:

~~~dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

EMBEDDING_BASE_URL=https://your-provider.example/v1
EMBEDDING_API_KEY=your-key
EMBEDDING_MODEL=BAAI/bge-m3

AGENT_ORCHESTRATOR=langgraph
~~~

Never commit .env, web/.env, API keys, runtime checkpoints, or real patient data. Both environment files and runtime data are ignored by Git. See [.env.example](.env.example) and [web/.env.example](web/.env.example) for the available settings.

### 3. Start the services

Open four terminals and keep each process running:

~~~powershell
npm run start:python-ai
npm run start:python-knowledge
npm run start:demo
npm run start:web
~~~

| Service | Address | Role |
| --- | --- | --- |
| React Web Demo | http://127.0.0.1:5173 | Presentation UI |
| Python AI Service | http://127.0.0.1:8001 | Model-assisted semantic extraction |
| Python LightRAG | http://127.0.0.1:8002 | Read-only medical knowledge retrieval |
| Node.js Demo API | http://127.0.0.1:8003 | Agent Core and Demo API |

Open <http://127.0.0.1:5173> in a browser. The first LightRAG startup may build a local index under the ignored runtime/lightrag directory.

### 4. Verify health and tests

~~~powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8002/health
Invoke-RestMethod http://127.0.0.1:8003/health

npm run test:all
~~~

For a real embedding and LightRAG smoke test after configuring credentials:

~~~powershell
npm run test:rag:live
~~~

For full operating instructions and troubleshooting, see [docs/quick-start.md](docs/quick-start.md).

## Evaluation

The following results are repository validation baselines, not clinical efficacy claims:

| Area | Result |
| --- | ---: |
| Node.js tests | **326/326 passed** |
| Python tests | **19/19 passed** |
| React tests | **8/8 passed** |
| Phase 5.1 LangGraph prototype | **6/6 passed** |
| Phase 1 Safety Invariants | **10/10 passed** |

Additional semantic evaluation data is documented in [Phase 2A.4](docs/phase-2a4-competition-semantic-repair.md), [Subject Promotion](docs/phase-2a-subject-promotion.md), and the frozen [evaluation results](evaluation/results/deepseek-v4-flash-phase-2a-promotion.json).

The Phase 2A competition checkpoint was recorded as COMPETITION_READY_FOR_PHASE_2B. This is an engineering milestone, not a clinical validation or deployment approval.

## Project Structure

~~~text
.
├── src/                         Node.js Agent Core, Safety Core, pathways, and APIs
├── python_ai_service/           Python model transport service
├── python_knowledge_service/    LightRAG, embeddings, and medical knowledge base
├── web/                         React + Vite demo UI
├── evaluation/                  Frozen datasets and de-identified evaluation results
├── test/                        Node.js automated tests
├── scripts/                     Startup, evaluation, and smoke-test scripts
├── docs/                        Architecture, Quick Start, Demo, and validation reports
└── .github/workflows/           GitHub Actions configuration
~~~

## Limitations

- The current MVP covers only a small number of adult-oriented pathways.
- Outputs are safety-routing and health-education responses, not diagnoses or treatment plans.
- Local session checkpoints contain conversation data and require encryption, access control, and retention policies before any controlled deployment.
- The evaluation suite is an engineering validation set, not a substitute for clinical, regulatory, privacy, or usability validation.
- Do not use this repository with identifiable patient data.

## Security and Privacy

- Do not commit .env, API keys, runtime checkpoints, raw logs, or identifiable health data.
- RAG requests are isolated from patient text, CaseState, and risk conclusions.
- RAG and model failures preserve the original safety response and do not silently invent knowledge.
- Security concerns should be reported privately according to [SECURITY.md](SECURITY.md).

## Contributing

Contributions should include relevant tests and documentation updates. Run the complete validation suite before submitting a change. Each independent change should have a corresponding Git commit; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is available under the [Apache License 2.0](LICENSE). The license does not change the project's safety boundary: Medical-Agent is a research prototype, not a medical device or diagnostic tool.
