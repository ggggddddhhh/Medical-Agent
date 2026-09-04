import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluatePhase53Stability } from "../src/evaluation/phase5-stability-evaluator.js";

const result = await evaluatePhase53Stability();
const serialized = `${JSON.stringify(result, null, 2)}\n`;

if (process.argv.includes("--write")) {
  const target = fileURLToPath(new URL(
    "../evaluation/results/phase-5.3-langgraph-stability.json",
    import.meta.url,
  ));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serialized, "utf8");
}

process.stdout.write(serialized);
if (result.validationVerdict === "FAIL") process.exitCode = 1;
