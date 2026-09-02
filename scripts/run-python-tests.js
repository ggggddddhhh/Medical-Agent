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
const candidates = [
  process.env.PYTHON_EXECUTABLE,
  existsSync(bundled) ? bundled : null,
  process.platform === "win32" ? "python" : "python3",
].filter(Boolean);

for (const executable of candidates) {
  const result = spawnSync(executable, [
    "-m", "unittest", "discover", "-s", "python_ai_service/tests", "-v",
  ], { stdio: "inherit" });
  if (!result.error) process.exit(result.status ?? 1);
}
console.error("No Python interpreter was found. Set PYTHON_EXECUTABLE.");
process.exit(1);
