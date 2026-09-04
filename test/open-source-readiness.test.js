import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public repository has complete entry, architecture, quick-start and demo documentation", async () => {
  const required = [
    ["README.md", ["Quick Start", "docs/architecture.md", "docs/demo-guide.md", "SECURITY.md"]],
    ["docs/architecture.md", ["Semantic Gate", "CaseState", "BAAI/bge-m3", "安全不变量"]],
    ["docs/quick-start.md", ["npm ci --prefix web", "start:python-ai", "start:python-knowledge", "start:demo", "start:web"]],
    ["docs/demo-guide.md", ["普通头痛", "模糊胸痛", "高风险胸痛", "UNAVAILABLE"]],
    ["docs/github-release-report.md", ["API Key", "本地绝对路径", "READY_WITH_OWNER_ACTIONS"]],
  ];

  for (const [path, markers] of required) {
    const content = await read(path);
    for (const marker of markers) assert.match(content, new RegExp(marker), `${path} missing ${marker}`);
  }
});

test("environment templates contain no credentials and launchers load .env plus project .venv", async () => {
  const env = await read(".env.example");
  for (const key of [
    "DEEPSEEK_API_KEY",
    "EMBEDDING_BASE_URL",
    "EMBEDDING_API_KEY",
    "LIGHTRAG_LLM_API_KEY",
  ]) {
    assert.match(env, new RegExp(`^${key}=$`, "m"), `${key} must stay blank in .env.example`);
  }
  assert.match(env, /^EMBEDDING_MODEL=BAAI\/bge-m3$/m);

  const packageJson = JSON.parse(await read("package.json"));
  for (const name of ["start:python-ai", "start:python-knowledge", "start:demo", "test:rag:live"]) {
    assert.match(packageJson.scripts[name], /--env-file-if-exists=\.env/);
  }
  for (const path of ["scripts/run-python-ai-service.js", "scripts/run-python-tests.js"]) {
    assert.match(await read(path), /projectVenv/);
  }
});

test("temporary, credential and local runtime paths are ignored and not tracked", async () => {
  const ignore = await read(".gitignore");
  for (const marker of [
    ".env",
    ".venv/",
    "runtime/",
    "node_modules/",
    "__pycache__/",
    ".pytest_cache/",
    "*.tmp",
  ]) assert.ok(ignore.includes(marker), `.gitignore missing ${marker}`);

  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const forbidden = /(^|\/)(node_modules|dist|coverage|__pycache__|runtime|\.venv|\.pytest_cache)(\/|$)|\.(log|tmp|pyc|pyo)$/i;
  assert.deepEqual(files.filter((file) => forbidden.test(file)), []);
});

test("tracked public text contains no common credential, email or private local-path pattern", async () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => file !== "test/open-source-readiness.test.js")
    .filter((file) => ![".png", ".jpg", ".jpeg", ".gif", ".pdf"].includes(extname(file).toLowerCase()));

  const credentialPatterns = [
    new RegExp(["s", "k", "-"].join("") + "[A-Za-z0-9_-]{16,}"),
    new RegExp(["github", "_pat_"].join("") + "[A-Za-z0-9_]{16,}"),
    new RegExp(["gh", "p_"].join("") + "[A-Za-z0-9]{16,}"),
    new RegExp(["AK", "IA"].join("") + "[0-9A-Z]{16}"),
  ];
  const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const localPathPattern = /[A-Za-z]:\\(?:Users|Documents and Settings|Temp)\\|\/(?:Users|home)\/[^/]+\//i;

  for (const file of files) {
    const content = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const pattern of credentialPatterns) {
      assert.doesNotMatch(content, pattern, `credential-like content in ${file}`);
    }
    assert.doesNotMatch(content, emailPattern, `email-like content in ${file}`);
    assert.doesNotMatch(content, localPathPattern, `private local path in ${file}`);
  }
});

test("GitHub CI runs offline validation without repository secrets", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  assert.match(workflow, /npm run test:all/);
  assert.match(workflow, /npm run test:coverage/);
  assert.doesNotMatch(workflow, /secrets\./);
});
