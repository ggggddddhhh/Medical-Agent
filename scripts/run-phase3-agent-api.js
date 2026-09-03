import { createAgentApiServer, createPhase3Agent } from "../src/index.js";

const host = process.env.AGENT_API_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_API_PORT ?? 8000);
const loop = createPhase3Agent({
  pythonServiceUrl: process.env.PYTHON_AI_SERVICE_URL,
  pythonKnowledgeServiceUrl: process.env.PYTHON_KNOWLEDGE_SERVICE_URL,
});
const server = createAgentApiServer({ loop });
server.listen(port, host, () => {
  console.log(`Medical Agent API listening on http://${host}:${port}`);
});
