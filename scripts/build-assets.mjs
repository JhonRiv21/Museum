// Asset pipeline: downloads the original scans (kept out of git), optimizes
// them with gltf-transform (Draco + WebP + simplify), writes the output sizes
// back into the manifest, and fails the build if a hall exceeds its budget.
//
// Usage: npm run assets [-- pieceId]

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "assets", "pieces.json");
const originalsDir = join(root, "assets", "originals");
const outputDir = join(root, "public", "models");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const only = process.argv[2];

// Local .env (untracked): SKETCHFAB_TOKEN enables sketchfab: downloads.
const envPath = join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

mkdirSync(originalsDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const mb = (bytes) => (bytes / 1e6).toFixed(2);

async function download(piece) {
  const file = join(originalsDir, `${piece.id}.glb`);
  if (existsSync(file)) return file;

  // Manually-sourced pieces: the file is dropped by hand into
  // assets/originals as <id>.glb or <id>/scene.gltf.
  if (piece.source.uri.startsWith("manual:")) {
    const extracted = join(originalsDir, piece.id, "scene.gltf");
    if (existsSync(extracted)) return extracted;
    console.log(`  ${piece.id}: falta el archivo manual (${piece.source.uri.slice(7)}) — omitida`);
    return null;
  }

  // Sketchfab pieces: downloaded through the official Download API using the
  // owner's token (SKETCHFAB_TOKEN in .env). The zip contains scene.gltf.
  if (piece.source.uri.startsWith("sketchfab:")) {
    const extracted = join(originalsDir, piece.id, "scene.gltf");
    if (existsSync(extracted)) return extracted;
    const token = process.env.SKETCHFAB_TOKEN;
    if (!token) {
      console.log(`  ${piece.id}: falta SKETCHFAB_TOKEN en .env — omitida`);
      return null;
    }
    const uid = piece.source.uri.slice(10);
    process.stdout.write(`  descargando ${piece.id} (Sketchfab)… `);
    const meta = await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!meta.ok) throw new Error(`Sketchfab HTTP ${meta.status} para ${piece.id}`);
    const links = await meta.json();
    const archive = links.glb ?? links.gltf;
    const res = await fetch(archive.url);
    if (!res.ok) throw new Error(`descarga HTTP ${res.status} para ${piece.id}`);
    const body = Buffer.from(await res.arrayBuffer());

    if (links.glb) {
      writeFileSync(file, body);
      console.log(`${mb(statSync(file).size)} MB (glb)`);
      return file;
    }
    const zip = join(originalsDir, `${piece.id}.zip`);
    writeFileSync(zip, body);
    execFileSync("unzip", ["-o", "-q", zip, "-d", join(originalsDir, piece.id)]);
    console.log(`${mb(statSync(zip).size)} MB (gltf zip)`);
    return extracted;
  }

  process.stdout.write(`  descargando ${piece.id}… `);
  const res = await fetch(piece.source.uri);
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${piece.id}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${mb(statSync(file).size)} MB`);
  return file;
}

function optimize(piece, input) {
  const output = join(outputDir, `${piece.id}.glb`);
  execFileSync("npx", [
    "gltf-transform", "optimize", input, output,
    "--compress", "draco",
    "--texture-compress", "webp",
    "--simplify", "true",
    "--simplify-error", String(piece.simplifyError ?? 0.001),
  ], { stdio: "pipe" });
  return statSync(output).size;
}

console.log("== Pipeline de assets ==\n");
for (const piece of manifest.pieces) {
  if (only && piece.id !== only) continue;
  const input = await download(piece);
  if (!input) continue;
  const inputBytes = statSync(input).size;
  const outputBytes = optimize(piece, input);
  piece.output = { bytes: outputBytes };
  console.log(
    `  ${piece.id.padEnd(20)} ${mb(inputBytes).padStart(6)} MB -> ${mb(outputBytes).padStart(5)} MB` +
    `  (-${Math.round((1 - outputBytes / inputBytes) * 100)}%)`,
  );
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("\n== Presupuesto por sala ==");
let overBudget = false;
for (const hall of manifest.halls) {
  const pieces = manifest.pieces.filter((p) => p.hall === hall.id && p.output);
  if (!pieces.length) continue;
  const total = pieces.reduce((sum, p) => sum + p.output.bytes, 0);
  const ok = total <= hall.budgetMB * 1e6;
  if (!ok) overBudget = true;
  console.log(`  ${hall.id.padEnd(8)} ${mb(total).padStart(6)} / ${hall.budgetMB} MB  ${ok ? "OK" : "EXCEDIDO"}`);
}
if (overBudget) {
  console.error("\nPresupuesto excedido: sube simplifyError o quita piezas.");
  process.exit(1);
}
