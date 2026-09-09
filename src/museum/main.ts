import * as THREE from "three";
import { buildStage, createDust, animateDust, updateSigns, addNamePlate, type Pedestal } from "./stage";
import { Rail } from "./rail";
import { Exhibits } from "./exhibits";
import { loadHall } from "./loader";
import { MANIFEST, PLACEHOLDER, HALLS, pieceInfo, hallName, type Calibration } from "./data";

const app = document.getElementById("app") as HTMLElement;
const debugMode = new URLSearchParams(location.search).has("debug");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 120);

const pedestals = buildStage(scene);
const pedestalById = new Map(pedestals.map((p) => [p.id, p]));
const dust = createDust(scene);

const rail = new Rail(renderer.domElement);
const exhibits = new Exhibits(camera, rail, renderer);

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Generic mounting: one nested group per axis, applied inside-out (upAxisFix
// rights the scan, roll puts the base down, pitch fine-tunes, yaw orients it
// along the pedestal). Composing them in a single Euler was the original F1
// bug; nesting keeps every angle unambiguous. Calibration lives in the
// manifest as data — no geometry is ever re-exported.
type Mounted = { calibration: Calibration; settle: () => void; groups: THREE.Group[] };
const mounted = new Map<string, Mounted>();

function mountPiece(model: THREE.Object3D, id: string, calibration: Calibration, pedestal: Pedestal) {
  model.rotation.x = calibration.upAxisFix;

  const rollGroup = new THREE.Group();
  rollGroup.add(model);
  rollGroup.rotation.z = calibration.roll;

  const pitchGroup = new THREE.Group();
  pitchGroup.add(rollGroup);
  pitchGroup.rotation.x = calibration.pitch;

  const mount = new THREE.Group();
  mount.add(pitchGroup);
  mount.rotation.y = calibration.yaw;

  // Scale to the target size and rest the piece on the pedestal. Idempotent
  // so the debug calibration tool can re-run it after changing an angle.
  const settle = () => {
    mount.scale.setScalar(1);
    mount.position.set(0, 0, 0);

    const bounds = new THREE.Box3().setFromObject(mount, true);
    const size = bounds.getSize(new THREE.Vector3());
    mount.scale.setScalar(calibration.size / Math.max(size.x, size.y, size.z));

    const scaled = new THREE.Box3().setFromObject(mount, true);
    const center = scaled.getCenter(new THREE.Vector3());
    mount.position.set(
      pedestal.position.x - center.x + (calibration.offsetX ?? 0),
      pedestal.position.y - scaled.min.y + calibration.yOffset,
      pedestal.position.z - center.z + (calibration.offsetZ ?? 0),
    );
  };
  settle();

  mounted.set(id, { calibration, settle, groups: [mount, pitchGroup, rollGroup] });
  scene.add(mount);
  return mount;
}

// Gray placeholders on the pedestals whose pieces arrive in F3.
const SHAPES = [
  () => new THREE.IcosahedronGeometry(0.34, 1),
  () => new THREE.TorusKnotGeometry(0.22, 0.07, 90, 12),
  () => new THREE.ConeGeometry(0.28, 0.55, 24),
  () => new THREE.OctahedronGeometry(0.34),
];
// Only pieces whose optimized file exists (output written by the pipeline)
// claim a pedestal; the rest get a gray marker until their piece arrives.
const readyPieces = MANIFEST.pieces.filter((p) => "output" in p && p.output);
const assignedPedestals = new Set(readyPieces.map((p) => p.pedestal));
pedestals
  .filter((p) => !assignedPedestals.has(p.id))
  .forEach((pedestal, i) => {
    const shape = new THREE.Mesh(
      SHAPES[i % SHAPES.length](),
      new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.4, metalness: 0.1 }),
    );
    shape.position.copy(pedestal.position).y += 0.45;
    scene.add(shape);
    exhibits.register(shape, { ...PLACEHOLDER, id: `placeholder-${pedestal.id}` });
  });

