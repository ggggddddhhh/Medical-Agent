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
  process.env.PYTHON_EXECUTABLE,
  existsSync(projectVenv) ? projectVenv : null,
  existsSync(bundled) ? bundled : null,
  process.platform === "win32" ? "python" : "python3",
].filter(Boolean);

const suites = ["python_ai_service/tests", "python_knowledge_service/tests"];
for (const executable of candidates) {
  let available = true;
  for (const suite of suites) {
    const result = spawnSync(executable, [
      "-m", "unittest", "discover", "-s", suite, "-v",
    ], { stdio: "inherit" });
    if (result.error) {
      available = false;
      break;
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (available) process.exit(0);
}
console.error("No Python interpreter was found. Set PYTHON_EXECUTABLE.");
process.exit(1);
