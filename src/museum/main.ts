import * as THREE from "three";
import { buildStage, createDust, animateDust, updateSigns, updateLights, addNamePlate, type Pedestal } from "./stage";
import { Rail } from "./rail";
import { Exhibits } from "./exhibits";
import { loadHall } from "./loader";
import { MANIFEST, HALLS, pieceInfo, hallName, type Calibration } from "./data";
import { Perf } from "./perf";
import { bindFullscreen } from "./fullscreen";
import { bindCredits } from "./credits";

const app = document.getElementById("app") as HTMLElement;
const params = new URLSearchParams(location.search);
const debugMode = params.has("debug");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 34);

const pedestals = buildStage(scene);
const pedestalById = new Map(pedestals.map((p) => [p.id, p]));
const dust = createDust(scene);

const rail = new Rail(renderer.domElement);
const exhibits = new Exhibits(camera, rail, renderer);
const perf = params.has("perf") ? new Perf(renderer, rail) : null;

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
// Only pieces whose optimized file exists are placed; a pedestal whose piece
// is still pending simply stays empty.
const readyPieces = MANIFEST.pieces.filter((p) => "output" in p && p.output);

function placePiece(gltf: { scene: THREE.Object3D }, piece: (typeof readyPieces)[number]) {
  const pedestal = pedestalById.get(piece.pedestal);
  if (!pedestal) return;
  const mount = mountPiece(gltf.scene, piece.id, piece.calibration, pedestal);
  exhibits.register(mount, pieceInfo(piece));
  addNamePlate(scene, piece.display.name, pedestal);
}

// Textures are only uploaded to the GPU the first time their material is
// rendered, which is a stall in the middle of the walk. Forcing every upload
// while the overlay is still up moves that cost somewhere invisible.
function warmTextures() {
  const seen = new Set<string>();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const material of [o.material].flat()) {
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const) {
        const texture = (material as THREE.MeshStandardMaterial)[key];
        if (texture && !seen.has(texture.uuid)) {
          seen.add(texture.uuid);
          renderer.initTexture(texture);
        }
      }
    }
  });
}

// Warm-up sweep. Compiling and uploading is not enough: the driver defers the
// real work until a material is first DRAWN, and while the loader is up the
// camera sits in the vestibule, so nothing beyond it is ever drawn. This flies
// a throwaway camera along the whole rail and renders each stop into a tiny
// offscreen target — every program, texture and buffer gets exercised for real
// while the overlay still hides it. Small target keeps each pass cheap; what
// matters is that the draw calls happen, not their resolution.
async function warmUpTour() {
  // Render to the CANVAS, not to a render target: Three.js compiles different
  // program variants for offscreen targets (tone mapping and output colour
  // space are skipped there), so warming a target warms the wrong shaders.
  // The overlay is covering the canvas, so none of this is seen. Pixel ratio
  // drops for the sweep — programs do not depend on resolution, only fill does.
  const probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.05, 60);
  const ratio = renderer.getPixelRatio();
  renderer.setPixelRatio(0.25);

  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const frame = async () => {
    renderer.render(scene, probe);
    await new Promise((r) => setTimeout(r, 0));
  };

  // Pass 1: down the rail, which covers the architecture, signs and floor.
  const STEPS = 20;
  for (let i = 0; i <= STEPS; i++) {
    const t = Math.min(0.995, i / STEPS);
    rail.curve.getPointAt(t, at);
    rail.curve.getPointAt(Math.min(t + 0.02, 1), ahead);
    probe.position.copy(at);
    probe.lookAt(ahead);
    updateLights(probe);
    await frame();
  }

  // Pass 2: aim straight at every exhibit. Looking only forward left the
  // pieces beside the aisle outside the frustum, so their geometry and
  // textures were still being uploaded mid-walk — which is the stutter.
  for (const { point, radius } of exhibits.centers()) {
    probe.position.set(point.x, point.y + radius * 0.4, point.z + radius * 2.5 + 1);
    probe.lookAt(point);
    updateLights(probe);
    await frame();
  }

  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  updateLights(camera);
}

