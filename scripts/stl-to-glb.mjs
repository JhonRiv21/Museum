// Binary STL -> glTF binary. The SMK Royal Cast Collection publishes its scans
// as STL with no login, but STL is bare triangles: no shared vertices, no
// smooth normals, no material. This welds the soup, rebuilds area-weighted
// normals and dresses it in plaster — which is what a cast actually is.
import { readFileSync } from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";

export async function stlToGlb(stlPath, glbPath) {
  const buf = readFileSync(stlPath);
  const count = buf.readUInt32LE(80);
  if (84 + count * 50 !== buf.length) throw new Error(`${stlPath}: not a binary STL`);

  // Weld: identical corners become one vertex, so normals can be averaged.
  const index = new Map();
  const positions = [];
  const indices = new Uint32Array(count * 3);
  for (let t = 0; t < count; t++) {
    const base = 84 + t * 50 + 12;               // skip the facet normal
    for (let v = 0; v < 3; v++) {
      const o = base + v * 12;
      const x = buf.readFloatLE(o), y = buf.readFloatLE(o + 4), z = buf.readFloatLE(o + 8);
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let i = index.get(key);
      if (i === undefined) { i = positions.length / 3; positions.push(x, y, z); index.set(key, i); }
      indices[t * 3 + v] = i;
    }
  }
  const pos = new Float32Array(positions);

  // Area-weighted vertex normals: the unnormalised cross product already
  // scales each face's contribution by its area.
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
  }
  for (let k = 0; k < nrm.length; k += 3) {
    const l = Math.hypot(nrm[k], nrm[k + 1], nrm[k + 2]) || 1;
    nrm[k] /= l; nrm[k + 1] /= l; nrm[k + 2] /= l;
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const plaster = doc.createMaterial("plaster")
    // Mid-tone, not white: a scan has no texture, so no baked shading either,
    // and a near-white albedo clipped a fifth of the statue to flat white.
    .setBaseColorFactor([0.56, 0.547, 0.52, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(nrm).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
    .setMaterial(plaster);
  const node = doc.createNode("cast").setMesh(doc.createMesh("cast").addPrimitive(prim));
  doc.createScene("scene").addChild(node);
  await new NodeIO().write(glbPath, doc);
  return { triangles: count, vertices: pos.length / 3 };
}
