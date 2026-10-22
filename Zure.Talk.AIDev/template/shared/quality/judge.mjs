#!/usr/bin/env node
// Usage: node judge.mjs <talk-dir> [samples=3]
// Blinded AI review: copies each run's source to an anonymous letter, scores it
// against rubric.md with a judge model, and writes <talk>/results/judge.json.
// Set JUDGE_MODEL to a different model from the one that built the runs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const talk = path.resolve(process.argv[2] ?? ".");
const samples = Number(process.argv[3] ?? 3);
const model = process.env.JUDGE_MODEL ?? "sonnet";
const rubric = fs.readFileSync(path.join(here, "rubric.md"), "utf8");
const SKIP = new Set(["node_modules", ".git", "dist", "coverage", "reports", ".claude", ".claude-home", ".firstmate"]);
const CRITERIA = ["spec", "authority", "readability", "tests"];

const runs = [...fs.readFileSync(path.join(talk, "runs.yaml"), "utf8").matchAll(/^\s*-\s*run:\s*(\S+)/gm)].map((m) => m[1]);
const letters = runs.map((_, i) => String.fromCharCode(65 + i)).sort(() => Math.random() - 0.5);
const blind = fs.mkdtempSync(path.join(os.tmpdir(), "judge-"));

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const result = {};
runs.forEach((run, i) => {
  const dir = path.join(blind, letters[i]);
  fs.cpSync(path.join(talk, "runs", run), dir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  fs.copyFileSync(path.join(talk, "idea.md"), path.join(dir, "idea.md"));

  const scores = [];
  for (let n = 0; n < samples; n++) {
    try {
      const out = execFileSync("claude", ["-p", rubric, "--model", model, "--output-format", "json", "--allowedTools", "Read,Grep,Glob"],
        { cwd: dir, encoding: "utf8", maxBuffer: 16 << 20, timeout: 10 * 60_000 });
      const text = JSON.parse(out).result;
      scores.push(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
    } catch (e) {
      console.error(`judge: ${letters[i]} sample ${n + 1} failed: ${e.message}`);
    }
  }
  result[run] = { letter: letters[i], samples: scores.length };
  for (const c of CRITERIA) result[run][c] = median(scores.map((s) => s[c]).filter(Number.isFinite));
  result[run].reasons = scores[0]?.reasons ?? null;
});

fs.mkdirSync(path.join(talk, "results"), { recursive: true });
fs.writeFileSync(path.join(talk, "results", "judge.json"), JSON.stringify({ model, samples, runs: result }, null, 2));
fs.rmSync(blind, { recursive: true, force: true });
console.log(`judge: wrote ${path.join(talk, "results", "judge.json")}`);
