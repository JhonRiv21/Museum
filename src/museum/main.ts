import * as THREE from "three";
import { buildStage, createDust, animateDust, updateSigns } from "./stage";
import { Rail } from "./rail";
import { Exhibits } from "./exhibits";
import { loadWithProgress } from "./loader";
import { PIECES, HALLS } from "./data";

const app = document.getElementById("app") as HTMLElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 120);

const pedestals = buildStage(scene);
const dust = createDust(scene);

const rail = new Rail(renderer.domElement);
const exhibits = new Exhibits(camera, rail, renderer);

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Gray placeholders on the small pedestals; the platform is the Triceratops'.
const SHAPES = [
  () => new THREE.IcosahedronGeometry(0.34, 1),
  () => new THREE.TorusKnotGeometry(0.22, 0.07, 90, 12),
  () => new THREE.ConeGeometry(0.28, 0.55, 24),
  () => new THREE.OctahedronGeometry(0.34),
];
const placeholderMaterial = () =>
  new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.4, metalness: 0.1 });

const placeholderInfos = Object.values(PIECES).filter((p) => p.id.startsWith("placeholder"));
pedestals
  .filter((p) => p.width <= 2)
  .forEach((pedestal, i) => {
    const info = placeholderInfos[i % placeholderInfos.length];
    const shape = new THREE.Mesh(SHAPES[i % SHAPES.length](), placeholderMaterial());
    shape.position.copy(pedestal.position).y += 0.45;
    scene.add(shape);
    exhibits.register(shape, info);
  });

// Real Triceratops: normalize scale and orientation, rest it on the platform.
// One nested group per axis, applied inside-out: upAxisFix lays the spine
// horizontal, roll puts the feet down, yaw turns it along the platform.
// Composing them in a single Euler was the original bug; this is unambiguous.
// In F2 this calibration lives as data in the manifest.
const CALIBRATION = {
  upAxisFix: -Math.PI / 2,
  roll: Math.PI / 2,
  pitch: -0.3,
  yaw: Math.PI / 2,
  length: 4.6,
};

async function mountTriceratops() {
  const gltf = await loadWithProgress("/models/triceratops.glb", "Sala I · Paleontología");
  const model = gltf.scene;
  model.rotation.x = CALIBRATION.upAxisFix;

  const rollGroup = new THREE.Group();
  rollGroup.add(model);
  rollGroup.rotation.z = CALIBRATION.roll;

  const pitchGroup = new THREE.Group();
  pitchGroup.add(rollGroup);
  pitchGroup.rotation.x = CALIBRATION.pitch;

  const mount = new THREE.Group();
  mount.add(pitchGroup);
  mount.rotation.y = CALIBRATION.yaw;

  // Scale to target length and rest the feet on the platform. Idempotent so
  // the debug recalibration can re-run it after changing an angle.
  const settle = () => {
    mount.scale.setScalar(1);
    mount.position.set(0, 0, 0);

    const bounds = new THREE.Box3().setFromObject(mount, true);
    const size = bounds.getSize(new THREE.Vector3());
    mount.scale.setScalar(CALIBRATION.length / Math.max(size.x, size.z));

    const scaled = new THREE.Box3().setFromObject(mount, true);
    const center = scaled.getCenter(new THREE.Vector3());
    const platform = pedestals[0].position;
    mount.position.set(
      platform.x - center.x,
      platform.y - scaled.min.y,
      platform.z - center.z,
    );
  };
  settle();

  if (new URLSearchParams(location.search).has("debug")) {
    Object.assign(window, {
      __recalibrate: (pitch: number, roll?: number) => {
        pitchGroup.rotation.x = pitch;
        if (roll !== undefined) rollGroup.rotation.z = roll;
        settle();
      },
    });
  }

  scene.add(mount);
  exhibits.register(mount, PIECES.triceratops);
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

void mountTriceratops();

// Debug hook for automated tests.
if (new URLSearchParams(location.search).has("debug")) {
  Object.assign(window, { __museum: { rail, exhibits, camera } });
}
