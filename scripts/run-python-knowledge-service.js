import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const bundled = join(
  homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  process.platform === "win32" ? "python.exe" : "bin/python",
);
const projectVenv = join(
  process.cwd(),
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const candidates = [
  process.env.PYTHON_KNOWLEDGE_EXECUTABLE,
  existsSync(projectVenv) ? projectVenv : null,
  process.env.PYTHON_EXECUTABLE,
  existsSync(bundled) ? bundled : null,
  process.platform === "win32" ? "python" : "python3",
].filter(Boolean);

for (const executable of candidates) {
  const result = spawnSync(executable, ["-m", "python_knowledge_service.app"], {
    stdio: "inherit",
    env: process.env,
  });
  if (!result.error) process.exit(result.status ?? 1);
}
console.error("No Python interpreter was found. Set PYTHON_KNOWLEDGE_EXECUTABLE.");
process.exit(1);