// Real pieces, hall by hall, with one aggregated loading pass.
async function loadPaleoHall() {
  const pieces = readyPieces.filter((p) => p.hall === "paleo");
  await loadHall(
    hallName("paleo"),
    pieces.map((p) => ({ url: `/models/${p.id}.glb`, bytes: p.output?.bytes ?? 1 })),
    (gltf, i) => {
      const piece = pieces[i];
      const pedestal = pedestalById.get(piece.pedestal);
      if (!pedestal) return;
      const mount = mountPiece(gltf.scene, piece.id, piece.calibration, pedestal);
      exhibits.register(mount, pieceInfo(piece));
      addNamePlate(scene, piece.display.name, pedestal);
    },
  );
  rail.setPOIs(exhibits.centers());
}

// Bottom navigation buttons (Google Maps style): tour steps on the rail,
// zoom while inside an exhibit. Hold-to-repeat, plus keyboard equivalents,
// for people without a working mouse wheel.
function bindHold(el: HTMLElement, action: () => void) {
  let timer: number | undefined;
  const stop = () => {
    if (timer !== undefined) { clearInterval(timer); timer = undefined; }
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    timer = window.setInterval(action, 90);
  });
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointerleave", stop);
  el.addEventListener("pointercancel", stop);
}

const RAIL_STEP = 0.007;
const railNav = document.getElementById("railNav") as HTMLElement;
const zoomNav = document.getElementById("zoomNav") as HTMLElement;
bindHold(document.getElementById("navForward") as HTMLElement, () => rail.nudge(RAIL_STEP));
bindHold(document.getElementById("navBack") as HTMLElement, () => rail.nudge(-RAIL_STEP));
bindHold(document.getElementById("navZoomIn") as HTMLElement, () => exhibits.zoom(0.94));
bindHold(document.getElementById("navZoomOut") as HTMLElement, () => exhibits.zoom(1.06));

addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "w") rail.nudge(RAIL_STEP * 3);
  if (e.key === "ArrowDown" || e.key === "s") rail.nudge(-RAIL_STEP * 3);
  if (e.key === "+" || e.key === "=") exhibits.zoom(0.9);
  if (e.key === "-") exhibits.zoom(1.11);
});

// The clusters swap with the tour state; both hide mid-flight. The hint only
// applies while touring, so it leaves with the rail.
const hint = document.getElementById("hint") as HTMLElement;
let lastState = "";
function updateNav() {
  if (exhibits.state === lastState) return;
  lastState = exhibits.state;
  railNav.hidden = exhibits.state !== "rail";
  zoomNav.hidden = exhibits.state !== "exhibit";
  hint.hidden = exhibits.state !== "rail";
}

// Hall indicator in the HUD, driven by camera position.
const hallLabel = document.getElementById("hudHall") as HTMLElement;
function updateHallLabel() {
  const z = camera.position.z;
  const hall = HALLS.find((h) => z > h.untilZ) ?? HALLS[HALLS.length - 1];
  if (hallLabel.textContent !== hall.name) hallLabel.textContent = hall.name;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  rail.update(camera, dt);
  exhibits.update();
  animateDust(dust, dt);
  updateHallLabel();
  updateNav();
  updateSigns(camera);
  renderer.render(scene, camera);
});

void loadPaleoHall();

// Debug hooks for automated tests and the calibration workflow:
//   __calibrate("mammoth-molar", { yaw: 1.2, size: 0.4 })
if (debugMode) {
  Object.assign(window, {
    __museum: { rail, exhibits, camera },
    __calibrate: (id: string, changes: Partial<Calibration>) => {
      const entry = mounted.get(id);
      if (!entry) return "unknown id";
      Object.assign(entry.calibration, changes);
      const [mount, pitchGroup, rollGroup] = entry.groups;
      const model = rollGroup.children[0] as THREE.Object3D;
      model.rotation.x = entry.calibration.upAxisFix;
      rollGroup.rotation.z = entry.calibration.roll;
      pitchGroup.rotation.x = entry.calibration.pitch;
      mount.rotation.y = entry.calibration.yaw;
      entry.settle();
      return entry.calibration;
    },
  });
}
