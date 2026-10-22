#!/usr/bin/env node
// Usage: node scoreboard.mjs <talk-dir>
// Turns <talk>/results/*.json into <talk>/scoreboard.md: one table, a column per run in
// runs.yaml order, best value per row in bold. Tool results and the AI judge stay in separate rows.
import fs from "node:fs";
import path from "node:path";

const talk = path.resolve(process.argv[2] ?? ".");
const dir = path.join(talk, "results");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
const judge = read("judge.json")?.runs ?? {};

// Columns in runs.yaml order; a run without results still gets a column of —.
const order = [...fs.readFileSync(path.join(talk, "runs.yaml"), "utf8").matchAll(/^\s*-\s*run:\s*(\S+)/gm)].map((m) => m[1]);
const runs = order.map((name) => ({ name, ...read(`${name.replaceAll("/", "__")}.json`) }));

// 1234567 -> "1.23M", 45600 -> "45.6k"
const fmt = (n) => n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;

// [label, value(run), better: "high" | "low" | null, key(run) for comparing]
const ROWS = [
  ["**Acceptance (hidden suite)**", (r) => r.acceptance ? `${r.acceptance.passed}/${r.acceptance.total}` : null, "high", (r) => r.acceptance?.passed],
  ["Minutes to last commit", (r) => r.minutes, "low"],
  ["Own Playwright tests (passed/total)", (r) => r.quality?.ownE2e ? `${r.quality.ownE2e.passed}/${r.quality.ownE2e.total}` : null, "high", (r) => r.quality?.ownE2e?.passed],
  ["Own unit tests (passed/total)", (r) => r.quality?.ownTests ? `${r.quality.ownTests.passed}/${r.quality.ownTests.total}` : null, "high", (r) => r.quality?.ownTests?.passed],
  ["Coverage %", (r) => r.quality?.ownTests?.coveragePct, "high"],
  ["Functions over CCN 10", (r) => r.quality?.complexity?.over10, "low"],
  ["Semgrep findings", (r) => r.quality?.semgrepFindings, "low"],
  ["Lines of code", (r) => r.quality?.complexity?.nloc, null],
  ["**API-equivalent cost (USD)**", (r) => r.cost?.usd, "low"],
  ["Tokens (incl. cache reads)", (r) => fmt(r.cost?.tokens), "low", (r) => r.cost?.tokens],
  ["Output tokens (incl. thinking)", (r) => fmt(r.cost?.outputTokens), "low", (r) => r.cost?.outputTokens],
  ["**Mutation score %**", (r) => r.quality?.mutationScore, "high"],
  ["Tests skipped or deleted", (r) => r.quality ? (r.quality.testsSkipped ?? 0) + (r.quality.testFilesDeleted ?? 0) : null, "low"],
  ["Type errors (strict)", (r) => r.quality?.typeErrors, "low"],
  ["Lint errors / warnings", (r) => r.quality?.lint ? `${r.quality.lint.errors} / ${r.quality.lint.warnings}` : null, "low", (r) => r.quality?.lint?.errors],
  ["Duplication %", (r) => r.quality?.duplicationPct, "low"],
  ["npm audit high+critical", (r) => r.quality?.auditHighCritical, "low"],
  ["Runtime dependencies", (r) => r.quality?.dependencies, null],
  ["AI judge: spec", (r) => judge[r.name]?.spec, "high"],
  ["AI judge: server authority", (r) => judge[r.name]?.authority, "high"],
  ["AI judge: readability", (r) => judge[r.name]?.readability, "high"],
  ["AI judge: tests", (r) => judge[r.name]?.tests, "high"],
];

function table(group) {
  const head = `| | ${group.map((r) => `\`${r.name}\``).join(" | ")} |\n| --- |${" --- |".repeat(group.length)}`;
  const body = ROWS.map(([label, val, better, key = val]) => {
    const keys = group.map((r) => key(r)).filter((k) => typeof k === "number");
    const tied = new Set(keys).size < 2;
    const best = better && !tied ? (better === "high" ? Math.max(...keys) : Math.min(...keys)) : null;
    const cells = group.map((r) => {
      const v = val(r);
      if (v === null || v === undefined) return "—";
      return best !== null && key(r) === best ? `**${v}**` : `${v}`;
    });
    return `| ${label} | ${cells.join(" | ")} |`;
  });
  return [head, ...body].join("\n");
}

const md = `# Scoreboard: ${path.basename(talk)}\n\n— means not measured (missing is not zero). Bold is the best value in the row.\n\n${table(runs)}\n`;
fs.writeFileSync(path.join(talk, "scoreboard.md"), md);
console.log(md);
