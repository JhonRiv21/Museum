import * as THREE from "three";
import { hallNames } from "./data";
import { lang, onLangChange, type Localized } from "./i18n";

// Builds the gray-box museum architecture: floor, walls, partial partitions,
// pedestals, and the "museum at night" lighting (warm spotlights + low ambient).

export type Pedestal = {
  id: string;
  position: THREE.Vector3;
  width: number;
};

const WALL = new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.95 });
const FLOOR = new THREE.MeshStandardMaterial({ color: 0x11161e, roughness: 0.85 });
const PLINTH = new THREE.MeshStandardMaterial({ color: 0x232d3b, roughness: 0.7 });

const PARTITIONS = [-17.5, -36];

const HEIGHT = 5.2;
const WIDTH = 21;
const Z_START = 15;
const Z_END = -61;

function box(
  scene: THREE.Scene,
  material: THREE.Material,
  sx: number, sy: number, sz: number,
  x: number, y: number, z: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

export function buildStage(scene: THREE.Scene): Pedestal[] {
  const length = Z_START - Z_END;
  const zc = (Z_START + Z_END) / 2;

  box(scene, FLOOR, WIDTH, 0.2, length, 0, -0.1, zc);
  box(scene, WALL, WIDTH, 0.2, length, 0, HEIGHT + 0.1, zc);
  box(scene, WALL, 0.4, HEIGHT, length, -WIDTH / 2, HEIGHT / 2, zc);
  box(scene, WALL, 0.4, HEIGHT, length, WIDTH / 2, HEIGHT / 2, zc);
  box(scene, WALL, WIDTH, HEIGHT, 0.4, 0, HEIGHT / 2, Z_START);
  box(scene, WALL, WIDTH, HEIGHT, 0.4, 0, HEIGHT / 2, Z_END);

  // Partial partitions between halls, leaving a central 5-unit opening.
  for (const z of PARTITIONS) {
    const offset = (WIDTH / 2 - 2.5) / 2 + 2.5;
    box(scene, WALL, WIDTH / 2 - 2.5, HEIGHT, 0.4, -offset, HEIGHT / 2, z);
    box(scene, WALL, WIDTH / 2 - 2.5, HEIGHT, 0.4, offset, HEIGHT / 2, z);
  }

  // Pedestals: [id, x, z, width]. Pieces reference them by id from the manifest.
  const layout: [string, number, number, number][] = [
    // Entrance pair: stego left, raptor right. Middle pair: Hatcher and the
    // T. rex facing each other across the open aisle.
    ["paleo-f", -4.9, 5, 5],
    ["paleo-g", 4.6, 1.6, 2.2],
    ["paleo-platform", -5.2, -5.2, 5],
    ["paleo-e", 5.2, -2.4, 5],
    ["paleo-a", -3.3, -8.6, 1.1], ["paleo-c", -3.3, -9.7, 1.1],
    ["paleo-b", 3.3, -13.6, 1.1], ["paleo-d", 3.3, -14.7, 1.1],
    ["flight-a", -3.3, -20.5, 1.1], ["flight-b", 3.3, -24, 1.1],
    ["flight-c", -5.4, -28.5, 5.8],
    ["flight-d", 5.2, -32, 5],
    // Hall III alternates sides like hall I. The Assyrian panel faces the
    // Louvre group across the aisle so neither half of the hall reads as empty.
    // Hall III is a hall of human-scale objects: a 1.3 m statue seen from the
    // 5 m that suited a mounted dinosaur is a speck. The pedestals sit closer
    // to the aisle so the visitor walks past them the way they would in a real
    // gallery — only the Louvre group, at 3.15 m, keeps its distance.
    ["ancient-a", -3.4, -40.5, 3],
    ["ancient-b", 4.1, -44, 2.4],
    ["ancient-c", -5.4, -47.5, 5.8],
    ["ancient-f", 4.4, -50.5, 2.6],
    ["ancient-d", -4.1, -53.5, 2.6],
    // The tour ends facing the Buddha rather than beside it: the rail stops
    // 2.5 m short so the piece is seen whole, which is the point of a finale.
    ["ancient-e", 0, -57, 4],
  ];

  const pedestals: Pedestal[] = [];
  for (const [id, x, z, width] of layout) {
    const height = width > 2 ? 0.35 : 1.05;
    const depth = width > 4 ? 3.6 : width > 2 ? 2.8 : width;
    box(scene, PLINTH, width, height, depth, x, height / 2, z);
    pedestals.push({ id, position: new THREE.Vector3(x, height, z), width });
  }
  buildLightRig(scene, pedestals);

  scene.add(new THREE.HemisphereLight(0x9aaccc, 0x14191f, 0.75));
  scene.fog = new THREE.Fog(0x0a0e14, 13, 32);
  scene.background = new THREE.Color(0x0a0e14);

  addHallSigns(scene);
  addCarpet(scene);

  return pedestals;
}


// Lighting rig: a FIXED pool of lights that follows the visitor instead of one
// light per pedestal. Three.js evaluates every light against every material in
// the fragment shader, so a light per pedestal is O(lights x meshes) and tanks
// the framerate. Keeping the pool size constant also avoids shader recompiles
// (which a visible=false toggle would trigger on every reassignment).
const SPOT_UNITS = 8;   // key lights, one per nearby pedestal
const FILL_UNITS = 6;   // cross fills: 2 per wide platform, 3 platforms at once

type SpotUnit = { light: THREE.SpotLight; target: THREE.Object3D; pedestal: Pedestal | null };
const spotUnits: SpotUnit[] = [];
const fillUnits: SpotUnit[] = [];
let rigPedestals: Pedestal[] = [];

function makeUnit(scene: THREE.Scene, intensity: number, distance: number, angle: number, penumbra: number): SpotUnit {
  const light = new THREE.SpotLight(0xffe2b8, intensity, distance, angle, penumbra, 1.2);
  light.intensity = 0;
  scene.add(light, light.target);
  return { light, target: light.target, pedestal: null };
}

function buildLightRig(scene: THREE.Scene, pedestals: Pedestal[]) {
  rigPedestals = pedestals;
  for (let i = 0; i < SPOT_UNITS; i++) spotUnits.push(makeUnit(scene, 70, 14, 0.8, 0.7));
  for (let i = 0; i < FILL_UNITS; i++) fillUnits.push(makeUnit(scene, 30, 13, 0.85, 0.9));
}

function aimSpot(unit: SpotUnit, pedestal: Pedestal) {
  const { x, z } = pedestal.position;
  unit.light.position.set(x, HEIGHT - 0.3, z);
  unit.target.position.set(x, 0, z);
  unit.light.intensity = 70;
  unit.pedestal = pedestal;
}

// Cross fills for wide platforms: the overhead cone only reaches the piece's
// back, so these light the ends (skull and tail) at eye level from the aisle.
function aimFills(wides: Pedestal[]) {
  for (const unit of fillUnits) unit.light.intensity = 0;
  wides.slice(0, FILL_UNITS / 2).forEach((pedestal, w) => {
    const { x, z } = pedestal.position;
    const aisle = Math.abs(x) < 0.1 ? 0 : x > 0 ? -1 : 1;
    const layout: [number, number, number, number][] = aisle === 0
      ? [[-4.2, 2.6, -1.7, 0], [4.2, 2.6, 1.7, 0]]
      : [[aisle * 3.8, 2.2, -aisle * 0.6, 0.6], [aisle * 3.8, -2.2, -aisle * 0.6, -0.6]];
    for (let i = 0; i < 2; i++) {
      const unit = fillUnits[w * 2 + i];
      const [fx, fz, tx, tz] = layout[i];
      unit.light.position.set(x + fx, 3.4, z + fz);
      unit.target.position.set(x + tx, 1.2, z + tz);
      unit.light.intensity = 30;
      unit.pedestal = pedestal;
    }
  });
}

// Reassign the pool to the pedestals nearest the camera. Cheap enough to run
// every frame, but only touches lights when the selection actually changes.
// Pedestals that must NOT get the cross fills. The fills light a skeleton's
// skull and tail from the aisle; on an untextured cast they come in frontally
// and flatten every relief — measured on the Augustus, removing them tripled
// the local contrast that makes the cuirass readable.
const NO_FILL = new Set(["ancient-e"]);

const _lightScratch: { p: Pedestal; d: number }[] = [];
const _chosen: Pedestal[] = [];
const _wides: Pedestal[] = [];
const _lastRigAt = new THREE.Vector3(Infinity, 0, 0);

export function updateLights(camera: THREE.Camera) {
  // Only re-sort when the visitor has actually moved: doing it every frame
  // allocated a fresh array of every pedestal each time, and that garbage was
  // enough to trigger GC pauses mid-walk.
  if (camera.position.distanceToSquared(_lastRigAt) < 0.25) return;
  _lastRigAt.copy(camera.position);

  _lightScratch.length = 0;
  for (const p of rigPedestals) {
    _lightScratch.push({ p, d: p.position.distanceToSquared(camera.position) });
  }
  _lightScratch.sort((a, b) => a.d - b.d);

  _chosen.length = 0;
  for (let i = 0; i < SPOT_UNITS && i < _lightScratch.length; i++) {
    _chosen.push(_lightScratch[i].p);
  }

  for (const pedestal of _chosen) {
    if (spotUnits.some((u) => u.pedestal === pedestal)) continue;
    const free = spotUnits.find((u) => !u.pedestal || !_chosen.includes(u.pedestal));
    if (free) aimSpot(free, pedestal);
  }
  for (const unit of spotUnits) {
    if (unit.pedestal && !_chosen.includes(unit.pedestal)) {
      unit.light.intensity = 0;
      unit.pedestal = null;
    }
  }

  _wides.length = 0;
  for (const p of _chosen) if (p.width > 2 && !NO_FILL.has(p.id)) _wides.push(p);
  const changed =
    _wides.length !== new Set(fillUnits.map((u) => u.pedestal).filter(Boolean)).size ||
    _wides.some((p) => !fillUnits.some((u) => u.pedestal === p));
  if (changed) aimFills(_wides);
}


// Physical signage: a hanging plaque over the entrance of hall I, and
// eye-level panels on both partition faces flanking each doorway — right
// where the visitor is already looking when crossing.
// Runner carpet: a straight axis from the entrance to the foot of the finale's
// pedestal. It does NOT follow the camera — the rail weaves between exhibits,
// but a gallery runner is architecture, and straight reads as intentional.
// 2.6 m wide clears every plinth (the closest, Ramesses', starts 1.9 m off
// the axis) and passes through the central openings of both partitions.
const CARPET_WIDTH = 2.6;
const CARPET_FROM_Z = 14.2;     // just inside the entrance wall
const CARPET_TO_Z = -55.6;      // front face of the finale's plinth (z −57, 2.8 deep)
const CARPET_TILE_M = 0.65;     // length of track one texture repeat covers

function makeCarpetTexture(): THREE.CanvasTexture {
  // Across the canvas = across the runner; the texture repeats along its length.
  const w = 512, h = Math.round((w * CARPET_TILE_M) / CARPET_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Deep wine, not gala red: a bright red reads as a film premiere. Slightly
  // cool on purpose — the spotlights are warm and push red towards terracotta.
  ctx.fillStyle = "#2c0913";
  ctx.fillRect(0, 0, w, h);

  // Woven texture: fine rows of slightly lighter and darker thread. A flat
  // colour under a spotlight is what gives a 3D carpet away.
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = y % 4 ? "rgba(70, 16, 30, 0.3)" : "rgba(14, 2, 6, 0.3)";
    ctx.fillRect(0, y, w, 1);
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255, 210, 200, 0.035)" : "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
  }

  // Edge bands: a darker outer margin and a thin muted-gold rule, the same
  // family as the brass nameplates and the interface accent.
  const band = (x: number, width: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, 0, width, h);
    ctx.fillRect(w - x - width, 0, width, h);
  };
  // Kept dark: under a spotlight a brighter gold glowed like a neon strip.
  band(0, 22, "#1a0508");
  band(26, 3, "#6b5226");
  band(33, 1, "#45351c");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  // The runner is always seen at a grazing angle; without anisotropic
  // filtering the gold rules smear into a blur a few metres ahead.
  texture.anisotropy = 8;
  return texture;
}

