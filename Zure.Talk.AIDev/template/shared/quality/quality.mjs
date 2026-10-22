#!/usr/bin/env node
// Usage: node quality.mjs <run-dir> [--mutation] [--no-semgrep]
// Runs the deterministic quality tools against one run and prints one JSON object.
// A metric that could not be measured is null, never 0: missing is not zero.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const run = path.resolve(process.argv[2] ?? ".");
const flags = new Set(process.argv.slice(3));
const bin = (p) => `node "${path.join(here, "node_modules", p)}"`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-"));

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "reports", ".claude", ".claude-home", ".firstmate"]);
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const TEST = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/;

function sh(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { cwd: run, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20, ...opts }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
function attempt(fn) {
  try { return fn(); } catch { return null; }
}
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), acc); }
    else if (CODE.test(e.name)) acc.push(path.join(dir, e.name));
  }
  return acc;
}

const files = walk(run);
const testFiles = files.filter((f) => TEST.test(f));
const pkg = attempt(() => JSON.parse(fs.readFileSync(path.join(run, "package.json"), "utf8")));
const r = { run: path.basename(path.dirname(run)) + "/" + path.basename(run), files: files.length, testFiles: testFiles.length };

// Types: strict tsc over the run's own tsconfig.
r.typeErrors = fs.existsSync(path.join(run, "tsconfig.json"))
  ? (sh(`${bin("typescript/bin/tsc")} --noEmit --strict --skipLibCheck -p .`).out.match(/error TS\d+/g) ?? []).length
  : null;

// Lint: our config, not theirs.
r.lint = attempt(() => {
  const out = sh(`${bin("eslint/bin/eslint.js")} --config "${path.join(here, "eslint.config.mjs")}" --format json --no-warn-ignored .`).out;
  const res = JSON.parse(out.slice(out.indexOf("[")));
  return { errors: res.reduce((n, f) => n + f.errorCount, 0), warnings: res.reduce((n, f) => n + f.warningCount, 0) };
});

// Complexity and size: lizard (pip install lizard).
r.complexity = attempt(() => {
  const res = sh(`python -m lizard -l typescript -l javascript --csv -x "*/node_modules/*" -x "*/.claude*/*" -x "*/.firstmate/*" -x "*/dist/*" .`);
  if (!res.ok && !res.out.includes(",")) return null;
  const rows = res.out.trim().split("\n").filter((l) => /^\d+,\d+,/.test(l)).map((l) => l.split(","));
  if (!rows.length) return { functions: 0, nloc: 0, avgCcn: 0, maxCcn: 0, over10: 0 };
  const ccn = rows.map((c) => +c[1]);
  return {
    functions: rows.length,
    nloc: rows.reduce((n, c) => n + +c[0], 0),
    avgCcn: +(ccn.reduce((a, b) => a + b, 0) / ccn.length).toFixed(1),
    maxCcn: Math.max(...ccn),
    over10: ccn.filter((c) => c > 10).length,
  };
});

// Duplication: jscpd.
r.duplicationPct = attempt(() => {
  sh(`${bin("jscpd/bin/jscpd")} --silent --reporters json --output "${tmp}" --ignore "**/node_modules/**,**/.claude*/**,**/.firstmate/**,**/dist/**,**/coverage/**" .`);
  return JSON.parse(fs.readFileSync(path.join(tmp, "jscpd-report.json"), "utf8")).statistics.total.percentage;
});

// Their own tests: count, pass rate, coverage if their setup supports it.
r.ownTests = attempt(() => {
  if (!testFiles.length) return { total: 0, passed: 0, coveragePct: null };
  const json = path.join(tmp, "vitest.json");
  // Coverage needs a provider matching their vitest. Add it without touching package.json.
  const vitest = attempt(() => JSON.parse(fs.readFileSync(path.join(run, "node_modules/vitest/package.json"), "utf8")).version);
  if (vitest && !fs.existsSync(path.join(run, "node_modules/@vitest/coverage-v8")))
    sh(`npm install --no-save --no-audit --no-fund @vitest/coverage-v8@${vitest}`, { timeout: 5 * 60_000 });
  // Our harness folders sit inside the run; never collect tests from them.
  const exclude = ["**/node_modules/**", "**/.claude-home/**", "**/.claude/**", "**/.firstmate/**"].map((g) => `--exclude "${g}"`).join(" ");
  const base = `npx --no-install vitest run ${exclude} --reporter=json --outputFile="${json}"`;
  const cov = sh(`${base} --coverage.enabled --coverage.reportOnFailure --coverage.reporter=json-summary --coverage.reportsDirectory="${path.join(tmp, "cov")}"`);
  if (!fs.existsSync(json)) sh(base);
  const v = JSON.parse(fs.readFileSync(json, "utf8"));
  const summary = path.join(tmp, "cov", "coverage-summary.json");
  const coveragePct = fs.existsSync(summary) ? JSON.parse(fs.readFileSync(summary, "utf8")).total.lines.pct : null;
  return { total: v.numTotalTests, passed: v.numPassedTests, coveragePct };
});

// Their own Playwright suite. Their config is expected to start the game (webServer).
r.ownE2e = !fs.existsSync(path.join(run, "node_modules", "@playwright", "test")) ? null : attempt(() => {
  const out = sh(`npx --no-install playwright test --reporter=json`, { timeout: 10 * 60_000 }).out;
  const st = JSON.parse(out.slice(out.indexOf("{"))).stats;
  return { total: st.expected + st.unexpected + st.flaky + st.skipped, passed: st.expected };
});

// Tests weakened: skip/only/todo markers, and test files deleted in the run's history.
r.testsSkipped = testFiles.reduce((n, f) => n + (fs.readFileSync(f, "utf8").match(/\b(it|test|describe)\.(skip|only|todo)\(|\bx(it|describe)\(/g) ?? []).length, 0);
r.testFilesDeleted = attempt(() => {
  const res = sh(`git log --diff-filter=D --name-only --pretty=format:`);
  return res.ok ? res.out.split("\n").filter((l) => TEST.test(l.trim())).length : null;
});

// Test strength: Stryker mutation score. Slow, so opt-in.
r.mutationScore = !flags.has("--mutation") ? null : attempt(() => {
  sh(`${bin("@stryker-mutator/core/bin/stryker.js")} run "${path.join(here, "stryker.config.json")}"`, { timeout: 15 * 60_000 });
  const report = JSON.parse(fs.readFileSync(path.join(run, "reports/mutation/mutation.json"), "utf8"));
  const statuses = Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.status));
  const valid = statuses.filter((s) => !["CompileError", "RuntimeError", "Ignored"].includes(s));
  const detected = valid.filter((s) => s === "Killed" || s === "Timeout");
  return valid.length ? +((100 * detected.length) / valid.length).toFixed(1) : null;
});

// Security: Semgrep in Docker, npm audit.
r.semgrepFindings = flags.has("--no-semgrep") ? null : attempt(() => {
  const res = sh(`docker run --rm -v "${run}:/src" semgrep/semgrep semgrep scan --config p/typescript --json --quiet /src`, { timeout: 10 * 60_000 });
  return JSON.parse(res.out.slice(res.out.indexOf("{"))).results.length;
});
r.auditHighCritical = !pkg ? null : attempt(() => {
  const v = JSON.parse(sh(`npm audit --json`).out).metadata.vulnerabilities;
  return v.high + v.critical;
});
r.dependencies = pkg ? Object.keys(pkg.dependencies ?? {}).length : null;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify(r, null, 2));
