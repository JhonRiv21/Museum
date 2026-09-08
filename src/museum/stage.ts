import * as THREE from "three";

// Builds the gray-box museum architecture: floor, walls, partial partitions,
// pedestals, and the "museum at night" lighting (warm spotlights + low ambient).

export type Pedestal = {
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

  // Pedestals: [x, z, width]. The first one is the Triceratops platform.
  const layout: [number, number, number][] = [
    [0, -5, 5],
    [-5, 1, 1.1], [5, 1, 1.1],
    [-5, -19, 1.1], [5, -19, 1.1], [-5, -29, 1.1], [5, -29, 1.1],
    [-5, -43, 1.1], [5, -43, 1.1], [0, -51, 1.1],
  ];

  const pedestals: Pedestal[] = [];
  for (const [x, z, width] of layout) {
    const height = width > 2 ? 0.35 : 1.05;
    box(scene, PLINTH, width, height, width > 2 ? 2.8 : width, x, height / 2, z);
    pedestals.push({ position: new THREE.Vector3(x, height, z), width });

    const spot = new THREE.SpotLight(0xffe2b8, 60, 12, 0.5, 0.65, 1.2);
    spot.position.set(x, HEIGHT - 0.3, z);
    spot.target.position.set(x, 0, z);
    scene.add(spot, spot.target);

    // The platform's overhead cone only reaches the piece's back: cross fills
    // from the walkway side light the ends (skull and tail) at eye level.
    if (width > 2) {
      for (const [fx, tx] of [[-4.2, -1.7], [4.2, 1.7]]) {
        const fill = new THREE.SpotLight(0xffe2b8, 26, 11, 0.6, 0.85, 1.1);
        fill.position.set(fx, 3.4, z + 2.6);
        fill.target.position.set(tx, 1.2, z);
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
  const signs = [
    { kicker: "Sala I", title: "Paleontología", z: 2.5 },
    { kicker: "Sala II", title: "Vuelo y espacio", z: -11.7 },
    { kicker: "Sala III", title: "El regreso al mar", z: -35.7 },
  ];
  const rodMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3648, roughness: 0.5 });

  for (const sign of signs) {
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.0),
      new THREE.MeshBasicMaterial({
        map: makeSignTexture(sign.kicker, sign.title),
        transparent: true,
      }),
    );
    plaque.position.set(0, 3.45, sign.z);
    scene.add(plaque);
    plaques.push(plaque);

    for (const x of [-1.45, 1.45]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 8), rodMaterial);
      rod.position.set(x, 4.58, sign.z);
      scene.add(rod);
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
