// Cross-platform Python launcher: picks `python3` on Linux/macOS and
// `python` on Windows (where `python3` is often a Windows Store stub).
// Usage: node scripts/run-python.mjs <args...>
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-python.mjs <args...>");
  process.exit(1);
}

const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

for (const cmd of candidates) {
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
    process.exit(0);
  } catch (error) {
    if (error.status !== undefined && error.status !== 127 && error.status !== 1) {
      // Python ran but the script/test itself failed — preserve that exit code.
      process.exit(error.status);
    }
    // Command not found or threw — try the next candidate.
  }
}

console.error(`Python not found. Tried: ${candidates.join(", ")}`);
process.exit(1);