async function loadHalls() {
  // Hall I first so its pieces are ready earliest, then the rest.
  const ordered = [
    ...readyPieces.filter((p) => p.hall === "paleo"),
    ...readyPieces.filter((p) => p.hall !== "paleo"),
  ];
  await loadHall(
    hallName("paleo"),
    ordered.map((p) => ({ url: `/models/${p.id}.glb`, bytes: p.output?.bytes ?? 1 })),
    (gltf, i) => placePiece(gltf, ordered[i]),
    async () => {
      await renderer.compileAsync(scene, camera, scene);
      warmTextures();
      await warmUpTour();
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

const timer = new THREE.Timer();
// Fixed 30 fps for everyone. On machines that cannot hold 60 the frame rate
// used to alternate between 16.7 and 33.3 ms, and that uneven pacing is what
// reads as stutter — a steady 30 looked smooth where a wobbling 40-60 did not.
// The limiter works on time, not on "every other vsync", so it holds the same
// cadence on 60, 120 and 144 Hz displays. ?fps=60 lifts it for measurements.
const TARGET_MS = 1000 / (Number(params.get("fps")) || 30);
const FRAME_SLACK_MS = 2;   // accept a vsync that lands a hair early
let nextFrameAt = 0;
let lastTick = 0;
let vsyncMs = 1000 / 60;    // refined from the display's real cadence below
let refreshesPerFrame = 2;

renderer.setAnimationLoop((now: number) => {
  // Track the display's refresh interval, ignoring stalls. The frame interval is
  // then a WHOLE number of refreshes: 144 Hz cannot do 33.3 ms, and a limiter
  // that aimed for it alternated 4 and 5 refreshes — the same uneven pacing
  // this whole limiter exists to remove. 5 refreshes every time is smoother.
  const tick = now - lastTick;
  lastTick = now;
  if (tick > 3 && tick < 25) vsyncMs += (tick - vsyncMs) * 0.05;
  // Hysteresis: at 165 Hz the ideal is 5.5 refreshes, and plain rounding
  // flipped between 5 and 6 on every wobble of the estimate.
  const ideal = TARGET_MS / vsyncMs;
  if (Math.abs(ideal - refreshesPerFrame) > 0.6) refreshesPerFrame = Math.max(1, Math.round(ideal));
  const frameMs = refreshesPerFrame * vsyncMs;

  if (now < nextFrameAt - FRAME_SLACK_MS) return;
  // Schedule from the ideal time, not from now, so the cadence stays even. If a
  // slow frame left us behind, restart one full interval from now instead of
  // catching up — catching up would fire the next frames back to back.
  nextFrameAt += frameMs;
  if (nextFrameAt < now) nextFrameAt = now + frameMs;
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  rail.update(camera, dt);
  exhibits.update();
  animateDust(dust, dt);
  updateHallLabel();
  updateNav();
  updateCredits(rail.t, exhibits.state);
  updateSigns(camera);
  updateLights(camera);
  renderer.render(scene, camera);
  perf?.update();
});

bindFullscreen(document.getElementById("fullscreen") as HTMLButtonElement);
const updateCredits = bindCredits(document.getElementById("credits") as HTMLElement);

void loadHalls();

// Debug hooks for automated tests and the calibration workflow:
//   __calibrate("mammoth-molar", { yaw: 1.2, size: 0.4 })
if (debugMode) {
  Object.assign(window, {
    __museum: { rail, exhibits, camera },
    __r: renderer,
    __perf: perf,
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

// Frame probe for performance work. Localhost only, and imported dynamically so
// a deployed build never even downloads it. Everything else lives in probe.ts.
if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  void import("./probe").then(({ mountProbe }) =>
    mountProbe({
      rail, camera, renderer,
      pieces: () => readyPieces.flatMap((p) => {
        const piece = exhibits.piece(p.id);
        return piece ? [{ id: p.id, center: piece.center }] : [];
      }),
    }),
  );
}
