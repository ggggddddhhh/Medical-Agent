import {
  createDemoApiServer,
  createPhase4Demo,
} from "../src/index.js";

const host = process.env.DEMO_API_HOST ?? "127.0.0.1";
const port = Number(process.env.DEMO_API_PORT ?? 8003);
const demo = createPhase4Demo({
  pythonServiceUrl: process.env.PYTHON_AI_SERVICE_URL,
  pythonKnowledgeServiceUrl: process.env.PYTHON_KNOWLEDGE_SERVICE_URL,
  memoryStorageDir: process.env.MEMORY_STORAGE_DIR,
});
const server = createDemoApiServer({ demo });
server.listen(port, host, () => {
  console.log(`Medical Agent Demo API listening on http://${host}:${port}`);
});