function addCarpet(scene: THREE.Scene) {
  const length = CARPET_FROM_Z - CARPET_TO_Z;
  const texture = makeCarpetTexture();
  texture.repeat.set(1, length / CARPET_TILE_M);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.96, metalness: 0 });
  // A 12 mm slab rather than a decal: it has an edge the light can catch, and
  // it cannot z-fight with the floor.
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(CARPET_WIDTH, 0.012, length), material);
  carpet.position.set(0, 0.006, (CARPET_FROM_Z + CARPET_TO_Z) / 2);
  carpet.name = "carpet";
  scene.add(carpet);
}

function makeSignTexture(kicker: string, title: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, 1024, 300);
  ctx.strokeStyle = "#33415a";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 1004, 280);

  ctx.textAlign = "center";
  ctx.fillStyle = "#e8c37a";
  ctx.font = "600 46px system-ui, sans-serif";
  ctx.fillText(kicker.toUpperCase().split("").join(" "), 512, 92);
  ctx.fillRect(452, 118, 120, 4);

  ctx.fillStyle = "#e6edf3";
  ctx.font = "700 92px system-ui, sans-serif";
  ctx.fillText(title, 512, 232);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const plaques: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];

// Text painted on canvases (hall signs, nameplates) is repainted when the
// language changes, swapping in a fresh texture.
const relabels: (() => void)[] = [];
onLangChange(() => {
  for (const relabel of relabels) relabel();
});

