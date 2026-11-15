// Unit tests for pure modules under src/ (files named *.test.ts).
//
// The repo has no test framework, and this Node build can't run
// TypeScript directly, so each test file is compiled with the esbuild
// that Vite already ships and run with Node's built-in test runner.
// Packages stay external and resolve from node_modules at run time.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "node_modules/.cache/unit-tests");

const tests = readdirSync(join(root, "src"), { recursive: true })
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("src", f));

if (tests.length === 0) {
  console.log("No unit tests found.");
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
await build({
  entryPoints: tests,
  outdir: outDir,
  outbase: "src",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "warning",
  absWorkingDir: root,
});

const outputs = tests.map((t) =>
  join(outDir, t.slice("src/".length).replace(/\.ts$/, ".mjs")),
);
const result = spawnSync(process.execPath, ["--test", ...outputs], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
