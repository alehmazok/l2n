// Turns coverage/coverage-summary.json into a Markdown table per package.
// CI appends it to the job summary; locally: `pnpm coverage && node scripts/coverage-summary.mjs`.
import { readFileSync } from "node:fs";

const summary = JSON.parse(readFileSync(new URL("../coverage/coverage-summary.json", import.meta.url), "utf8"));
const metrics = ["lines", "statements", "functions", "branches"];
const packages = new Map();

for (const [file, data] of Object.entries(summary)) {
  if (file === "total") continue;
  const name = file.match(/packages\/([^/]+)\//)?.[1] ?? "other";
  const acc = packages.get(name) ?? Object.fromEntries(metrics.map((m) => [m, { covered: 0, total: 0 }]));
  for (const m of metrics) {
    acc[m].covered += data[m].covered;
    acc[m].total += data[m].total;
  }
  packages.set(name, acc);
}

const pct = ({ covered, total }) => (total === 0 ? "100%" : `${((100 * covered) / total).toFixed(1)}%`);
const rows = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, acc]) => [name, ...metrics.map((m) => pct(acc[m]))]);
rows.push(["**total**", ...metrics.map((m) => `**${pct(summary.total[m])}**`)]);

console.log("## Test coverage\n");
console.log(`| Package | ${metrics.map((m) => m[0].toUpperCase() + m.slice(1)).join(" | ")} |`);
console.log(`| --- |${" ---: |".repeat(metrics.length)}`);
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
