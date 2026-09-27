// Compares probe reports between museum states.
//
//   node scripts/perf-report.mjs perf/01-baseline-head perf/02-next
//
// Each argument is a folder of JSON files downloaded from the localhost probe.
// Runs inside a folder are pooled; the first folder is the reference. Output is
// per hall and per metre of depth, so a regression points at a place, not at a
// vague average.
import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const HALLS = [["Vestíbulo", 4], ["Sala I", -17.5], ["Sala II", -36], ["Sala III", -Infinity]];
const hallOf = (z) => HALLS.find(([, until]) => z > until)[0];

function load(dir) {
  const frames = [];
  let env = null, runs = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const report = JSON.parse(readFileSync(join(dir, file), "utf8"));
    env ??= report.entorno;
    for (const run of report.recorridos) { frames.push(...run.crudo.datos); runs++; }
  }
  return { name: basename(dir), env, runs, frames };
}

function stats(ms) {
  if (!ms.length) return null;
  const s = ms.slice().sort((a, b) => a - b);
  const over = (v) => s.filter((x) => x > v).length;
  return { n: s.length, median: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)],
    worst: s[s.length - 1], over33: (100 * over(33)) / s.length, over50: over(50) };
}

const sets = process.argv.slice(2).map(load);
if (!sets.length) { console.error("usage: perf-report.mjs <folder> [folder...]"); process.exit(1); }

for (const set of sets) {
  const e = set.env;
  console.log(`\n■ ${set.name}  ·  ${set.runs} run(s), ${set.frames.length} frames  ·  ratio ${e.pixelRatio}, ${e.megapixeles} Mpx, ${e.piezas} pieces`);
}

// What changed between states, when the reports say which pieces they held.
for (const set of sets.slice(1)) {
  const a = sets[0].env.ids, b = set.env.ids;
  if (!a || !b) continue;
  const gone = a.filter((id) => !b.includes(id)), added = b.filter((id) => !a.includes(id));
  if (gone.length || added.length) console.log(`\n${set.name}: + ${added.join(", ") || "–"}   − ${gone.join(", ") || "–"}`);
}

console.log(`\nPER HALL — median ms · p95 · % frames over 33 ms · frames over 50 ms`);
console.log("hall".padEnd(11) + sets.map((s) => s.name.slice(0, 26).padStart(30)).join(""));
for (const [hall] of HALLS) {
  const cells = sets.map((set) => {
    const s = stats(set.frames.filter((f) => hallOf(f[4]) === hall).map((f) => f[1]));
    return s ? `${s.median.toFixed(1)} · ${s.p95.toFixed(1)} · ${s.over33.toFixed(1)}% · ${s.over50}` : "–";
  });
  console.log(hall.padEnd(11) + cells.map((c) => c.padStart(30)).join(""));
}

if (sets.length > 1) {
  const [ref, ...rest] = sets;
  const byMetre = (frames) => {
    const m = new Map();
    for (const f of frames) { const k = Math.round(f[4]); (m.get(k) ?? m.set(k, []).get(k)).push(f[1]); }
    return m;
  };
  const refM = byMetre(ref.frames);
  for (const set of rest) {
    const m = byMetre(set.frames);
    const rows = [];
    for (const [z, ms] of m) {
      const a = stats(refM.get(z) ?? []), b = stats(ms);
      if (!a || !b) continue;
      rows.push({ z, hall: hallOf(z), a: a.over33, b: b.over33, delta: b.over33 - a.over33, worstA: a.worst, worstB: b.worst });
    }
    rows.sort((x, y) => y.delta - x.delta);
    console.log(`\nWHERE ${set.name} GOT WORSE than ${ref.name} (per metre of depth, % frames over 33 ms)`);
    for (const r of rows.filter((r) => r.delta > 10).slice(0, 15)) {
      console.log(`  z=${String(r.z).padStart(4)}  ${r.hall.padEnd(10)} ${r.a.toFixed(0).padStart(3)}% → ${r.b.toFixed(0).padStart(3)}%   worst ${r.worstA.toFixed(0)} → ${r.worstB.toFixed(0)} ms`);
    }
    if (!rows.some((r) => r.delta > 10)) console.log("  nowhere by more than 10 points");
  }
}