function paintedMap<M extends THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>(material: M, paint: () => THREE.CanvasTexture): M {
  material.map = paint();
  relabels.push(() => {
    material.map?.dispose();
    material.map = paint();
  });
  return material;
}

// "Sala II · Vuelo y espacio" -> kicker "Sala II", title "Vuelo y espacio".
function hallSign(hall: string) {
  return () => {
    const [kicker, title] = hallNames(hall)[lang()].split(" · ");
    return makeSignTexture(kicker, title);
  };
}

// How much room the orbit camera has around a point before it would reach a
// wall or a hall partition. The old flat 4.8 m cap only knew about the side
// walls, so orbiting a piece parked near a partition went straight through it.
export function clearance(point: THREE.Vector3): number {
  let room = Math.min(WIDTH / 2 - Math.abs(point.x), Z_START - point.z, point.z - Z_END);
  for (const z of PARTITIONS) room = Math.min(room, Math.abs(point.z - z));
  return room;
}

function addHallSigns(scene: THREE.Scene) {
  const rodMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3648, roughness: 0.5 });

  const hanging = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.0),
    paintedMap(new THREE.MeshBasicMaterial({ transparent: true }), hallSign("paleo")),
  );
  hanging.position.set(0, 3.0, 2.9);
  scene.add(hanging);
  plaques.push(hanging);
  for (const x of [-1.45, 1.45]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 8), rodMaterial);
    rod.position.set(x, 4.35, 2.9);
    scene.add(rod);
  }

  const doorwaySigns = [
    { hall: "flight", z: -17.2 },
    { hall: "ancient", z: -35.7 },
  ];
  for (const sign of doorwaySigns) {
    for (const x of [-4.2, 4.2]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 0.74),
        paintedMap(new THREE.MeshBasicMaterial({ transparent: true }), hallSign(sign.hall)),
      );
      panel.position.set(x, 2.4, sign.z);
      scene.add(panel);
      plaques.push(panel);
    }
  }
}

