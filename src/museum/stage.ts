import * as THREE from "three";

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

const HEIGHT = 5.2;
const WIDTH = 16;
const Z_START = 9;
const Z_END = -57;

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
  for (const z of [-12, -36]) {
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
    ["paleo-platform", -5.2, -4, 5],
    ["paleo-e", 5.2, -4, 5],
    ["paleo-a", -5, -7.6, 1.1], ["paleo-b", 5, -7.6, 1.1],
    ["paleo-c", -5, -10, 1.1], ["paleo-d", 5, -10, 1.1],
    ["flight-a", -5, -19, 1.1], ["flight-b", 5, -19, 1.1],
    ["flight-c", -5, -29, 1.1], ["flight-d", 5, -29, 1.1],
    ["ocean-a", -5, -43, 1.1], ["ocean-b", 5, -43, 1.1], ["ocean-c", 0, -51, 1.1],
  ];

  const pedestals: Pedestal[] = [];
  for (const [id, x, z, width] of layout) {
    const height = width > 2 ? 0.35 : 1.05;
    const depth = width > 4 ? 3.6 : width > 2 ? 2.8 : width;
    box(scene, PLINTH, width, height, depth, x, height / 2, z);
    pedestals.push({ id, position: new THREE.Vector3(x, height, z), width });

    const spot = new THREE.SpotLight(0xffe2b8, 60, 12, 0.5, 0.65, 1.2);
    spot.position.set(x, HEIGHT - 0.3, z);
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);

    // The platform's overhead cone only reaches the piece's back: cross fills
    // light the ends (skull and tail) at eye level. Center platforms get a
    // symmetric cross from the walkway; wall-side platforms are lit from the
    // aisle, since their far side is inside the wall.
    if (width > 2) {
      const aisle = Math.abs(x) < 0.1 ? 0 : x > 0 ? -1 : 1;
      const fills: [number, number, number, number][] = aisle === 0
        ? [[-4.2, 2.6, -1.7, 0], [4.2, 2.6, 1.7, 0]]
        : [[aisle * 3.8, 2.2, -aisle * 0.6, 0.6], [aisle * 3.8, -2.2, -aisle * 0.6, -0.6]];
      for (const [fx, fz, tx, tz] of fills) {
        const fill = new THREE.SpotLight(0xffe2b8, 26, 11, 0.6, 0.85, 1.1);
        fill.position.set(x + fx, 3.4, z + fz);
        fill.target.position.set(x + tx, 1.2, z + tz);
        scene.add(fill, fill.target);
      }
    }
  }

  scene.add(new THREE.HemisphereLight(0x8899bb, 0x0c1016, 0.45));
  scene.fog = new THREE.Fog(0x0a0e14, 18, 55);
  scene.background = new THREE.Color(0x0a0e14);

  addHallSigns(scene);

  return pedestals;
}

// Physical signage: a hanging plaque over each hall entrance, so the visitor
// reads where they are entering without depending on the HUD label.
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
  ctx.fillText(kicker.toUpperCase().split("").join(" "), 512, 92);
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

function addHallSigns(scene: THREE.Scene) {
  const rodMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3648, roughness: 0.5 });

  // Sala I has no partition: its sign hangs over the entrance.
  const hanging = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.0),
    new THREE.MeshBasicMaterial({
      map: makeSignTexture("Sala I", "Paleontología"),
      transparent: true,
    }),
  );
  hanging.position.set(0, 3.45, 2.5);
  scene.add(hanging);
  plaques.push(hanging);
  for (const x of [-1.45, 1.45]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 8), rodMaterial);
    rod.position.set(x, 4.58, 2.5);
    scene.add(rod);
  }

  // Doorway halls: eye-level panels on BOTH partition faces flanking the
  // opening, right where the visitor is already looking when crossing.
  const doorwaySigns = [
    { kicker: "Sala II", title: "Vuelo y espacio", z: -11.7 },
    { kicker: "Sala III", title: "El regreso al mar", z: -35.7 },
  ];
  for (const sign of doorwaySigns) {
    for (const x of [-4.2, 4.2]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 0.74),
        new THREE.MeshBasicMaterial({
          map: makeSignTexture(sign.kicker, sign.title),
          transparent: true,
        }),
      );
      panel.position.set(x, 2.4, sign.z);
      scene.add(panel);
      plaques.push(panel);
    }
  }
}

// Signs fade with distance so the one for the hall you are entering dominates
// and far signs do not read on top of nearer pieces.
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

export function addNamePlate(scene: THREE.Scene, name: string, pedestal: Pedestal) {
  const wide = pedestal.width > 2;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(wide ? 0.9 : 0.55, wide ? 0.22 : 0.14),
    new THREE.MeshStandardMaterial({
      map: makePlateTexture(name),
      roughness: 0.35,
      metalness: 0.55,
    }),
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
