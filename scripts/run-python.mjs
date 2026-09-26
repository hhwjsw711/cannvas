// Cross-platform Python launcher: picks `python3` on Linux/macOS and
// `python` on Windows (where `python3` is often a Windows Store stub).
// Usage: node scripts/run-python.mjs <args...>
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-python.mjs <args...>");
  process.exit(1);
}

const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

for (const cmd of candidates) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error && result.error.code === "ENOENT") {
    // Command not found — try the next candidate.
    continue;
  }
  // Command ran (or failed to spawn for another reason) — propagate its exit code.
  process.exit(result.status ?? 1);
}

console.error(`Python not found. Tried: ${candidates.join(", ")}`);
process.exit(1);