// Signs fade with distance so the one for the hall being entered dominates.
export function updateSigns(camera: THREE.Camera) {
  for (const plaque of plaques) {
    const distance = plaque.position.distanceTo(camera.position);
    plaque.material.opacity = THREE.MathUtils.clamp(1 - (distance - 11) / 7, 0.08, 1);
  }
}

// Small brass nameplate leaning on the pedestal's aisle-facing edge, engraved
// with the piece name — the museum convention for identifying items at a glance.
function makePlateTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  const brass = ctx.createLinearGradient(0, 0, 0, 128);
  brass.addColorStop(0, "#a8823f");
  brass.addColorStop(0.45, "#d9bc72");
  brass.addColorStop(0.55, "#c8a95e");
  brass.addColorStop(1, "#8a6a30");
  ctx.fillStyle = brass;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#5f4718";
  ctx.lineWidth = 4;
  ctx.strokeRect(7, 7, 498, 114);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#2b1f0a";
  let px = 44;
  ctx.font = `600 ${px}px Georgia, serif`;
  while (ctx.measureText(text).width > 460 && px > 24) {
    px -= 2;
    ctx.font = `600 ${px}px Georgia, serif`;
  }
  ctx.fillText(text, 256, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function addNamePlate(scene: THREE.Scene, names: Localized<string>, pedestal: Pedestal) {
  const wide = pedestal.width > 2;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(wide ? 0.9 : 0.55, wide ? 0.22 : 0.14),
    paintedMap(
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.55 }),
      () => makePlateTexture(names[lang()]),
    ),
  );

  // Lean the plate on the top edge that faces the walking aisle.
  const { x, y, z } = pedestal.position;
  const depth = pedestal.width > 4 ? 3.6 : wide ? 2.8 : pedestal.width;
  if (wide || Math.abs(x) < 0.1) {
    plate.position.set(x, y + 0.09, z + depth / 2 - 0.06);
  } else {
    const toAisle = x > 0 ? -1 : 1;
    plate.position.set(x + toAisle * (pedestal.width / 2 - 0.06), y + 0.09, z);
    plate.rotation.y = toAisle * Math.PI / 2;
  }
  plate.rotateX(-0.5);
  scene.add(plate);
}

// Floating dust: sells the museum mood for almost nothing.
export function createDust(scene: THREE.Scene): THREE.Points {
  const COUNT = 900;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * (WIDTH - 2);
    positions[i * 3 + 1] = Math.random() * HEIGHT;
    positions[i * 3 + 2] = Z_END + Math.random() * (Z_START - Z_END);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffe2b8,
    size: 0.02,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(geometry, material);
  scene.add(dust);
  return dust;
}

export function animateDust(dust: THREE.Points, dt: number) {
  const positions = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    let y = positions.getY(i) + dt * 0.05;
    if (y > HEIGHT) y = 0;
    positions.setY(i, y);
  }
  positions.needsUpdate = true;
}
